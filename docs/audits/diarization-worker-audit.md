# Diarization Worker Audit

Audit date: 2026-07-15. Scope: audit-only review of the diarization stage, its queue contracts, Qdrant writes, MinIO/audio behavior, model/authentication setup, Docker/dependency state, mock-worker alignment, and current Docker/queue/Qdrant state. No real diarization worker was started or built. No model download, GPU workload, Redis write, Qdrant write, MinIO write, container/image/volume removal, cache mutation, or frontend change was performed.

## Evidence Sources

Required documents read before this report:

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Operator constraints and pipeline notes. |
| `ARCHITECTURE.md` | Current architecture inventory. |
| `docs/audits/system-inventory.md` | Prior end-to-end source inventory. |
| `docs/audits/transcription-worker-audit.md` | Prior transcription contract and risk audit. |
| `docs/audits/transcription-stage1-implementation.md` | Current stabilized transcription queue/Qdrant behavior. |
| `docs/audits/docker-disk-and-transcription-image-audit.md` | Prior Docker and diarization container failure context. |
| `docs/audits/docker-cleanup-and-image-preparation.md` | Record of approved dead diarization container removal. |
| `docs/audits/transcription-minimal-image-validation.md` | Transcription image validation context. |
| `docs/audits/transcription-minimal-production-migration.md` | Current live transcription worker state and preserved queues. |

Source inspected:

| Area | Files |
| --- | --- |
| Real diarization | `gradio/diarization/diarization.py`, `Dockerfile`, `requirements.txt` |
| Compose | `compose.yml`, `compose.dev.yml` |
| Upstream queue producer | `gradio/convert/convert.py`, `mock_workers/mock_convert.py`, `backend/internal/handlers/upload.go` |
| Downstream consumer | `gradio/transcription/transcription.py`, `mock_workers/mock_transcription.py` |
| Qdrant/backend readers | `backend/internal/services/qdrant.go`, `backend/internal/services/analysis.go`, `dagster/definitions.py` |
| Mock diarization | `mock_workers/mock_diarization.py`, `mock_workers/qdrant_helpers.py` |
| Cache/model paths | `models/pyannote/`, `models/pyannote/README.md`, `models/pyannote/config.yaml` |

Safe runtime/read-only checks performed:

| Check | Result |
| --- | --- |
| `python -m py_compile gradio/diarization/diarization.py mock_workers/mock_diarization.py` | Passed. |
| `docker compose config --quiet` | Passed. |
| `docker compose -f compose.dev.yml config --quiet` | Passed. |
| `docker ps -a` | Read-only state recorded. |
| `docker image ls --digests` | Read-only image state recorded. |
| Redis queue lengths via localhost TCP `LLEN` | All inspected pipeline/processing/failed queues returned `0`. |
| Qdrant parent/segment scrolls | Read-only samples recorded. |

Docker CLI limitations observed:

| Command class | Result |
| --- | --- |
| `docker volume ls` | One broad call failed with Docker CLI/host paging-file memory error; a formatted retry returned no output. |
| Diarization image metadata probe | A no-network, entrypoint-overridden Python metadata probe timed out or hit Docker CLI memory allocation failure before useful output. It did not execute `diarization.py`. |

## Current Architecture

The intended stage order is:

```text
upload -> conversion -> diarization -> transcription -> analysis
```

The actual diarization flow is:

1. Backend upload writes original file to MinIO bucket `uploads`, creates a Qdrant parent point, and pushes `conversion_queue` with `file_id`, `minio_url`, and `filename`.
2. Conversion consumes `conversion_queue`. If the upload is already audio, it forwards the original `minio_url`; if it is video, it downloads the full object, converts to mono 16 kHz WAV, uploads `uploads/{file_id}_converted.wav`, and pushes `diarization_queue` with `file_id` and `minio_url`.
3. Real diarization imports and loads `Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=HUGGINGFACE_ACCESS_TOKEN)` at process startup.
4. Real diarization consumes `diarization_queue` using destructive `BLPOP` with no timeout.
5. It downloads the full `minio_url` by HTTP into `/tmp/{file_id}.wav`.
6. It runs pyannote diarization on the local file, writes an RTTM file to `/app/outputs`, filters out segments under 1 second, rounds times to 2 decimals, and merges same-speaker segments when the gap is under 0.5 seconds.
7. It attempts to update the parent point to `status=diarized` with `segment_count` and `diarization_completed_at`.
8. It creates one Qdrant segment point per merged segment.
9. It pushes one `transcription_queue` job per segment.
10. The stabilized real transcription worker atomically moves jobs from `transcription_queue` to `transcription_processing_queue`, requires the diarization-produced fields, updates segment statuses, and marks the parent `transcribed` only after paginated completion checks against `segment_count`.

