# TranscriptApp System Inventory Audit

Audit date: 2026-07-14. Scope: read-only source inspection plus creation of this report and `ARCHITECTURE.md`. No worker, build, Docker, model download, or runtime data command was executed.

## Evidence Sources

Inspected files:

| Area | Files |
| --- | --- |
| Operator notes | `AGENTS.md`, `README.md` |
| Compose | `compose.yml`, `compose.dev.yml` |
| Backend | `backend/Dockerfile`, `backend/go.mod`, `backend/cmd/backend/main.go`, `backend/internal/handlers/*.go`, `backend/internal/services/*.go` |
| Workers | `gradio/convert/*`, `gradio/diarization/*`, `gradio/transcription/*`, `gradio/analysis/*` |
| Mock workers | `mock_workers/*` |
| Dagster | `dagster/definitions.py`, `backend/dagster/definitions.py` |
| Frontend | `frontend/transcription-frontend/package.json`, `next.config.ts`, `src/config.ts`, `src/app/**`, `src/components/**`, `src/lib/**` |

`.env` was not copied into this audit because it can contain secrets. Its presence and references were inferred from Compose and source files only.

## Repository Structure

Relevant top-level structure:

| Path | Purpose |
| --- | --- |
| `compose.yml` | Production-style infrastructure and real ML worker stack. |
| `compose.dev.yml` | Lightweight dev stack using mock conversion/diarization/transcription workers plus analysis service. |
| `backend/` | Go backend. |
| `gradio/convert/` | Real conversion worker. |
| `gradio/diarization/` | Real pyannote diarization worker. |
| `gradio/transcription/` | Real Whisper transcription worker. |
| `gradio/analysis/` | Flask Gemini analysis service. |
| `mock_workers/` | Development workers with schema-compatible fake output. |
| `dagster/` | Active Dagster definitions mounted by `compose.yml`. |
| `backend/dagster/` | Stale or unused Dagster definitions; not mounted by Compose. |
| `frontend/transcription-frontend/` | Next.js frontend, not in Compose. |
| `models/pyannote/` | Local Hugging Face cache/model material; mounted into diarization service. |

## Service Inventory

### `minio`

Source: image `minio/minio:latest` in both Compose files.

Purpose: object storage for original uploads and converted audio.

Runtime/language: MinIO server.

Entry point: `server /data --console-address ":9001"`.

Ports: internal/external `9000` API, `9001` console.

Dependencies: none.

Environment variables: `MINIO_ROOT_USER=minio`, `MINIO_ROOT_PASSWORD=minio123`, `MINIO_API_CORS_ALLOW_ORIGIN=*`.

Mounted volumes: named volume `minio_data:/data`.

Queues consumed/produced: none.

Storage systems accessed: local volume only.

GPU required: no.

Used in: both.

Evidence: `compose.yml:4-19`, `compose.dev.yml:13-28`.

### `qdrant`

Source: image `qdrant/qdrant:latest` in both Compose files.

Purpose: metadata, parent transcript points, segment points, and analysis payload fields.

Runtime/language: Qdrant.

Entry point: image default.

Ports: internal/external `6333` HTTP, `6334` gRPC.

Dependencies: none.

Environment variables: none in Compose.

Mounted volumes: named volume `qdrant_data:/qdrant/storage`.

Queues consumed/produced: none.

Storage systems accessed: local volume.

GPU required: no.

Used in: both.

Evidence: `compose.yml:21-31`, `compose.dev.yml:30-40`.

### `redis`

Source: image `redis:7` in both Compose files.

Purpose: job queues.

Runtime/language: Redis.

Entry point: image default.

Ports: internal/external `6379`.

Dependencies: none.

Environment variables: none.

Mounted volumes: none.

Queues: stores `conversion_queue`, `diarization_queue`, `transcription_queue`.

GPU required: no.

Used in: both.

Evidence: `compose.yml:100-107`, `compose.dev.yml:42-49`.

### `backend`

Source directory: `backend/`.

Purpose: initialize MinIO/Qdrant/Redis, accept uploads, push conversion jobs, trigger analysis.

Runtime/language: Go; Docker base `golang:1.24-bullseye`; `go.mod` declares `go 1.23.0` and `toolchain go1.24.7`.

Entry point: `cmd/backend/main.go`, built as `backend`, run by `CMD ["./backend"]`.

Ports: `8000` internal/external.

Dependencies: code requires MinIO, Qdrant, and Redis at startup. Production-style Compose only lists `minio`; dev Compose lists all three.

Environment variables: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `QDRANT_HOST`; code also reads `REDIS_HOST`, `REDIS_PORT` with defaults.

Mounted volumes: none.

Queues consumed: none.

Queues produced: `conversion_queue`.

Storage systems accessed: MinIO, Qdrant, Redis.

GPU required: no.

Used in: both.

Evidence: `backend/Dockerfile`, `backend/cmd/backend/main.go`, `backend/internal/services/init.go`, `backend/internal/handlers/upload.go`, `compose.yml:109-123`, `compose.dev.yml:51-67`.

### `gradio_convert`

Source directory: `gradio/convert/`.

Purpose: convert video uploads to WAV, or forward already-audio uploads.

Runtime/language: Python 3.10, `ffmpeg`, `redis`, `requests`, `minio`.

Entry point: `python -u convert.py`.

Ports: `7860:7860` in Compose, but no HTTP server is defined in `convert.py`.

Dependencies: MinIO, Redis.

Environment variables: `REDIS_HOST`, `REDIS_PORT`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `DAGSTER_ENABLED`, `DAGSTER_API_URL`.

Mounted volumes: none.

Queues consumed: `conversion_queue` via `BLPOP timeout=10`.

Queues produced: `diarization_queue` via `LPUSH`.

Storage systems accessed: MinIO bucket `uploads`; HTTP download from `minio_url`.

GPU required: no.

Used in: production-style Compose only.

Evidence: `compose.yml:33-51`, `gradio/convert/Dockerfile`, `gradio/convert/convert.py`.

### `gradio_diarization`

Source directory: `gradio/diarization/`.

