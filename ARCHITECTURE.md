# TranscriptApp Architecture

Current-state inventory based on source inspection on 2026-07-14. This document describes confirmed behavior, not intended improvements.

## Overview

TranscriptApp is a multi-service transcription pipeline:

1. The Next.js frontend uploads audio/video files to the Go backend.
2. The backend stores the original file in MinIO bucket `uploads` and creates a parent point in Qdrant collection `file_metadata`.
3. The backend pushes a JSON job to Redis list `conversion_queue`.
4. The conversion worker forwards audio files or converts video to WAV, then pushes `diarization_queue`.
5. The diarization worker creates one Qdrant segment point per speaker segment and pushes one Redis job per segment to `transcription_queue`.
6. The transcription worker downloads the source audio, extracts each time slice, transcribes it, updates segment points, and marks the parent as `transcribed` when all segments are complete.
7. The frontend reads and mutates Qdrant directly for transcript listing, details, search, deletion, and transcript text edits.
8. The backend analysis endpoint sends concatenated transcript text to the analysis service and saves analysis fields back to the parent Qdrant payload.

## Compose Topology

Production-style `compose.yml` contains `minio`, `qdrant`, `redis`, `backend`, `gradio_convert`, `gradio_diarization`, `gradio_transcription`, and `dagster`. It does not include the frontend or analysis service, even though the backend analysis endpoint calls `http://analysis:7861/run/predict`.

Development `compose.dev.yml` contains `minio`, `qdrant`, `redis`, `backend`, `mock_convert`, `mock_diarization`, `mock_transcription`, and `analysis`. It replaces the real conversion, diarization, and transcription services with mock workers and does not include Dagster or the frontend.

All Compose services use a bridge network named `app_network`. Persistent named volumes are `minio_data`, `qdrant_data`, and, in production-style Compose only, `dagster_home`.

## Service Inventory

| Service | Source | Runtime | Entry Point | Ports | Used In | GPU | Purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `minio` | image `minio/minio:latest` | MinIO | `server /data --console-address ":9001"` | `9000`, `9001` | both | no | Object storage for uploaded and converted files. |
| `qdrant` | image `qdrant/qdrant:latest` | Qdrant | image default | `6333`, `6334` | both | no | Vector/metadata store, collection `file_metadata`. |
| `redis` | image `redis:7` | Redis | image default | `6379` | both | no | Pipeline queues. |
| `backend` | `backend/` | Go 1.24 image, module Go 1.23/toolchain 1.24.7 | `./backend` from `cmd/backend/main.go` | `8000` | both | no | Upload API, service initialization, analysis orchestration. |
| `gradio_convert` | `gradio/convert/` | Python 3.10 | `python -u convert.py` | `7860` exposed in Compose, app is a worker not HTTP server | prod-style only | no | Converts video files to mono 16 kHz WAV or forwards audio. |
| `gradio_diarization` | `gradio/diarization/` | Python 3.10, pyannote | `python -u diarization.py` | none | prod-style only | likely GPU useful, not configured | Loads pyannote and creates segment jobs. |
| `gradio_transcription` | `gradio/transcription/` | Python 3.10, torch/transformers | `python -u transcription.py` | none | prod-style only | uses CUDA if available, no Compose GPU stanza | Loads Whisper model and transcribes segments. |
| `analysis` | `gradio/analysis/` | Python 3.10 Flask | `python -u analysis.py` | `7861` | dev only | no | Gemini-backed transcript analysis endpoint. |
| `mock_convert` | `mock_workers/` | Python 3.11 | `python -u mock_convert.py` | none | dev only | no | Forwards conversion jobs without media processing. |
| `mock_diarization` | `mock_workers/` | Python 3.11 | `python -u mock_diarization.py` | none | dev only | no | Creates fixed fake segments and transcription jobs. |
| `mock_transcription` | `mock_workers/` | Python 3.11 | `python -u mock_transcription.py` | none | dev only | no | Writes fixed Dhivehi transcript text to segments. |
| `dagster` | `dagster/definitions.py` mounted into `python:3.10-slim` | Python/Dagster | shell installs packages, then `dagster dev` | host `3070` to container `3000` | prod-style only | no | Monitors Redis queue depths and Qdrant status assets. |
| Frontend | `frontend/transcription-frontend/` | Next.js 15 / React 19 | `npm run dev`, `npm run build`, `npm start` | default Next.js `3000` when run manually | neither Compose file | no | Upload/list/details/search/analysis/PDF UI. |