## Queue Contracts

### Backend Upload -> Conversion

| Field | Required | Source | Notes |
| --- | --- | --- | --- |
| `file_id` | yes | Backend UUID | Parent Qdrant payload uses same value as `job_id`. |
| `minio_url` | yes | Backend MinIO URL | Usually `http://minio:9000/uploads/{file_id}_{filename}`. |
| `filename` | yes in backend, optional in conversion fallback | Original upload filename | Conversion uses extension to decide whether to convert. |

Queue behavior: backend uses `LPUSH conversion_queue`; conversion uses `BLPOP conversion_queue timeout=10`. This stage can lose jobs after pop on conversion failure, but that is outside this repair scope.

### Conversion -> Diarization

| Contract Item | Value |
| --- | --- |
| Producer | `gradio/convert/convert.py` or `mock_workers/mock_convert.py` |
| Consumer | `gradio/diarization/diarization.py` or `mock_workers/mock_diarization.py` |
| Queue | `diarization_queue` |
| Real producer operation | `LPUSH` |
| Real consumer operation | `BLPOP("diarization_queue")` with no timeout |
| Payload | `{"file_id":"...","minio_url":"..."}` |
| Required fields | `file_id`, `minio_url` |
| Optional fields | none consumed by real diarization |
| MinIO input | Full audio object URL; original audio or converted WAV |
| Timing units | Not present yet |

### Diarization -> Qdrant

| Contract Item | Value |
| --- | --- |
| Parent point ID | `hash_string_to_uint64(file_id)` using djb2/uint64 mask |
| Segment point ID | `hash_string_to_uint64(f"{file_id}_seg_{idx:03d}")` |
| Segment ID string | `{file_id}_seg_000`, `{file_id}_seg_001`, ordered by merged segment enumeration |
| Segment vector | 512-dimensional zero vector |
| Segment payload fields | `type`, `parent_job_id`, `segment_index`, `speaker`, `start_time`, `end_time`, `minio_url`, `transcript_text`, `embedding_generated`, `status`, `timestamp` |
| Segment status | `pending_transcription` |
| Parent payload fields intended | `status=diarized`, `segment_count`, `diarization_completed_at` |
| Write wait | Segment upsert uses `?wait=true`; parent update also uses `?wait=true` but likely wrong endpoint/body |

### Diarization -> Transcription

| Field | Required By Current Transcription | Produced By Real Diarization | Notes |
| --- | --- | --- | --- |
| `segment_id` | yes | yes | `{file_id}_seg_{idx:03d}`. |
| `file_id` | yes | yes | Parent job ID. |
| `start_time` | yes | yes | Float seconds, rounded to 2 decimals. |
| `end_time` | yes | yes | Float seconds, rounded to 2 decimals; must be greater than start. |
| `speaker` | yes | yes | Pyannote label such as `SPEAKER_00`; stable only for that pipeline run. |
| `minio_url` | yes | yes | Same full-file URL for every segment, not per-segment audio. |
| `attempts` | optional | no | Transcription defaults missing attempts to `0`. |
| `segment_saved` | optional | no | Transcription defaults missing value to `False`. |

The produced transcription job matches the stabilized transcription worker's required field set. It does not need `parent_job_id` in the queue payload because transcription treats `file_id` as the parent ID.

### Diarization -> Parent Status

| State | Current Behavior |
| --- | --- |
| Before diarization | Parent starts as `status=uploaded`. |
| On diarization success | Real worker intends `status=diarized`, `segment_count`, `diarization_completed_at`. |
| On segment creation failure | Parent may already have been marked diarized, because parent update is attempted before segment creation. |
| On transcription completion | Transcription later sets parent `status=transcribed` after all expected segments are transcribed. |
| On diarization failure | No explicit parent failure status is written. |