Purpose: pyannote speaker diarization, segment point creation, transcription job creation.

Runtime/language: Python 3.10, pyannote, torch, torchaudio, librosa.

Entry point: Compose command `python -u diarization.py`; Dockerfile default `python3 diarization.py`.

Ports: none.

Dependencies: Redis, Qdrant; code also downloads audio via `minio_url` HTTP and requires `HUGGINGFACE_ACCESS_TOKEN`.

Environment variables: `REDIS_HOST`, `REDIS_PORT`, `QDRANT_HOST`, `QDRANT_COLLECTION`, `HUGGINGFACE_ACCESS_TOKEN`, `DAGSTER_ENABLED`, `DAGSTER_API_URL`.

Mounted volumes: `./gradio/diarization/outputs:/app/outputs`, `./models/pyannote:/root/.cache/huggingface/hub`.

Queues consumed: `diarization_queue` via blocking `BLPOP` without timeout.

Queues produced: `transcription_queue` via `LPUSH`.

Storage systems accessed: Qdrant, Redis, HTTP-accessible MinIO objects, local outputs mount.

GPU required: not explicitly configured; pyannote/torch can use GPU if available, but code does not move pipeline to GPU.

Used in: production-style Compose only.

Evidence: `compose.yml:53-74`, `gradio/diarization/Dockerfile`, `gradio/diarization/diarization.py`.

### `gradio_transcription`

Source directory: `gradio/transcription/`.

Purpose: Whisper segment transcription and segment/parent status updates.

Runtime/language: Python 3.10, transformers, torch, torchaudio, librosa, noisereduce.

Entry point: `python -u transcription.py`.

Ports: none.

Dependencies: Redis, Qdrant, MinIO by HTTP URL.

Environment variables: `REDIS_HOST`, `REDIS_PORT`, `QDRANT_HOST`, `QDRANT_COLLECTION`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `DAGSTER_ENABLED`, `DAGSTER_API_URL`; Compose also loads `.env`.

Mounted volumes: `/data/911/911_whisper_model:/app/models`.

Queues consumed: `transcription_queue` via `BLPOP timeout=10`.

Queues produced: none.

Storage systems accessed: Qdrant, Redis, HTTP-accessible MinIO objects.

GPU required: code uses CUDA if available but falls back to CPU. Compose has no GPU runtime/device reservation.

Used in: production-style Compose only.

Evidence: `compose.yml:76-98`, `gradio/transcription/Dockerfile`, `gradio/transcription/transcription.py`, `gradio/transcription/requirements.txt`.

### `analysis`

Source directory: `gradio/analysis/`.

Purpose: Flask-compatible analysis service using Gemini, with Gradio-style `/run/predict` envelope.

Runtime/language: Python 3.10 Flask, `google-generativeai`.

Entry point: `python -u analysis.py`.

Ports: `7861:7861` in dev Compose.

Dependencies: Gemini API if configured.

Environment variables: `GEMINI_API_KEY`; dev Compose also loads `.env`.

Mounted volumes: none.

Queues consumed/produced: none.

Storage systems accessed: none directly.

GPU required: no.

Used in: development Compose only, despite backend analysis endpoint relying on service DNS name `analysis`.

Evidence: `compose.dev.yml:116-127`, `gradio/analysis/Dockerfile`, `gradio/analysis/analysis.py`.

### Mock Workers

Source directory: `mock_workers/`.

Runtime/language: Python 3.11.

Build: shared `mock_workers/Dockerfile`, command overridden per service.

Used in: development Compose only.

`mock_convert`: consumes `conversion_queue`, produces `diarization_queue`, no storage except Redis.

`mock_diarization`: consumes `diarization_queue`, upserts fake segment points to Qdrant, updates parent payload, produces `transcription_queue`.

`mock_transcription`: consumes `transcription_queue`, updates segment payloads with fake Dhivehi text, marks parent `transcribed` when all sibling segments are transcribed.

Evidence: `compose.dev.yml:69-114`, `mock_workers/*.py`, `mock_workers/qdrant_helpers.py`.

### `dagster`

Source directory: `dagster/` mounted into `/opt/dagster/app`.

Purpose: asset monitoring and Redis queue sensor.

Runtime/language: `python:3.10-slim`; packages installed at container startup.

Entry point: shell command installs `dagster dagster-webserver dagster-postgres redis requests` then runs `dagster dev -h 0.0.0.0 -p 3000 -f /opt/dagster/app/definitions.py`.

Ports: host `3070` to container `3000`.

Dependencies: Redis, Qdrant.

Environment variables: `DAGSTER_HOME`, `REDIS_HOST`, `REDIS_PORT`, `QDRANT_HOST`.

Mounted volumes: `./dagster:/opt/dagster/app`, `dagster_home:/opt/dagster/dagster_home`.

Queues consumed: monitors lengths of `conversion_queue`, `diarization_queue`, `transcription_queue` with `LLEN`; does not consume jobs.

Queues produced: none.

Storage systems accessed: Qdrant, Redis, Dagster home volume.

GPU required: no.

Used in: production-style Compose only.

Evidence: `compose.yml:125-146`, `dagster/definitions.py`.

## End-to-End Data Flow

### Stage 1: Upload

Initiating endpoint: `POST /upload`, `backend/internal/handlers/upload.go`.

Frontend call site: `src/app/Transcripts/page.tsx`, `fetch(`${BACKEND_URL}/upload`, { method: "POST", body: formData })`.

Input body: multipart form with `file`, `category`, `reference_number`, `notes`, `speakers`.

MinIO behavior: backend saves local temp file `/tmp/{uuid}_{filename}`, uploads to bucket `uploads`, object name `{uuid}_{filename}`, content type `application/octet-stream`, then constructs `http://{MINIO_ENDPOINT}/uploads/{objectName}`.

Qdrant parent point: collection `file_metadata`, ID `hashStringToUint64(uuid)`, 512-dimensional zero vector.

Parent payload fields: `type=parent`, `job_id`, `filename`, `minio_url`, `local_path`, `status=uploaded`, `category`, `reference_number`, `notes`, `speakers`, `timestamp`.

