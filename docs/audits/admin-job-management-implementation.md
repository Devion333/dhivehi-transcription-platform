# Admin Job Management Implementation

Date: 2026-07-16

Status: implemented for administrator visibility and controlled retry.

## Files Created Or Modified

Backend:

| File | Purpose |
| --- | --- |
| `backend/internal/services/admin_jobs.go` | Admin job DTO mapping, queue summaries, failure sanitization, retry eligibility, payload reconstruction, retry enqueue, health summary. |
| `backend/internal/services/admin_jobs_test.go` | Focused tests for sanitization, status derivation, retry payload reconstruction, queue-unavailable error, and audit metadata allowlist. |
| `backend/internal/services/api_errors.go` | Adds job-management error codes. |
| `backend/internal/services/audit.go` | Adds job-management audit actions and metadata allowlist. |
| `backend/internal/dtos/api.go` | Adds admin job, pipeline stage, queue state, retry, and health DTOs. |
| `backend/internal/handlers/admin_jobs.go` | Adds admin job list/detail/retry/health handlers. |
| `backend/internal/handlers/api_helpers.go` | Maps job-management service errors to standardized API errors. |
| `backend/cmd/backend/main.go` | Registers `/api/admin/jobs` routes under existing admin middleware. |

Frontend:

| File | Purpose |
| --- | --- |
| `frontend/transcription-frontend/src/lib/api/admin-jobs.ts` | Typed admin job API client. |
| `frontend/transcription-frontend/src/lib/admin-jobs-utils.ts` | Pure status labels, URL-state normalization, retry copy, and date helpers. |
| `frontend/transcription-frontend/src/app/Admin/Jobs/page.tsx` | Admin jobs route wrapper. |
| `frontend/transcription-frontend/src/app/Admin/Jobs/jobs-client.tsx` | Jobs page, filters, health summary, list, detail dialog, retry confirmation. |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Adds Jobs to administrator navigation. |
| `frontend/transcription-frontend/src/lib/api/types.ts` | Adds admin job types and `job_management` audit category. |
| `frontend/transcription-frontend/src/lib/admin-audit-utils.ts` | Adds retry audit labels and category. |

Docs:

| File | Purpose |
| --- | --- |
| `docs/api/frontend-backend-contract.md` | Documents admin job endpoints and DTOs. |
| `docs/audits/admin-job-management-implementation.md` | This implementation audit. |

## Queue And Status Audit

Actual Redis queue names:

| Stage | Queued | Processing | Failed |
| --- | --- | --- | --- |
| Conversion | `conversion_queue` | none in current worker | none in current worker |
| Diarization | `diarization_queue` | `diarization_processing_queue` | `diarization_failed_queue` |
| Transcription | `transcription_queue` | `transcription_processing_queue` | `transcription_failed_queue` |

Conversion payload: `file_id`, `minio_url`, `filename`.

Diarization payload: `file_id`, `minio_url`, optional `attempts`.

Transcription payload: `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url`, optional `attempts`, optional `segment_saved`.

Parent payload statuses observed or supported: `uploaded`, `converting`, `conversion_failed`, `diarizing`, `diarized`, `diarization_failed`, `transcribing`, `transcribed`, `transcription_failed`, `failed`, `completed`, `complete`.

Segment payload statuses observed: `pending_transcription`, `transcribed`, `transcription_failed`.

Analysis payload statuses observed or supported: `not_started`, `processing`, `analysis_pending`, `complete`, `analysis_complete`, `completed`, `failed`.

## Worker Retry Behavior

Real diarization and transcription workers use Redis processing queues, recover processing jobs on startup, and retry failed processing jobs until max attempts. Defaults are `DIARIZATION_MAX_ATTEMPTS=3` and `TRANSCRIPTION_MAX_ATTEMPTS=3`.

Final diarization failures are written to Qdrant parent fields `diarization_error` and `diarization_failed_at`, then pushed to `diarization_failed_queue` with `attempts`, `error`, and `failed_at`.

Final transcription failures are written to segment fields `transcription_error` and `transcription_failed_at`, then pushed to `transcription_failed_queue` with `attempts`, `error`, and `failed_at`.

Failed queue entries remain present; no inspected code consumes them.

Mock diarization follows the real processing/failed queue contract. Mock transcription remains simpler and consumes `transcription_queue` directly without processing/failed queues.

## Canonical Status Model

Admin job canonical statuses preserve stored internal statuses where useful and add analysis-specific public states:

| Stored source | Admin status |
| --- | --- |
| `uploaded` | `uploaded` |
| `converting` | `converting` |
| `conversion_failed` | `conversion_failed` |
| `diarizing` | `diarizing` |
| `diarized` | `diarized` |
| `diarization_failed` | `diarization_failed` |
| `transcribing` | `transcribing` |
| failed segment | `transcription_failed` |
| `transcribed` | `transcribed` |
| analysis `processing`/`analysis_pending` | `analysis_processing` |
| analysis `complete`/`analysis_complete`/`completed` | `analysis_complete` |
| analysis `failed` | `analysis_failed` |
| unknown | displayed safely with readable label |