## Worker Code Audit

### Import-Time Side Effects

`gradio/diarization/diarization.py` performs high-risk work at import/process startup:

1. Reads `HUGGINGFACE_ACCESS_TOKEN` and raises immediately if absent.
2. Imports `pyannote.audio.Pipeline`.
3. Calls `Pipeline.from_pretrained(...)` before Redis/Qdrant connections are tested and before `worker_loop()`.
4. Creates Redis client object.
5. Creates `outputs/` directory.

Any token/model/cache/network failure occurs before queue consumption, which avoids losing a job but causes container startup failure and Compose restart attempts.

### Model Loading and Authentication

Current code:

```python
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1", use_auth_token=HUGGINGFACE_ACCESS_TOKEN
)
```

Current requirements pin `pyannote.audio==3.1.1` and `huggingface_hub==0.20.3`. The upstream `pyannote.audio` 3.1.1 source has this signature:

```text
Pipeline.from_pretrained(checkpoint_path, hparams_file=None, use_auth_token=None, cache_dir=CACHE_DIR)
```

Therefore:

1. `use_auth_token` is valid for `pyannote.audio==3.1.1`.
2. `token=` is not valid for `pyannote.audio==3.1.1` and would cause `Pipeline.from_pretrained() got an unexpected keyword argument 'token'`.
3. The previously observed `unexpected token argument` failure is caused by using `token=` with this installed/pinned pyannote API, or by a different source revision than the current checked-in file. The current checked-in file uses the compatible `use_auth_token=` spelling.

The model card cached under `models/pyannote/README.md` says `pyannote/speaker-diarization-3.1` requires:

1. `pyannote.audio` 3.1 or higher.
2. Accepting `pyannote/segmentation-3.0` user conditions.
3. Accepting `pyannote/speaker-diarization-3.1` user conditions.
4. A Hugging Face access token.

Secrets were not printed in this report.

### Cache Location

Compose mounts:

```yaml
./models/pyannote:/root/.cache/huggingface/hub
```

The host path contains top-level entries such as:

```text
models--pyannote--speaker-diarization-3.1/
models--pyannote--segmentation-3.0/
models--pyannote--speaker-diarization-community-1/
config.yaml
README.md
```

This is a Hugging Face hub-cache-style mount at the `hub` level, not at `HF_HOME`. It can satisfy some cached model lookups if complete, but no offline env is set for diarization and no `cache_dir`, revision, or local-only option is passed. The worker may still contact Hugging Face at startup.

### Device Selection

The real worker never calls `pipeline.to(torch.device("cuda"))`; pyannote pipelines run on CPU by default. Compose also has no GPU stanza. The worker is not configured for GPU despite being GPU-heavy in concept.

### Audio and Segment Extraction

The real worker downloads the full audio file to `/tmp/{file_id}.wav` with `requests.get(minio_url)` and no timeout. It passes that path to pyannote. Pyannote model-card behavior says audio is downmixed to mono and resampled to 16 kHz internally if needed. Conversion already emits 16 kHz mono WAV for video inputs.

Segment behavior:

1. Uses `diarization.itertracks(yield_label=True)`.
2. Drops segments shorter than 1 second.
3. Rounds start/end to 2 decimal seconds.
4. Merges adjacent same-speaker segments when `gap < 0.5` seconds.
5. Does not explicitly sort segments after `itertracks`; pyannote annotations are usually chronological, but the code relies on iterator order.
6. Does not handle overlaps beyond using pyannote labels and later merging adjacent same-speaker tracks. Overlapping speakers can produce overlapping time windows if pyannote emits them.

### Temporary Files and Cleanup

Problems:

1. `/tmp/{file_id}.wav` is never deleted on success or failure.
2. Existing temp files can be overwritten on rerun because the name is deterministic per `file_id`.
3. RTTM outputs are written to `outputs/{base}_{timestamp}.rttm` and are never cleaned up.
4. Download uses `resp.content`, loading the entire file into memory before writing.

### Redis Queue Handling

The real worker uses:

```python
_, job_data = r.blpop("diarization_queue")
```

This is unsafe because the job is removed before download, diarization, Qdrant writes, and transcription queue pushes succeed.

### Exception Handling

The worker catches broad exceptions in the loop, prints traceback, sleeps 5 seconds, and continues. It does not requeue, dead-letter, update Qdrant failure state, or bound error strings. Helper functions often swallow Qdrant/Redis errors and return empty lists, which can make partial failure look like successful loop continuation.

## Queue Reliability Audit

Current queue lengths from read-only Redis TCP `LLEN`:

| Queue | Length |
| --- | ---: |
| `conversion_queue` | 0 |
| `diarization_queue` | 0 |
| `diarization_processing_queue` | 0 |
| `diarization_failed_queue` | 0 |
| `transcription_queue` | 0 |
| `transcription_processing_queue` | 0 |
| `transcription_failed_queue` | 0 |

Loss scenarios:

| Failure Point | Current Result |
| --- | --- |
| Model loading fails | No job has been popped yet, but container fails/restarts. |
| Malformed diarization job | Job already popped, then lost. |
| Missing `file_id` or `minio_url` | Job already popped, then lost. |
| MinIO download fails or hangs | Job already popped; failure loses job or hangs worker. |
| Diarization raises | Job already popped, then lost. |
| Parent Qdrant update fails | Error logged; processing continues. |
| Segment Qdrant write fails | Returns empty transcription jobs; popped diarization job is lost. |
| Some segment writes succeed, then transcription queue push fails | Created segments remain pending; failed pushes are logged and not retried. |
| Container crashes after `BLPOP` | Job lost. |
| Container crashes after some Qdrant writes | Partial segment set may remain; no recovery metadata exists. |

Recommendation: diarization should adopt the same Stage 1 pattern as transcription:

| Queue | Purpose |
| --- | --- |
| `diarization_queue` | Ready jobs from conversion and retry handling. |
| `diarization_processing_queue` | Jobs atomically moved into active processing. |
| `diarization_failed_queue` | Malformed or exhausted jobs after final failure. |

Recommended behavior:

1. Use `BLMOVE diarization_queue diarization_processing_queue LEFT RIGHT timeout` or equivalent.
2. Recover processing jobs at startup.
3. Validate `file_id` and `minio_url` before work.
4. Track `attempts` with a bounded max.
5. On final failure, push a bounded failed payload to `diarization_failed_queue`.
6. Set parent `status=diarization_failed`, `diarization_error`, and `diarization_failed_at` where parent exists.
7. Remove the exact processing payload only after Qdrant and queue handoff are complete.

## Qdrant Correctness Audit

### ID Generation

Parent and segment ID hashing is consistent with backend, mock workers, and transcription:

```python
hash = ((hash << 5) + hash) + ord(c)
hash & 0xFFFFFFFFFFFFFFFF
```

### Parent Update Problem

Real diarization uses:

```text
POST /collections/{collection}/points/?wait=true
{"points":[numeric_id],"payload":{...}}
```

Other working code uses either full-point `PUT /points?wait=true` or payload update `POST /points/payload?wait=true`. The real diarization parent update endpoint/body is likely invalid for Qdrant payload updates. It logs response status/text but does not fail the job.

Impact:

1. Parent may remain `uploaded` even after segment points and transcription jobs are created.
2. `segment_count` may be missing, causing stabilized transcription to skip expected-count verification and rely only on discovered segments.
3. Dagster/frontend status views may not show `diarized`.

### Segment Write Behavior

Real diarization writes all segment points in one `PUT /points?wait=true` call. If the call fails, it returns no transcription jobs. If the call succeeds, transcription jobs are generated from the same in-memory segment list.

Risks:

1. No timeout on Qdrant requests.
2. No exception rethrow from helper, so loop cannot distinguish final failure states.
3. Rerunning the same `file_id` overwrites segment IDs for indexes that still exist but does not remove stale segments if a rerun produces fewer segments.
4. Parent `segment_count` can become wrong if parent update fails or stale segments remain.
5. Duplicate transcription jobs can be pushed for overwritten existing segments on rerun.

### Current Qdrant Sample