Output response: JSON with `file_id`, `filename`, `minio_url`, `local_path`, `status`, `category`, `reference_number`, `notes`, `speakers`.

Queue produced: `conversion_queue` item `{"file_id":...,"minio_url":...,"filename":...}`.

Error handling: missing file returns 400; local save and MinIO upload return 500; Qdrant insert and Redis push failures are logged but upload still returns 200.

Next stage: conversion worker.

Confirmed vs inferred: all above confirmed in source.

### Stage 2: Conversion

Initiating event: `conversion_queue` item.

Consumer: `gradio/convert/convert.py` or `mock_workers/mock_convert.py`.

Queue behavior: real worker `BLPOP("conversion_queue", timeout=10)`, then JSON decode. Mock uses same timeout.

Input object shape: `file_id`, `minio_url`, optional/expected `filename`.

Real audio path behavior: if filename does not end with a video extension, no MinIO rewrite; produce `diarization_queue` with original `minio_url`.

Real video path behavior: download `minio_url` with `requests.get`, convert with `ffmpeg -vn -acodec pcm_s16le -ar 16000 -ac 1`, upload to MinIO bucket `uploads` as `{file_id}_converted.wav`, construct `http://{MINIO_ENDPOINT}/uploads/{file_id}_converted.wav`.

Output object shape: `{"file_id":...,"minio_url":...}` pushed to `diarization_queue`.

Qdrant updates: none confirmed.

Status transitions: no parent status update to `converted` is implemented.

Error handling/retry: conversion function catches and logs exceptions. Failed conversion returns without pushing the next queue. Because the Redis item was already popped, no retry/dead-letter is implemented.

Next stage: diarization.

Confirmed vs inferred: use of `uploads` bucket for converted audio is confirmed; whether all non-video audio is accepted by downstream code is inferred from extension logic.

### Stage 3: Diarization

Initiating event: `diarization_queue` item.

Consumer: `gradio/diarization/diarization.py` or `mock_workers/mock_diarization.py`.

Queue behavior: real worker blocks indefinitely on `BLPOP("diarization_queue")`; mock uses `BLPOP timeout=10`.

Input object shape: `file_id`, `minio_url`.

MinIO behavior: downloads full audio from `minio_url` by HTTP into `/tmp/{file_id}.wav`. It does not create per-segment audio objects.

Local output behavior: writes RTTM to `outputs/{base}_{timestamp}.rttm`, mounted as `./gradio/diarization/outputs:/app/outputs` in production-style Compose.

Qdrant parent update intended by real worker: `status=diarized`, `segment_count`, `diarization_completed_at` for parent point ID `hash(file_id)`. Risk: real code posts to `/collections/{collection}/points/?wait=true` with body `{"points":[numeric_id],"payload":...}`, which does not match the payload update endpoint used elsewhere.

Qdrant segment points: one per merged segment. Segment ID string `{file_id}_seg_{idx:03d}` hashed to uint64. Payload fields: `type=segment`, `parent_job_id`, `segment_index`, `speaker`, `start_time`, `end_time`, `minio_url`, `transcript_text=null`, `embedding_generated=false`, `status=pending_transcription`, `timestamp`.

Output queue object shape: `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url`.

Error handling/retry: top-level worker catches exceptions, logs, sleeps 5 seconds. Popped job is not requeued.

Next stage: transcription.

Confirmed vs inferred: segment schema and queue shape are confirmed. Success of the parent metadata update is not confirmed and requires runtime verification.

### Stage 4: Transcription

Initiating event: `transcription_queue` item.

Consumer: `gradio/transcription/transcription.py` or `mock_workers/mock_transcription.py`.

Queue behavior: real and mock workers use `BLPOP("transcription_queue", timeout=10)`.

Input object shape: `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url`.

Model lifecycle: real worker loads the Whisper model once at process startup before entering the loop. Model path is currently `Devion333/whisper-small-dv-syn`; a local checkpoint path `/app/models/checkpoint-3000` is commented out.

Audio behavior: downloads full `minio_url` with `requests.get`, writes a temporary WAV, loads it with `librosa.load(..., sr=16000)`, denoises with `noisereduce`, slices by `start_time`/`end_time`, then deletes temp file.

Qdrant segment update: gets point by `hash(segment_id)`, merges existing payload, sets `transcript_text`, `status=transcribed`, `transcription_completed_at`, and upserts the entire point with existing vector.

Parent completion check: scrolls Qdrant for points with `parent_job_id=file_id`, limit 100, and checks every returned point has `status=transcribed`. The filter omits `type=segment` and the limit could miss transcripts with more than 100 segments.

Qdrant parent update: gets parent point by `hash(file_id)`, merges payload, sets `status=transcribed`, `transcription_completed_at`, and upserts entire point.

Output object shape: no queue output. Qdrant becomes the output store.

Error handling/retry: download or transcription failures are logged and the job is skipped. No retry/dead-letter is implemented.

Next stage: frontend display and optional analysis.

Confirmed vs inferred: confirmed by source.

### Stage 5: Analysis

Initiating endpoint: `POST /transcripts/:job_id/analyse`.

Frontend call site: `src/app/Transcripts/Analysis/page.tsx`.

Backend input: path parameter `job_id`; no request body.

Qdrant read: scroll segments with filter `type=segment` and `parent_job_id=jobID`, limit 1000.

Backend transcript construction: sort by `segment_index`, skip empty text and literal `Transcription pending...`, join lines as `{speaker}: {text}`.

Analysis service call: `POST http://analysis:7861/run/predict` with body `{"data":[fullTranscript]}`.

Analysis service output: `{"data":["{...json string...}"]}` with keys `english_translation`, `keywords`, `entities`, `summary`, `classification`.

Qdrant parent update: asynchronous `POST /points/payload?wait=true` by filter `type=parent` and `job_id`, payload `analysis_keywords`, `analysis_entities`, `analysis_summary`, `analysis_classification`, `analysis_english_translation`, `analysis_status=complete`.

Backend response: `keywords`, `entities`, `summary`, `classification`, `english_translation`.