## Service Details

### Backend

Environment variables: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `QDRANT_HOST`, optional `REDIS_HOST`, `REDIS_PORT` via code defaults. Compose production-style omits `REDIS_HOST`/`REDIS_PORT`, but code defaults to `redis:6379`.

Dependencies: MinIO, Qdrant, Redis. Production-style Compose lists only `minio` under `depends_on`; development lists `minio`, `qdrant`, and `redis`.

Storage accessed: MinIO buckets `uploads` and `audio`; Qdrant collection `file_metadata`; Redis list `conversion_queue`.

Mounted volumes: none.

### Workers

`gradio_convert` consumes `conversion_queue` with `BLPOP timeout=10`, downloads `minio_url` via HTTP for video conversion, writes converted WAV back to MinIO bucket `uploads` as `{file_id}_converted.wav`, and produces `diarization_queue`.

`gradio_diarization` loads `pyannote/speaker-diarization-3.1` at process startup using `HUGGINGFACE_ACCESS_TOKEN`, consumes `diarization_queue` with blocking `BLPOP` and no timeout, downloads full audio from `minio_url`, writes RTTM output under `/app/outputs`, creates Qdrant segment points, and produces `transcription_queue`.

`gradio_transcription` loads model `Devion333/whisper-small-dv-syn` at process startup, falling back from `AutoProcessor`/`AutoModelForSpeechSeq2Seq` to Whisper-specific classes. It selects `cuda` if `torch.cuda.is_available()` else CPU. It atomically moves jobs from `transcription_queue` to `transcription_processing_queue`, downloads full audio for each segment, extracts the segment with `librosa`, applies `noisereduce`, transcribes, updates Qdrant, and marks the parent `transcribed` only after a paginated segment completion check succeeds. Failed jobs are retried and then moved to `transcription_failed_queue`.

`analysis` exposes Flask endpoints `POST /run/predict` and `GET /health`. It calls Gemini model `gemini-2.5-flash` when `GEMINI_API_KEY` is present, otherwise returns a fallback result.

## Storage Inventory

### Qdrant

Collection: `file_metadata`, created by the backend with vector size `512` and distance `Cosine`.

Point IDs: all backend and worker code uses a djb2-style string-to-uint64 hash when IDs are non-numeric. Segment IDs are string values like `{file_id}_seg_000`; point IDs are their numeric hash. Parent IDs are hashes of UUID `job_id` values.

Parent payload fields confirmed from backend upload:

`type`, `job_id`, `filename`, `minio_url`, `local_path`, `status`, `category`, `reference_number`, `notes`, `speakers`, `timestamp`.

Parent payload fields added later when behavior succeeds:

`segment_count`, `diarization_completed_at`, `transcription_completed_at`, `analysis_keywords`, `analysis_entities`, `analysis_summary`, `analysis_classification`, `analysis_english_translation`, `analysis_status`.

Segment payload fields confirmed:

`type`, `parent_job_id`, `segment_index`, `speaker`, `start_time`, `end_time`, `minio_url`, `transcript_text`, `embedding_generated`, `status`, `timestamp`, `transcription_completed_at`, `transcription_error`, `transcription_failed_at`.

Known status values: parent `uploaded`, `diarized`, `transcribed`; segment `pending_transcription`, `transcribed`, `transcription_failed`; frontend/backend also reference `processing`, `completed`, and `error` although workers do not set them.

### Redis

Queues:

| Queue | Producers | Consumers | Payload |
| --- | --- | --- | --- |
| `conversion_queue` | backend upload handler | conversion/mock conversion | `{"file_id","minio_url","filename"}` |
| `diarization_queue` | conversion/mock conversion | diarization/mock diarization | `{"file_id","minio_url"}` |
| `transcription_queue` | diarization/mock diarization and transcription retry handling | transcription worker via atomic move to `transcription_processing_queue`; mock transcription consumes directly in dev | `{"segment_id","file_id","start_time","end_time","speaker","minio_url","attempts"}` |
| `transcription_processing_queue` | transcription worker atomic move | transcription worker recovery/removal | same as `transcription_queue` |
| `transcription_failed_queue` | transcription worker after max attempts or malformed final failure | none confirmed | failed job payload with `error` and `failed_at` |

Conversion and diarization still use `LPUSH` and `BLPOP`, yielding LIFO-like processing semantics across each list. The real transcription worker uses a processing-queue pattern for retries and failed-job tracking; mock transcription remains intentionally lightweight for development.

### MinIO

Buckets are auto-created by the backend: `uploads` and `audio`. Both are given public read bucket policies by the backend.

Original uploads are stored in `uploads` as `{uuid}_{original_filename}`. Converted WAV files are stored in `uploads` as `{file_id}_converted.wav`. The `audio` bucket is created but no inspected code writes to it. Diarization RTTM files are written to local `/app/outputs`, mounted from `./gradio/diarization/outputs` in production-style Compose, not MinIO.

URL construction uses internal Docker URLs such as `http://minio:9000/uploads/...`; the frontend rewrites `http://minio:9000` to `MINIO_URL` for playback/download.

No confirmed MinIO cleanup occurs when frontend deletes Qdrant points.

## API Inventory

### Go Backend

`POST /upload`: implemented in `backend/internal/handlers/upload.go`, registered by Gin in `cmd/backend/main.go`. Accepts multipart `file`, `category`, `reference_number`, `notes`, `speakers`. Stores the file in MinIO, creates a Qdrant parent point, pushes `conversion_queue`, and returns upload metadata. Known errors: `400 {"error":"file not provided"}`, `500` for local save or MinIO upload failures. Qdrant/Redis failures are logged but do not fail the response.

`POST /transcripts/:job_id/analyse`: implemented in `backend/internal/handlers/analyse.go`, registered by Gin. Fetches segments from Qdrant, builds transcript lines, posts to `http://analysis:7861/run/predict`, saves analysis payload to the parent point asynchronously, and returns analysis JSON. Known errors include missing job ID, no segments, no transcribed text, analysis service unavailable/error, invalid/empty analysis response, and parse failure.

`GET /transcripts` and `GET /transcripts/stats`: implemented in `cmd/backend/main.go` and service helpers, but registered after blocking `r.Run(":8000")`. They are unreachable in normal execution as currently written.

Unused handler functions in `backend/internal/handlers/transcript_handlers.go` mention `/api/stats` and `/api/transcripts`, but they are not registered.

### Next.js API

`POST /api/export-pdf`: implemented in `frontend/transcription-frontend/src/app/api/export-pdf/route.ts`. Accepts JSON `{parent, segments, format, analysisData}` and uses Puppeteer to render a PDF. Returns `application/pdf` or `500 {"error":...}`.

## Frontend Inventory

Routes:

| Route | File | Purpose | Primary data access |
| --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Dashboard/stats and navigation | Direct Qdrant collection and scroll APIs. |
| `/Transcripts` | `src/app/Transcripts/page.tsx` | Upload form | Go backend `POST /upload`. |
| `/Transcripts/List` | `src/app/Transcripts/List/page.tsx` | Paginated list, filters, deletion | Direct Qdrant scroll and delete APIs. |
| `/Transcripts/Details?job_id=...` | `src/app/Transcripts/Details/page.tsx` | Metadata, segment transcript editing, playback, PDF export | Direct Qdrant scroll/payload APIs, MinIO playback/download, Next.js PDF API. |
| `/Transcripts/Analysis?job_id=...` | `src/app/Transcripts/Analysis/page.tsx` | Analysis trigger and results | Direct Qdrant reads, Go backend analysis endpoint, Next.js PDF API. |
| `/Search` | `src/app/Search/page.tsx` | Transcript text search | Direct Qdrant scroll filters. |
| `/api/export-pdf` | `src/app/api/export-pdf/route.ts` | Server-side PDF generation | Puppeteer only; called by frontend helper. |