Read-only Qdrant scroll showed existing segments with:

```text
type=segment
parent_job_id=<file_id>
segment_index=0..3
speaker=SPEAKER_00/SPEAKER_01
start_time/end_time in seconds
minio_url=http://minio:9000/uploads/<file_id>_converted.wav
status=transcribed
```

Read-only parent scroll showed some parents with `segment_count=4`, `diarization_completed_at`, and `status=transcribed`, plus older parents still `uploaded`. The sample segment timings match the fixed mock layout, so this proves schema compatibility in stored data but does not prove the real pyannote worker has successfully produced real segments.

### Idempotent Rerun Strategy

Recommended safe strategy for a diarization rerun:

1. Use a processing queue so only recoverable jobs are retried.
2. Before writing new segments, mark parent `status=diarizing` or keep parent unchanged until all writes are ready.
3. Delete or mark stale existing segment points for that `parent_job_id` before inserting a new complete set, or use a `diarization_run_id` and filter only the active run.
4. Upsert all new segment points with deterministic IDs.
5. Verify Qdrant write success and discovered segment count equals intended count.
6. Update parent `status=diarized`, `segment_count`, `diarization_completed_at`, and optionally `diarization_run_id` using a known-good update method.
7. Push transcription jobs only after parent and segment writes are confirmed.
8. On failure after partial writes, set parent `diarization_failed` and do not push more transcription jobs.

## MinIO and Audio Audit

Input URL path:

1. Backend uploads originals to `uploads/{file_id}_{filename}`.
2. Conversion uploads converted video audio to `uploads/{file_id}_converted.wav`.
3. Diarization receives the full audio URL in `diarization_queue`.
4. Diarization passes the same full audio URL to every transcription segment.

Important contract: transcription receives full-file `minio_url` plus `start_time` and `end_time`; it does not receive separate segment audio objects. This matches current transcription behavior, which downloads the full file and slices locally per segment.

Findings:

1. Diarization downloads the whole file into memory and then to disk.
2. The temporary path suffix is always `.wav`, even when original audio might not be WAV.
3. Video conversions are normalized to 16 kHz mono WAV before diarization.
4. Non-video audio is not normalized by conversion; pyannote can resample/downmix internally, and transcription later loads with `librosa.load(..., sr=16000)`.
5. Diarization writes RTTM locally only; it does not upload diarization output to MinIO.
6. No per-segment MinIO objects are created.

## Model and Authentication Audit

| Item | Current State |
| --- | --- |
| Pipeline ID | `pyannote/speaker-diarization-3.1` |
| Required package | Model card says `pyannote.audio` 3.1 or higher; requirements pin `3.1.1`. |
| Token env | `HUGGINGFACE_ACCESS_TOKEN` |
| Token exposure | Compose passes `${HUGGINGFACE_ACCESS_TOKEN}`; report does not expose value. |
| Token argument for pinned API | `use_auth_token` is correct for `pyannote.audio==3.1.1`. |
| `token=` argument | Not supported by pyannote.audio 3.1.1 `Pipeline.from_pretrained`; would cause the observed unexpected keyword error. |
| Terms | Must accept both `pyannote/speaker-diarization-3.1` and `pyannote/segmentation-3.0`. |
| Cache mount | `./models/pyannote:/root/.cache/huggingface/hub`. |
| Offline mode | Not configured. |
| Revision pin | Not configured. |
| GPU | Not configured; pipeline remains CPU unless code calls `.to(torch.device("cuda"))`. |
| CPU validation | Possible for import/static checks, but real diarization on CPU can be slow and was not run. |

The current checked-in authentication/configuration is API-compatible for pyannote 3.1.1, but it is not fully production-stable because it lacks explicit cache root, offline/local-only behavior, revision pinning, and a clear preflight for gated-model access.

## Dependency and Docker Audit

### Requirements Table