Error handling: backend returns 404 when no segments exist, 400 when no transcribed text remains, 500 for Qdrant/analysis HTTP/parse errors. Analysis service returns 400 for missing transcript input, 502 for non-JSON Gemini output, and 200 fallback data for generic errors.

Next stage: frontend analysis view and optional PDF export.

Confirmed vs inferred: confirmed behavior, except production availability of `analysis` service is contradicted by Compose.

### Stage 6: Export

Initiating event: frontend user opens PDF modal and selects segmented or paragraph format.

Next.js API: `POST /api/export-pdf`.

Input object shape: `parent`, `segments`, `format`, optional `analysisData`.

Generated output: PDF response with filename `{safeFilename}_transcript.pdf`.

Storage behavior: no MinIO or Qdrant writes.

Error handling: non-OK response parsed by `generateTranscriptPdf`; API returns 500 JSON on exception.

Confirmed vs inferred: confirmed by frontend source. Runtime browser/package requirements need deployment verification.

## API Inventory

### Go Backend APIs

#### `POST /upload`

Implementation: `backend/internal/handlers/upload.go`, registered in `backend/cmd/backend/main.go`.

Request: multipart form fields `file`, `category`, `reference_number`, `notes`, `speakers`.

Response success:

```json
{
  "file_id": "uuid",
  "filename": "original.ext",
  "minio_url": "http://minio:9000/uploads/uuid_original.ext",
  "local_path": "/tmp/uuid_original.ext",
  "status": "uploaded",
  "category": "...",
  "reference_number": "...",
  "notes": "...",
  "speakers": "..."
}
```

Storage/queues accessed: MinIO `uploads`, Qdrant `file_metadata`, Redis `conversion_queue`.

Frontend call sites: `src/app/Transcripts/page.tsx`.

Known error responses: 400 `file not provided`; 500 `failed to save file`; 500 `failed to upload to MinIO: ...`. Redis/Qdrant failures are logged only.

#### `POST /transcripts/:job_id/analyse`

Implementation: `backend/internal/handlers/analyse.go`, registered in `backend/cmd/backend/main.go`.

Request: path `job_id`; no body.

Response success:

```json
{
  "keywords": [],
  "entities": {},
  "summary": "...",
  "classification": "...",
  "english_translation": "..."
}
```

Storage/queues accessed: Qdrant segment scroll, external HTTP call to `analysis`, Qdrant parent payload update. No Redis.

Frontend call sites: `src/app/Transcripts/Analysis/page.tsx`.

Known error responses: 400 missing job ID, 400 no transcribed text, 404 no segments, 500 failed Qdrant fetch, 500 analysis service unavailable/error, 500 failed response parse.

#### `GET /transcripts`

Implementation: `backend/cmd/backend/main.go` helper plus `backend/internal/services/transcript_list.go`.

Request: optional query `status`.

Response shape: array of `TranscriptListItem` with `id`, `filename`, `category`, `reference_number`, `status`, `timestamp`, `duration`, `speakers`, `segments`, `notes`, `minio_url`.

Storage accessed: Qdrant scroll filter `type=parent`.

Frontend call sites: none confirmed.

Known error responses: 405 non-GET, 500 Qdrant errors.

Availability issue: registered after `r.Run`, so unreachable in normal execution.

#### `GET /transcripts/stats`

Implementation: `backend/cmd/backend/main.go` helper plus `backend/internal/services/transcript_list.go`.

Request: none.

Response shape: map with `total`, `completed`, `processing`, `uploaded`, `error`, `total_hours`.

Storage accessed: Qdrant via `GetAllTranscripts`.

Frontend call sites: none confirmed; dashboard uses direct Qdrant instead.

Known error responses: 405 non-GET, 500 Qdrant errors.

Availability issue: registered after `r.Run`, so unreachable in normal execution.

#### Unregistered Backend Handler Functions

`backend/internal/handlers/transcript_handlers.go` defines handlers with comments for `/api/stats`, `/api/transcripts`, and `/api/transcripts?status=completed`, but no inspected code registers them.

### Analysis Service APIs

#### `POST /run/predict`

Implementation: `gradio/analysis/analysis.py`.

Request: `{"data":["transcript text"]}`.

Response: `{"data":["json-string"]}` where JSON string contains `english_translation`, `keywords`, `entities`, `summary`, `classification`.

Storage/queues accessed: none.

Known errors: 400 missing transcript text; 502 non-JSON Gemini response; generic exceptions return fallback data with HTTP 200.

Backend call site: `backend/internal/handlers/analyse.go`.

#### `GET /health`

Implementation: `gradio/analysis/analysis.py`.

Response: `{"status":"ok"}`.

### Next.js APIs

#### `POST /api/export-pdf`

Implementation: `frontend/transcription-frontend/src/app/api/export-pdf/route.ts`.

Request:

```json
{
  "parent": {"filename":"...","reference_number":"...","category":"...","status":"...","timestamp":"..."},
  "segments": [{"speaker":"...","start_time":0,"end_time":1,"transcript_text":"...","segment_index":0}],
  "format": "segmented",
  "analysisData": null
}
```

Response: PDF binary with `Content-Type: application/pdf` and attachment disposition.

Storage/queues accessed: none.

Frontend call sites: `src/lib/pdfGenerator.ts`, used by Details and Analysis routes.

Known errors: 500 `{"error":"..."}`.

## Qdrant Inventory

Collection names: `file_metadata` only confirmed.

Collection creation: backend `initQdrant` checks `GET /collections/file_metadata`; on 404 creates with `vectors.size=512`, `vectors.distance=Cosine`.

Point ID generation: djb2-style hash in Go and Python. Go does not explicitly mask after overflow because uint64 wraps naturally. Python masks with `& 0xFFFFFFFFFFFFFFFF`.

Parent point ID inputs: backend upload UUID string.

Segment point ID inputs: `{file_id}_seg_{idx:03d}`.

Parent payload fields confirmed at upload: `type`, `job_id`, `filename`, `minio_url`, `local_path`, `status`, `category`, `reference_number`, `notes`, `speakers`, `timestamp`.