Configuration constants are hard-coded in `src/config.ts`: `QDRANT_URL='http://localhost:6333'`, `BACKEND_URL='http://localhost:8000'`, `MINIO_URL='http://localhost:9000'`.

The frontend is not included in either Compose file. It relies heavily on direct browser access to Qdrant and MinIO.

## Docker and Deployment Notes

Dockerfiles:

| Dockerfile | Base Image | Notes |
| --- | --- | --- |
| `backend/Dockerfile` | `golang:1.24-bullseye` | Single-stage build, runs compiled backend. |
| `gradio/convert/Dockerfile` | `python:3.10-slim` | Installs `ffmpeg` and Python deps. |
| `gradio/diarization/Dockerfile` | `python:3.10-slim` | Installs `ffmpeg`, build tools, pyannote/torch deps. |
| `gradio/transcription/Dockerfile` | `python:3.10-slim` | Installs torch/transformers/audio deps; no system ffmpeg install. |
| `gradio/analysis/Dockerfile` | `python:3.10-slim` | Flask/Gemini service. |
| `mock_workers/Dockerfile` | `python:3.11-slim` | Shared image for all mock workers. |

No service defines Docker health checks. Restart policies are `unless-stopped` for persistent services/dev mocks and `on-failure:5` for production-style real workers and Dagster. Compose `depends_on` does not wait for service readiness.

Deployment blockers include hard-coded credentials in Compose, public MinIO bucket policies, direct browser access to Qdrant, host-specific transcription model mount `/data/911/911_whisper_model:/app/models`, no GPU runtime configuration, no frontend container, and production-style Compose missing the `analysis` service required by the backend analysis endpoint.

## Transcription Worker Preliminary Profile

The transcription worker is a single-stage `python:3.10-slim` image that installs `transformers==4.52.4`, `torch==2.6.0`, `torchaudio==2.6.0`, `librosa`, `soundfile`, `redis`, `requests`, `numpy`, `accelerate`, `sentencepiece`, `protobuf`, `datasets`, `pyannote.audio==3.1.1`, and `noisereduce`.

It loads `Devion333/whisper-small-dv-syn` from Hugging Face at process startup despite a Compose mount at `/app/models` and a commented local checkpoint path. The largest likely image/cache contributors are PyTorch, torchaudio, transformers model downloads, datasets, pyannote/audio dependencies, and any Hugging Face cache generated at runtime. The service can run on CPU but is expected to benefit from GPU; Compose does not request GPU devices.

## Key Risks and Unknowns

Confirmed risks:

| Area | Risk |
| --- | --- |
| Backend routing | `GET /transcripts` and `/transcripts/stats` are unreachable because they are registered after `r.Run`. |
| Analysis topology | Production-style Compose lacks `analysis`, but backend calls `http://analysis:7861`. |
| Public data access | Frontend directly accesses Qdrant and MinIO; MinIO buckets are public-read. |
| Data deletion | Frontend deletes Qdrant points only; MinIO objects and RTTM files are not cleaned up. |
| Queue reliability | Jobs are removed before processing and generally not retried after failure. |
| Status/schema mismatch | Code uses both `segment_count` and `segments`, string and numeric speaker counts, and status values `completed`/`transcribed`. |
| Deployment | No GPU runtime stanza, no health checks, no frontend container, hard-coded localhost frontend config. |

Unanswered questions requiring runtime verification:

1. Whether the real diarization parent status update endpoint succeeds against the installed Qdrant version.
2. Whether direct Qdrant text `match` search behaves as the UI expects for partial transcript text.
3. Whether Puppeteer PDF generation works in the target runtime without extra browser/system packages.
4. Whether CORS settings permit the intended browser-to-Qdrant and browser-to-MinIO deployment topology.
5. Whether the intended deployment should expose Qdrant publicly or introduce a backend API contract first.