| Package | Version | Direct Usage | Likely Size Impact | Required? | Compatibility / Validation Needed |
| --- | --- | --- | --- | --- | --- |
| `gradio` | unpinned | Not imported | moderate | unnecessary for worker | Remove after validation; worker is not a Gradio server. |
| `minio` | unpinned | Not imported | low/moderate | unnecessary in diarization | Worker downloads by HTTP only. |
| `ffmpeg-python` | unpinned | Not imported | low | unnecessary in diarization | System `ffmpeg` also unused directly. |
| `pyannote.audio` | `3.1.1` | `Pipeline` | very high | required | Keep initially; `use_auth_token` is compatible. |
| `redis` | unpinned | Redis queues | low | required | Pin to match other workers after validation. |
| `requests` | unpinned | MinIO/Qdrant/Dagster HTTP | low | required | Add timeouts. |
| `numpy<2` | constrained | indirect | moderate | likely required | Pyannote stack compatibility constraint. |
| `pytorch-lightning` | `>=2.0.0` | not imported directly | high/moderate | likely transitive via pyannote | Pin if retained by pyannote dependency. |
| `torch` | `>=2.1.0` | indirect via pyannote; no explicit device code | very high | required | Version should align with pyannote/torchaudio. |
| `torchaudio` | `2.1.0` | not imported directly | high | likely required by pyannote/audio IO | Potential mismatch with unconstrained `torch>=2.1.0`; validate installed pair. |
| `soundfile` | unpinned | indirect | low/moderate | likely useful | Keep while pyannote/audio may use it. |
| `librosa` | unpinned | Not imported | moderate | not required by current code | Remove if pyannote does not need it directly. |
| `huggingface_hub` | `0.20.3` | indirect through pyannote | moderate | required | Compatible with pyannote 3.1.1 source using `use_auth_token`. |

### Dockerfile Findings

| Topic | Finding |
| --- | --- |
| Base image | `python:3.10-slim`. |
| OS packages | Installs `ffmpeg`, `build-essential`, `gcc`. `build-essential`/`gcc` may be needed for source builds, but increase image size. |
| Build strategy | Single stage; installs requirements with `--no-cache-dir`. |
| Copy behavior | `COPY . .` copies all files in `gradio/diarization`; currently only three files were found. |
| `.dockerignore` | None found for `gradio/diarization`. |
| Startup command | Dockerfile `CMD ["python3", "diarization.py"]`; Compose overrides to `python -u diarization.py`. |
| GPU config | None in Compose. |
| Cache mount | Host `./models/pyannote` mounted into HF hub cache path. |
| Health checks | None. |
| Restart policy | `on-failure:5` in production Compose. |

Image inventory shows `transcript-app-gradio_diarization:latest` exists with digest `sha256:a82f7444335dd352cd1684ec4db51ed8e3a038d8f4d02f136cfe8060e992af56` and displayed size `3.41GB`.

## Mock Worker Alignment

Matches:

1. Consumes `diarization_queue` and produces `transcription_queue`.
2. Uses the same segment ID format and hash function.
3. Writes segment payload fields required by transcription.
4. Uses full-file `minio_url` plus time ranges, not segment audio URLs.
5. Writes `segment_count` and `status=diarized` on the parent.
6. Produces stable `SPEAKER_00`/`SPEAKER_01` labels.

Mismatches:

| Area | Real Worker | Mock Worker | Risk |
| --- | --- | --- | --- |
| Queue consumption | `BLPOP` with no timeout | `BLPOP timeout=10` | Different idle/shutdown behavior; both destructive. |
| Parent Qdrant update | Likely-invalid `POST /points/?wait=true` body | Safe merge/upsert helper | Mock can pass while real parent update fails. |
| Segment generation | Pyannote output, filters/merges, variable count | Fixed 4 segments | Dev cannot catch real overlap/order/count edge cases. |
| Audio access | Downloads and diarizes full audio | Does not read audio | Dev cannot catch MinIO/audio failures. |
| Temp/RTTM outputs | Writes temp audio and RTTM | None | Dev cannot catch cleanup/disk growth issues. |
| Failure status | None | None for diarization | Both lack diarization failure contract. |
| Timeouts | None for real Qdrant/MinIO | Helpers have Qdrant timeouts | Mock is safer than real. |
| Idempotency | Can leave stale segments | Upserts deterministic fixed set but also does not remove stale extra segments | Both need explicit rerun strategy. |

## Current Container Failure State