Parent analysis fields: `analysis_keywords`, `analysis_entities`, `analysis_summary`, `analysis_classification`, `analysis_english_translation`, `analysis_status`.

Segment payload fields: `type`, `parent_job_id`, `segment_index`, `speaker`, `start_time`, `end_time`, `minio_url`, `transcript_text`, `embedding_generated`, `status`, `timestamp`, `transcription_completed_at`.

Analysis payload fields: stored on parent only; no separate point type is confirmed.

Filters used:

| Component | Filter |
| --- | --- |
| Backend transcript list | `type=parent` |
| Backend analysis fetch | `type=segment`, `parent_job_id=jobID` |
| Backend analysis update | `type=parent`, `job_id=jobID` |
| Dagster uploaded | `type=parent`, `status=uploaded` |
| Dagster diarized | `type=parent`, `status=diarized` |
| Dagster transcribed segments | `type=segment`, `status=transcribed` |
| Dagster completed files | `type=parent`, `status=transcribed` |
| Dashboard | `type=parent`, then all `type=segment` |
| List route | `type=parent`; per-parent segments filter `type=segment`, `parent_job_id` |
| Details route | parent `type=parent`, `job_id`; segments `type=segment`, `parent_job_id` |
| Details save | `type=segment`, `parent_job_id`, `segment_index` |
| Analysis route | parent `type=parent`, `job_id`; segments `type=segment`, `parent_job_id` |
| Search route | segments `type=segment`, `transcript_text match value term`; then parents by `type=parent` plus attempted `should` over `job_id` inside `must` |
| Frontend delete | delete segments by `type=segment`, `parent_job_id`; delete parent by `type=parent`, `job_id` |

Update operations:

| Component | Operation |
| --- | --- |
| Backend upload | `PUT /collections/file_metadata/points?wait=true` with full point. |
| Real diarization parent update | `POST /collections/file_metadata/points/?wait=true` with `points` and `payload`; likely inconsistent endpoint. |
| Real diarization segment creation | `PUT /collections/file_metadata/points?wait=true` with full points. |
| Real transcription segment update | `GET /points/{id}`, merge payload, `PUT /points?wait=true`. |
| Real transcription parent update | `GET /points/{id}`, merge payload, `PUT /points?wait=true`. |
| Backend analysis update | `POST /points/payload?wait=true` with filter and payload. |
| Frontend details edit | `POST /points/payload?wait=true` with filter and payload `transcript_text`. |
| Frontend list delete | `POST /points/delete` twice with filters. |
| Mock workers | merge existing point then `PUT /points?wait=true`. |

Schema inconsistencies:

| Field/status | Inconsistency |
| --- | --- |
| `file_id` vs `job_id` | Redis uses `file_id`; parent payload uses `job_id`; frontend URLs use `job_id`. |
| `speakers` | Backend upload stores form string; backend list expects numeric int; details falls back to distinct segment speakers. |
| `segments` vs `segment_count` | Diarization writes `segment_count`; list UI reads `segments`; backend list reads `segments`. |
| `completed` vs `transcribed` | Workers set parent `transcribed`; dashboard treats both `completed` and `transcribed` as completed; backend stats only counts `completed`. |
| Search filter | Search uses exact Qdrant `match` on `transcript_text`; this may not implement substring search. |
| Parent status update endpoint | Real diarization endpoint differs from backend/frontend payload update endpoint. |

Direct frontend access to Qdrant is extensive and confirmed in dashboard, list, details, analysis, and search pages.

## Redis Inventory

All queue names:

| Queue | Producers | Consumers | Item payload structure | Blocking behavior | Failure handling |
| --- | --- | --- | --- | --- | --- |
| `conversion_queue` | backend upload | real/mock conversion | `file_id`, `minio_url`, `filename` | `BLPOP timeout=10` | logged and dropped after pop. |
| `diarization_queue` | real/mock conversion | real/mock diarization | `file_id`, `minio_url` | real: indefinite `BLPOP`; mock: `timeout=10` | logged and dropped after pop. |
| `transcription_queue` | real/mock diarization | real/mock transcription | `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url` | `BLPOP timeout=10` | logged and dropped after pop. |

Dagster interaction: `dagster/definitions.py` monitors all three queues with `LLEN` every five seconds. It yields a Dagster run request when any queue length is greater than zero. It does not inspect payloads, consume queues, or trigger individual worker jobs.

## MinIO Inventory

Bucket names: `uploads` and `audio` are auto-created by backend startup.

Object naming conventions:

| Object class | Bucket | Name |
| --- | --- | --- |
| Original upload | `uploads` | `{file_id}_{original_filename}` |
| Converted audio | `uploads` | `{file_id}_converted.wav` |
| Segment audio | none confirmed | Not created; transcription slices from full audio in memory. |
| Generated RTTM | local filesystem | `outputs/{base_name}_{timestamp}.rttm` |
| Generated PDF | browser download | Not stored in MinIO. |

URL construction: backend and conversion use `http://{MINIO_ENDPOINT}/{bucket}/{object}`. In Docker, `MINIO_ENDPOINT` is usually `minio:9000`, yielding internal URLs. The frontend rewrites `http://minio:9000` to `MINIO_URL` for playback/download.

Cleanup behavior: no confirmed object cleanup. Frontend delete removes Qdrant points only. Temp files are removed by conversion/transcription workers in success paths. Backend upload temp file is not removed in inspected code.

Volume persistence: MinIO data persists in named volume `minio_data`.

## Frontend Current-State Inventory

### Routes and Purpose

`/`: dashboard with three stat cards, navigation to upload/list/search, direct Qdrant stats fetch every 30 seconds.

`/Transcripts`: upload form with category, reference number, notes, speaker count slider, drag/drop file picker, and backend upload call.

`/Transcripts/List`: transcript list with Qdrant pagination, infinite scroll, client-side search/category/status filters, direct Qdrant deletion.

`/Transcripts/Details?job_id=...`: parent metadata, segment list, editable transcript text, per-segment audio playback, download original audio, analysis navigation, PDF export.