Current stage mapping is derived from parent status first, then segment failure state, then analysis state.

## Endpoints

All endpoints require `RequireAuth()` and `RequireRole("admin")` in the Go backend:

| Method | Path |
| --- | --- |
| `GET` | `/api/admin/jobs` |
| `GET` | `/api/admin/jobs/:jobId` |
| `POST` | `/api/admin/jobs/:jobId/retry` |
| `GET` | `/api/admin/jobs/health` |

No unprotected legacy equivalents were added.

## DTOs

`AdminJobSummary` includes job ID, filename, reference, category, status, current stage, segment count, analysis status, created/updated timestamps, safe failure code/message, and retryability.

`AdminJobDetail` adds notes, requested speakers, media availability, pipeline stages, queue state, and retry count.

`PipelineStage` includes name, status, started/completed timestamps where supported, retry count, and safe failure message.

Raw Redis payloads, worker URLs, MinIO credentials, Qdrant numeric IDs, stack traces, provider responses, model tokens, and transcript text are not returned.

## Failure Sanitization

`SafeFailureMessage` trims and bounds failure text, removes obvious filesystem paths, URLs, host:port strings, and cuts off stack trace markers. Full raw errors remain only in worker/backend logs.

## Retry Eligibility

Retry is limited to recognized failed stages:

| Stage | Eligible state |
| --- | --- |
| Conversion | `conversion_failed` with original media reference. |
| Diarization | `diarization_failed` with media reference. |
| Transcription | failed segment(s) or `transcription_failed`. |
| Analysis | analysis status `failed` or admin status `analysis_failed`. |

Active, queued, processing, completed, uploaded, and non-failed jobs are rejected with safe conflict errors.

## Retry Implementation Per Stage

Conversion retry reconstructs the existing conversion payload from parent metadata and pushes only `conversion_queue`.

Diarization retry reconstructs the existing diarization payload from parent metadata and pushes only `diarization_queue`.

Transcription retry reconstructs one existing transcription payload per failed segment and pushes only `transcription_queue`.

Analysis retry calls the existing synchronous analysis runner and persists analysis fields through `UpdateParentPayload`; it does not publish to Redis.

The browser never supplies queue names or raw payloads.

## Retry Limits

The backend uses the current worker default max attempts of `3`. If bounded failed-queue inspection finds attempts at or above the limit, retry returns `JOB_RETRY_LIMIT_REACHED`. No override was added.

## Queue State Checks

Queue presence checks use bounded `LRANGE` inspection over the known list queues, capped at `200` entries. Queue counts use `LLEN`. This avoids unbounded Redis scans but means presence can be unknown for very deep queues; parent status remains the primary duplicate guard.

## Health Endpoint

Health reports backend, Redis, Qdrant, MinIO, and queue counts for conversion, diarization, and transcription. Worker state is `unknown` because there is no reliable worker heartbeat. Internal URLs are not exposed.

## Audit Actions

Added `job_management` audit actions:

| Action | Outcome |
| --- | --- |
| `admin.job_retry_requested` | Retry request accepted by handler. |
| `admin.job_retry_succeeded` | Retry was queued or analysis completed. |
| `admin.job_retry_failed` | Retry attempt was rejected or failed. |

Allowlisted metadata: `jobId`, `stage`, `previousStatus`, `newStatus`, `retryCount`, `failureCode`.

## Frontend Page

`/Admin/Jobs` is available only to administrators through the existing admin route guard and backend authorization. Desktop uses a table; mobile uses cards. The page includes concise health, filters, list pagination, detail dialog, and retry confirmation.

## Filters And Detail View

URL-backed filters: `page`, `search`, `status`, `stage`, `failedOnly`, `dateFrom`, `dateTo`. Page size is fixed at `20`. Search submission is explicit and changing filters resets page.

Detail view shows safe metadata, pipeline stages, safe failure summary, retry count, queue state, and links to transcript/analysis when appropriate. It does not dump raw JSON.

## Tests

Backend tests cover failure sanitization, status/stage derivation from failed segments, retry payload reconstruction, no failed-segment rejection, queue-unavailable error, and retry audit metadata allowlisting.

Existing admin role middleware tests continue to cover admin-only enforcement.

Frontend has no component test framework; pure helpers were added for status labels, retry availability, URL normalization, stage labels, and date formatting.

## Runtime Validation

Automated validation commands are recorded in the final implementation response. Runtime validation against the lightweight dev stack should use controlled non-production fixtures only. No real ML workers should be started.

## Limitations

Conversion has no processing or failed queue in the inspected worker contract, so conversion queue state can only report queued count and parent status.

Bounded Redis list inspection may not detect a job deeper than the first `200` entries.

Worker health remains `unknown` without a heartbeat or health check contract.

No retry-limit override, cancellation, deletion, manual status editing, ownership, settings, arbitrary queue publishing, or worker/model changes were added.

## Next Recommended Stage

Add a worker heartbeat/status contract if reliable worker availability must be shown, then consider explicit cancellation only after queue semantics and ownership rules are designed.