Current `docker ps -a` shows no `transcript_gradio_diarization` container. `docker inspect transcript_gradio_diarization` returned `[]`/no object, and `docker logs --tail 200 transcript_gradio_diarization` produced no logs because the container no longer exists.

Prior audit records show the previous container state before approved cleanup:

| Field | Recorded Prior State |
| --- | --- |
| Container | `/transcript_gradio_diarization` |
| Status | `dead` |
| Image | `transcript-app-gradio_diarization:latest` |
| Error class | Broken Docker metadata: `rw layer snapshot not found` |
| Cleanup | Removed in an approved Docker cleanup stage; image was preserved. |

Current relevant Docker state:

| Item | State |
| --- | --- |
| `transcript_gradio_transcription` | Running, image `sha256:23b960ad72faef36573abf377796afb3ad257e7e8a741496da452ccfc344e414`, restart count `0`. |
| `transcript_gradio_convert` | Running. |
| `transcript_redis` | Running. |
| `qdrant` | Running. |
| `transcript_minio` | Running. |
| `transcript_dagster` | Exited `137`. |
| `transcript-app-gradio_diarization:latest` | Image exists, digest `sha256:a82f7444335dd352cd1684ec4db51ed8e3a038d8f4d02f136cfe8060e992af56`, size `3.41GB`. |

The previously observed `Pipeline.from_pretrained unexpected token argument` is not visible in current Docker logs because the failed container no longer exists. From source/API compatibility evidence, that specific error maps to `token=` being used against pyannote.audio 3.1.1, whose API expects `use_auth_token=`.

## Severity-Ranked Findings

### Critical

| Finding | Impact | Evidence | Recommendation |
| --- | --- | --- | --- |
| Diarization jobs can be lost after `BLPOP` | Failed jobs disappear silently, leaving parents uploaded or segments missing forever. | Real worker pops before download/model/Qdrant/queue handoff. | Add processing and failed queues with retries before running real jobs. |
| Real parent Qdrant update likely uses wrong endpoint/body | Parent may miss `status=diarized` and `segment_count`, weakening transcription completion correctness. | Real uses `POST /points/?wait=true`; other code uses `POST /points/payload?wait=true` or full `PUT`. | Replace with known-good merge/upsert or payload endpoint and fail the job if parent update fails. |
| Partial write/handoff can create orphan pending segments | Segment points can exist without transcription jobs or with wrong `segment_count`. | Segment write and queue pushes are separate; queue push failures are logged only. | Push transcription jobs only after verified writes; retry or fail parent explicitly. |

### High

| Finding | Impact | Evidence | Recommendation |
| --- | --- | --- | --- |
| No explicit diarization failure state in Qdrant | UI/operators cannot distinguish waiting from failed. | Catch blocks only print errors. | Add `diarization_failed` status and bounded error fields. |
| Reruns are not idempotent | Stale segments remain when a rerun produces fewer segments; duplicate jobs possible. | Deterministic segment IDs but no stale cleanup/run marker. | Add stale segment cleanup or active run ID. |
| Model/cache startup is not reproducible | Runtime may download or fail due gated model/cache drift. | No revision pin, no offline mode, no explicit `cache_dir`. | Pin revision/cache path and add preflight validation. |
| Docker/Compose do not configure GPU | Real diarization will run CPU by default and may be slow. | No `pipeline.to(cuda)` and no Compose GPU stanza. | Keep CPU-safe validation first; later add GPU override and runtime check. |

### Medium

| Finding | Impact | Evidence | Recommendation |
| --- | --- | --- | --- |
| Temp audio files and RTTM outputs are not cleaned | Disk grows over time. | No `os.unlink(local_path)`; RTTM always retained. | Add `finally` cleanup for temp audio and retention decision for RTTM. |
| No HTTP timeouts | Worker can hang indefinitely on MinIO/Qdrant. | `requests.get/post/put` without timeouts. | Add connect/read timeouts. |
| Dependency set includes unused packages | Larger image and slower builds. | `gradio`, `minio`, `ffmpeg-python`, `librosa` not used directly. | Remove only after import/startup validation. |
| Mock worker masks real parent-update failure | Dev stack can pass while prod real worker fails. | Mock uses safer helper than real. | Align real and mock semantics after real fix. |