`/Transcripts/Analysis?job_id=...`: parent metadata sidebar, analysis trigger/results, translation toggle, PDF export including analysis.

`/Search`: direct Qdrant segment text search and grouped result display.

`/api/export-pdf`: Next.js server route for PDF generation.

### Main Components and Shared UI

Shared UI components are local shadcn-style components under `src/components/ui/`: `badge`, `button`, `card`, `command`, `input`, `label`, `popover`, `slider`, `template`, `textarea`.

Global providers: `src/components/theme-provider.tsx` wraps `next-themes`.

PDF modal: `src/components/PdfExportModal.tsx`.

PDF client helper/types: `src/lib/pdfGenerator.ts`.

Utility: `src/lib/utils.ts` for `cn()`.

### Data Fetching Logic

Direct Qdrant calls:

| Route | Direct Qdrant use |
| --- | --- |
| `/` | collection check, parent scroll, all segment scroll. |
| `/Transcripts/List` | collection check, parent scroll pages, per-parent segment duration queries, delete filters. |
| `/Transcripts/Details` | parent scroll, paginated segment scroll, segment payload update. |
| `/Transcripts/Analysis` | parent scroll, paginated segment scroll. |
| `/Search` | segment text match, parent lookup. |

Go backend calls:

| Route | Backend use |
| --- | --- |
| `/Transcripts` | `POST /upload`. |
| `/Transcripts/Analysis` | `POST /transcripts/{job_id}/analyse`. |

Next.js API calls:

| Helper | Endpoint |
| --- | --- |
| `generateTranscriptPdf` | `POST /api/export-pdf`. |

### State Management

State is local React state in each route. There is no shared client data store. `next-themes` manages theme state where routes use `useTheme`, but the dashboard has its own local `theme` state and does not call `setTheme` from `next-themes`.

### TypeScript Models

Models are route-local interfaces rather than shared API contract types:

| File | Interfaces |
| --- | --- |
| `List/page.tsx` | `Transcript` |
| `Details/page.tsx` | `Segment`, `ParentTranscript` |
| `Analysis/page.tsx` | `AnalysisData` |
| `Search/page.tsx` | `MatchingSegment`, `SearchResult` |
| `src/lib/pdfGenerator.ts` | `PdfSegmentData`, `PdfParentData`, `PdfAnalysisData` |
| `src/app/api/export-pdf/route.ts` | duplicate PDF interfaces |

### Repeated Code

Repeated `ThemeToggle` implementations appear across routes. Header markup, status color helpers, date/time formatters, Qdrant scroll pagination logic, and PDF data assembly are repeated.

### Loading/Error/Empty States

Dashboard: spinner cards and error panel with reload.

Upload: skeleton before mount, toast-style notification for success/warning/error.

List: skeleton, error card with retry, no-results empty state, loading-more indicator.

Details: skeleton, error/not-found card, no-segments empty state, per-segment saving/saved badges.

Analysis: skeleton, not-ready state, analysing state, analysis error with retry, animated reveal of results.

Search: loading spinner, error card, no-results state.

### Transcript Playback Behavior

Details route uses one `HTMLAudioElement` instance. For each segment it rewrites `segment.minio_url` from `http://minio:9000` to configured `MINIO_URL`, sets `currentTime` to `segment.start_time` on `loadeddata`, starts playback, tracks progress every 100 ms, and stops when current time reaches `segment.end_time`. It sets `crossOrigin="anonymous"`.

### Editing and Saving

Details route displays segment `transcript_text` in textareas. Pressing Enter without Shift saves changes. It updates Qdrant directly with `POST /points/payload?wait=true` filtered by `type=segment`, `parent_job_id`, and `segment_index`, setting `transcript_text` only. It does not update segment status or parent status.

### Speaker Handling

Upload captures speaker count as a slider 1-10 and submits it as form field `speakers`. Diarization ignores the requested speaker count and returns pyannote speaker labels. Details displays parent `speakers` when numeric/truthy, otherwise counts distinct segment speaker labels. List casts parent `speakers` with `Math.floor` and displays `segments`, but workers write `segment_count` rather than `segments`.

### Analysis Workflow

Details shows an `Analyse` button only when parent status is exactly `transcribed`. Analysis route fetches cached parent analysis fields when `analysis_status === "complete"`; otherwise it can call backend analysis if parent status is `transcribed`. Returned analysis is stored in local state immediately; backend saves to Qdrant asynchronously.

### PDF Export Workflow

Details and Analysis use `PdfExportModal` to select `segmented` or `paragraph`. `generateTranscriptPdf` posts assembled data to `/api/export-pdf`, receives a blob, and triggers a download. PDF generation uses Puppeteer with `headless: 'shell'`, `--no-sandbox`, remote Google Fonts CSS, and footer text `CONFIDENTIAL - FOR LAW ENFORCEMENT USE ONLY` using an HTML entity dash.

### Dark Mode

`ThemeProvider` is configured in `layout.tsx` with `defaultTheme="system"`, `enableSystem`, and `disableTransitionOnChange`. Most pages use `useTheme`. Dashboard uses local `theme` state, so its toggle does not update the global `dark` class; it manually switches some classes while also using `dark:` classes.

### Responsive Behavior

Pages use Tailwind responsive utilities such as `md:grid-cols-*`, `sm:flex-row`, `max-w-*`, and responsive sidebars. No automated responsive tests were run.

### Known Build/Runtime Issues From Source

Frontend build is configured to ignore ESLint errors (`next.config.ts`). The app imports Google fonts via Next font and local Faruma font. The PDF route relies on Puppeteer and may require browser/system dependencies in deployment. Direct browser Qdrant access requires Qdrant to be reachable and CORS-compatible from user browsers. The frontend config is hard-coded to localhost, not environment variables.

### Reusable Requirements/Visual Reference

Reusable requirements: upload metadata fields, list/search/detail/analysis workflows, segment playback with time slicing, manual transcript edits, analysis result display, PDF export with segmented/paragraph options, Dhivehi right-to-left transcript display, dark mode preference.

Reusable visual references: stone/neutral color palette, card-based layout, top header, segment cards, analysis sidebar/results layout. The implementation should not be treated as a final API contract because direct Qdrant access and duplicated route-local models are current-state implementation details.

## Docker and Deployment Topology

### Development vs Production-Style Compose

Production-style `compose.yml`:

Contains infrastructure, backend, real conversion/diarization/transcription workers, and Dagster. Does not include frontend or analysis. Mounts host path `/data/911/911_whisper_model` and `./models/pyannote`. Uses `restart: on-failure:5` for real workers/Dagster.

Development `compose.dev.yml`:

Contains infrastructure, backend, mock conversion/diarization/transcription workers, and analysis. Does not include Dagster or frontend. No GPU-heavy workers. Uses `restart: unless-stopped` for mocks and analysis.

### Dockerfiles and Build Contexts

| Service | Build context | Dockerfile | Base image | Relationship |
| --- | --- | --- | --- | --- |
| backend | `./backend` | `backend/Dockerfile` | `golang:1.24-bullseye` | unique image. |
| gradio_convert | `./gradio/convert` | `gradio/convert/Dockerfile` | `python:3.10-slim` | real worker. |
| gradio_diarization | `./gradio/diarization` | `gradio/diarization/Dockerfile` | `python:3.10-slim` | real worker. |
| gradio_transcription | `./gradio/transcription` | `gradio/transcription/Dockerfile` | `python:3.10-slim` | real worker. |
| analysis | `./gradio/analysis` | `gradio/analysis/Dockerfile` | `python:3.10-slim` | dev-only service. |
| mock workers | `./mock_workers` | `mock_workers/Dockerfile` | `python:3.11-slim` | shared image, per-service command override. |

Frontend has no Dockerfile.

### Health Checks

No Docker health checks are defined. `depends_on` is ordering-only and does not wait for readiness.

### Restart Policies

`unless-stopped`: MinIO, Qdrant, Redis, backend, dev mock workers, dev analysis.

`on-failure:5`: real conversion, real diarization, real transcription, Dagster.

### Dependency Ordering

Production-style backend depends only on MinIO, despite requiring Qdrant and Redis at startup. Real conversion depends on MinIO and Redis. Real diarization depends on Redis and Qdrant. Real transcription depends on Redis, Qdrant, MinIO. Dagster depends on Redis and Qdrant.

Development backend depends on MinIO, Qdrant, Redis. Mocks depend on their required Redis/Qdrant/MinIO services.

### Volumes

Named volumes: `minio_data`, `qdrant_data`, `dagster_home` in production-style; `minio_data`, `qdrant_data` in dev.

Bind mounts: `./dagster:/opt/dagster/app`, `./gradio/diarization/outputs:/app/outputs`, `./models/pyannote:/root/.cache/huggingface/hub`, `/data/911/911_whisper_model:/app/models`.

### Networks

Both Compose files define one bridge network: `app_network`.

### Host-Specific Paths

`/data/911/911_whisper_model:/app/models` is host-specific and may not exist on a temporary deployment host. The code currently loads `Devion333/whisper-small-dv-syn`, not `/app/models`, so the mount may be stale or intended for future local checkpoints.

`./models/pyannote` contains local Hugging Face cache material and is mounted into the diarization worker cache path.

### GPU Runtime Configuration

No Compose service defines `deploy.resources.reservations.devices`, `runtime: nvidia`, `gpus`, or NVIDIA environment variables. The transcription code detects CUDA if available, but the container may not receive GPU access.

### Linux GPU Host Deployment Blockers

1. No GPU device configuration for transcription or diarization.
2. Transcription image is based on `python:3.10-slim` and installs PyTorch from default pip indexes; CUDA wheel/runtime compatibility needs verification.
3. Host path `/data/911/911_whisper_model` may not exist.
4. Production-style Compose misses the `analysis` service.
5. Frontend is not containerized and is configured for localhost.
6. Direct browser access to Qdrant/MinIO requires exposed services and permissive CORS/security posture.
7. No readiness health checks; backend may fail on startup if Qdrant/Redis are not ready.

## Transcription Worker Preliminary Profile

Dockerfile stages: single stage only.

Base image: `python:3.10-slim`.

CUDA assumptions: code checks `torch.cuda.is_available()` and moves model/input features to `cuda` if present. Dockerfile and Compose do not install CUDA system libraries explicitly or request GPU devices.

Python version: 3.10 from base image.

PyTorch/audio dependencies: `torch==2.6.0`, `torchaudio==2.6.0`, `librosa==0.10.1`, `soundfile==0.12.1`, `noisereduce`, `numpy==1.26.4`, plus `pyannote.audio==3.1.1` despite this being the transcription image.

Whisper model identifier/path: active `model_path = "Devion333/whisper-small-dv-syn"`; commented local path `/app/models/checkpoint-3000`.

Model loading lifecycle: loads at module import/process startup before the worker loop. It first tries `AutoProcessor` and `AutoModelForSpeechSeq2Seq`, then falls back to `WhisperProcessor` and `WhisperForConditionalGeneration`. Calls `model.eval()` and moves to selected device.

Expected input: Redis job with `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url`.

Expected output: Qdrant segment point updated with `transcript_text`, `status=transcribed`, `transcription_completed_at`; parent point possibly updated to `status=transcribed`.

Queue behavior: `BLPOP transcription_queue timeout=10`, no requeue on failure.

Local/model cache paths: Hugging Face default cache inside container unless overridden by `.env`; Compose mount `/app/models` exists but active code does not use it.

Largest likely image contributors: PyTorch/torchaudio, transformers, datasets, pyannote.audio and dependencies, librosa/audio stack, model cache at runtime.

Duplicated dependencies/files: `pyannote.audio` is included in the transcription worker requirements although pyannote inference is in the diarization worker. Audio stack overlaps heavily with diarization.

Host-specific paths: `/data/911/911_whisper_model:/app/models`.

Potential deployment blockers: no GPU configuration, model downloads at startup if not cached, Hugging Face/network access requirements, large dependency footprint, CPU fallback may be too slow, parent completion check limited to 100 segments and missing `type=segment` filter.