### Low

| Finding | Impact | Evidence | Recommendation |
| --- | --- | --- | --- |
| `speaker` labels are run-local | Speaker identities may shift across reruns. | Pyannote emits labels like `SPEAKER_00`. | Treat labels as per-file labels only. |
| `segments` vs `segment_count` naming mismatch persists elsewhere | Some UI/backend list fields may not show count. | Prior audits and source. | Standardize later, outside diarization repair. |
| Dagster event endpoint likely absent | Best-effort event logs fail quietly. | Workers post `/events`; Dagster file has no such endpoint. | Remove or replace later. |

## Recommended Repair Stages

1. Fix model-loading and authentication compatibility without changing queue/Qdrant behavior: keep `use_auth_token` for pyannote 3.1.1, add a clear preflight message, avoid `token=`, and do not download during static validation.
2. Add queue safety: `diarization_processing_queue`, `diarization_failed_queue`, atomic move, startup recovery, attempts, bounded error payloads, and parent failure status.
3. Make Qdrant writes explicit and idempotent: correct parent update, require successful segment writes, verify counts, handle stale segments or add `diarization_run_id`.
4. Align real and mock contracts: same parent update semantics, failure statuses, queue payload additions, and idempotency assumptions.
5. Stabilize cache/model configuration: explicit `HF_HOME` or cache mount, optional `cache_dir`, revision pin, and documented gated-model acceptance.
6. Clean dependencies and Docker image: remove unused packages and add `gradio/diarization/.dockerignore` only after safe validation.
7. Perform CPU-safe static/import validation without loading models where possible; use image metadata/import probes only with no network and no worker entrypoint.
8. Later perform GPU validation with a GPU-specific Compose override and `pipeline.to(torch.device("cuda"))` if required.
9. Run one controlled conversion -> diarization -> transcription test with non-sensitive audio after queues are empty and rollback is ready.

## Safe Validation Strategy

Allowed before implementation:

1. `python -m py_compile gradio/diarization/diarization.py mock_workers/mock_diarization.py`.
2. `docker compose config --quiet` and `docker compose -f compose.dev.yml config --quiet`.
3. Read-only Redis `LLEN` checks.
4. Read-only Qdrant scrolls with `with_vector=false`.
5. Read-only Docker `ps`, image listing, and inspect commands when Docker memory permits.
6. Optional no-network image metadata probes with entrypoint overridden, not running `diarization.py`.

Not allowed until a later approved validation stage:

1. `docker compose up` for real diarization.
2. `docker build` for diarization.
3. Hugging Face login or model download.
4. Running pyannote inference.
5. Redis queue pushes/pops for test jobs.
6. Qdrant or MinIO writes.
7. Container/image/volume/cache cleanup.

## Explicit Items That Must Not Change

During the next repair stage, preserve unless explicitly approved:

1. Qdrant djb2 uint64 ID algorithm.
2. Queue names `conversion_queue`, `diarization_queue`, and `transcription_queue`; add processing/failed queues without renaming existing queues.
3. Transcription handoff required fields: `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url`.
4. Full-file `minio_url` plus timestamps contract for transcription.
5. Segment payload keys consumed by frontend/backend/transcription.
6. Parent `job_id`/`file_id` association.
7. Current running transcription worker, its HF cache volume, and all transcription queues.
8. Protected Docker volumes: `transcript-app_minio_data`, `transcript-app_qdrant_data`, `transcript-app_dagster_home`, `transcript-app_hf_cache`.
9. Hugging Face tokens and `.env` secrecy.
10. Unrelated frontend changes.

## Final Assessment

The diarization-to-transcription payload shape is currently compatible with the stabilized transcription worker. The larger problem is operational correctness around it: destructive diarization queue consumption, weak Qdrant parent update semantics, no failure state, no idempotent rerun strategy, and unstable model/cache configuration.

The checked-in `Pipeline.from_pretrained(..., use_auth_token=...)` call is compatible with `pyannote.audio==3.1.1`. The previously observed `unexpected token argument` failure is explained by using `token=` with this API, not by the current checked-in argument spelling. Authentication is still not fully validated because gated-model terms/token access and cache completeness were not tested in this audit.