## Risks and Unknowns

### Confirmed Architectural Risks

1. Browser clients directly read and mutate Qdrant, including delete and payload update operations.
2. MinIO buckets are configured public-read by backend startup.
3. Redis jobs are removed before processing and generally not retried or dead-lettered on failures.
4. Production-style Compose omits `analysis`, breaking the registered backend analysis endpoint in that topology.
5. Backend transcript list and stats routes are unreachable due to registration after blocking `r.Run`.
6. Frontend deletion removes Qdrant metadata only, leaving MinIO objects and local diarization outputs orphaned.
7. No health checks or readiness handling are configured.

### Documentation Inconsistencies

1. `AGENTS.md` states backend exposes `GET /transcripts` and `GET /transcripts/stats`; implementation defines them but they are unreachable in normal execution.
2. `AGENTS.md` states production uses real gradio workers; true for conversion/diarization/transcription, but production-style Compose lacks analysis while backend has an analysis route.
3. `AGENTS.md` says Whisper model is mounted at `/app/models`; active transcription code loads Hugging Face model `Devion333/whisper-small-dv-syn` instead.
4. `AGENTS.md` says mock workers produce schema-identical data; mock parent updates use robust upsert, while real diarization parent update appears to use a different/possibly invalid Qdrant endpoint.
5. `README.md` contains only duplicate title lines and no operational architecture.

### Code Inconsistencies

1. Backend `cmd/backend/main.go` calls `r.Run` before registering raw `net/http` handlers.
2. Go backend defaults `QDRANT_HOST` to `http://transcript_qdrant:6333` in `transcript_list.go`, while other files default to `http://qdrant:6333`.
3. Parent fields use `segment_count` in workers but `segments` in list/backend list readers.
4. Parent status values are `uploaded`, `diarized`, `transcribed`, but frontend/backend stats also expect `processing`, `completed`, `error`.
5. Upload response uses `file_id`; frontend searches multiple possible job ID keys but not `file_id`, so successful upload may navigate to list instead of details.
6. Dashboard dark-mode toggle is local and does not use `next-themes`, unlike other pages.
7. Search parent lookup attempts a `should` condition nested inside `must`, which may not be valid Qdrant filter syntax for the intended OR behavior.
8. Transcription parent completion check omits `type=segment` and limits to 100 points.
9. Backend upload temp files under `/tmp` are not removed by inspected code.

### Deployment Blockers

1. No frontend Dockerfile or Compose service.
2. Frontend configuration is hard-coded to localhost URLs.
3. No GPU runtime/device configuration for GPU-heavy workers.
4. Host-specific `/data/911/911_whisper_model` mount.
5. Production-style Compose lacks analysis service.
6. Backend startup can fail if Qdrant/Redis are unavailable despite incomplete production `depends_on`.
7. Dagster installs packages at container startup, requiring network access and increasing startup variability.
8. Puppeteer PDF route may need extra runtime packages and a browser-compatible environment.

### Security Concerns Requiring Urgent Attention

1. Hard-coded MinIO root credentials in Compose and backend defaults.
2. Public-read MinIO bucket policy is automatically applied to all objects in `uploads` and `audio`.
3. Qdrant is exposed on host port `6333`, and the frontend performs privileged direct operations including delete and payload update.
4. Backend CORS is `Access-Control-Allow-Origin: *`.
5. MinIO CORS is `*`.
6. `.env` is referenced for API tokens; ensure it remains uncommitted and excluded from any report/log output.

### Unanswered Questions

1. Should the production topology include `analysis`, or should analysis be dev-only?
2. Should frontend access Qdrant directly in any deployment, or should all Qdrant operations move behind backend APIs?
3. What is the intended canonical status model: `uploaded/diarized/transcribed` or `uploaded/processing/completed/error`?
4. Should speaker count be user-provided, diarization-derived, or both?
5. Is `Devion333/whisper-small-dv-syn` the intended production model, or should `/app/models/checkpoint-3000` be used?
6. Should converted audio be stored in `uploads` or the currently unused `audio` bucket?
7. What retention/cleanup rules should apply to original uploads, converted audio, RTTM outputs, and Qdrant points?

### Assumptions Requiring Runtime Verification

1. Real diarization parent metadata update succeeds against the deployed Qdrant API.
2. Qdrant text `match` search provides the desired search behavior for transcript text.
3. Browser Qdrant and MinIO calls work with deployed CORS and network exposure.
4. Puppeteer PDF generation works in the deployment target.
5. Transcription image can access the intended model without downloading during startup.
6. CUDA is visible inside the transcription container on the target Linux GPU host.
7. Large transcripts with more than 100 segments are correctly marked complete.

## Recommended Next Audit Steps

### Dedicated Transcription-Worker Audit

1. Audit Docker image size contributors and CUDA wheel/runtime compatibility without building GPU images initially.
2. Decide and verify canonical model source: Hugging Face ID versus mounted local checkpoint.
3. Profile startup model loading lifecycle, cache paths, and offline deployment behavior.
4. Review audio preprocessing quality and performance: repeated full-file downloads, `librosa` loading, denoise cost, segment slicing, temp-file cleanup.
5. Verify forced decoder language/task settings for the target language and model.
6. Inspect queue failure semantics and design retry/dead-letter behavior.
7. Validate Qdrant update correctness, parent completion logic, and >100 segment behavior.
8. Identify dependencies that belong only in diarization versus transcription.

### Frontend Current-State and API-Contract Audit

1. Convert route-local Qdrant payload assumptions into explicit shared API contract candidates.
2. Inventory every frontend direct Qdrant mutation and decide which backend endpoint should replace it.
3. Define canonical transcript, segment, status, speaker, analysis, and export models.
4. Reconcile upload response shape with details navigation requirements.
5. Audit search semantics and required backend/query behavior.
6. Audit playback requirements, MinIO URL rewriting, and auth/CORS requirements.
7. Define frontend deployment configuration requirements for backend, Qdrant, and MinIO URLs.
8. Separate reusable workflow/visual requirements from implementation details that should not carry forward.
