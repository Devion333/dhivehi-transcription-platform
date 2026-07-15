# Diarization Stage 1 Implementation

Implementation date: 2026-07-15. Scope was limited to diarization queue reliability, Qdrant correctness, failure states, temporary-file cleanup, and mock-worker contract alignment. Model ID, `use_auth_token`, model/cache configuration, dependency files, Dockerfiles, Compose GPU settings, audio segmentation/filtering/merging rules, transcription payload field names, and the current transcription worker were not changed.

## Files Changed

| File | Change |
| --- | --- |
| `gradio/diarization/diarization.py` | Added processing/failed queues, startup recovery, job validation, retry/dead-letter handling, Qdrant read/merge/upsert helpers, parent failure state, stale segment cleanup, deterministic segment replacement, success ordering, transcription batch push, HTTP timeouts, and temporary-file cleanup. |
| `mock_workers/mock_diarization.py` | Aligned mock diarization with the real worker queue lifecycle, validation, retry/failure handling, parent failure fields, stale segment cleanup, success ordering, and batch transcription handoff while preserving four fixed fake segments. |
| `mock_workers/qdrant_helpers.py` | Added batch point upsert and point delete helpers using `?wait=true` and existing HTTP timeout settings. |
| `docs/audits/diarization-stage1-implementation.md` | This implementation report. |

## Redis Lifecycle

The real and mock diarization workers now use:

| Queue | Purpose |
| --- | --- |
| `diarization_queue` | Ready jobs from conversion and retry handling. |
| `diarization_processing_queue` | Jobs atomically moved into active processing. |
| `diarization_failed_queue` | Malformed or exhausted jobs after final failure. |

The workers use Redis `BLMOVE diarization_queue diarization_processing_queue LEFT RIGHT 10` through `execute_command`, preserving the previous left-pop behavior while adding a processing queue.

On successful completion, the exact original processing payload is removed from `diarization_processing_queue` with `LREM` only after segment writes, parent update, and transcription batch push all succeed.

On retry, a Redis transaction removes the processing item and pushes the updated job back to `diarization_queue`.

On final failure, a Redis transaction removes the processing item and pushes a failed payload to `diarization_failed_queue`.

## Job Schema and Validation

Required fields:

```text
file_id
minio_url
```

Validation behavior:

1. Payload must be JSON object.
2. `file_id` is normalized to a non-empty stripped string.
3. `minio_url` is normalized to a non-empty stripped string.
4. `attempts` defaults to `0` and is tracked in retry payloads.

Malformed non-JSON jobs are moved directly to `diarization_failed_queue` because no trustworthy job object exists.

Malformed raw payload storage is capped at `1,000` characters. If truncated, the failed payload includes:

```json
{"raw_job_truncated": true}
```

Error messages are normalized and capped to about 180 characters.

## Retry Behavior

New environment variable:

| Variable | Default | Minimum | Purpose |
| --- | ---: | ---: | --- |
| `DIARIZATION_MAX_ATTEMPTS` | `3` | `1` | Maximum attempts before a job is moved to `diarization_failed_queue`. |

Retry flow:

1. Job is atomically moved to `diarization_processing_queue`.
2. If a retryable failure occurs, `attempts` is incremented.
3. A Redis transaction removes the exact processing item and pushes the updated payload back to `diarization_queue`.
4. Once attempts are exhausted, the job is moved to `diarization_failed_queue`.

## Failure Payload and Qdrant Fields

Final failed payloads include:

```text
attempts
error
failed_at
```

Valid jobs with a usable `file_id` also attempt to update the parent Qdrant payload:

```text
status = diarization_failed
```

Existing parent payload fields and vector are preserved using a read/merge/full-upsert flow.

If recording the parent failure state fails, the worker logs the failure clearly but still moves the failed payload to `diarization_failed_queue`.

Malformed jobs without a valid `file_id` only go to `diarization_failed_queue`.

## Qdrant Parent Update Fix

The likely-invalid parent update:

```text
POST /collections/{collection}/points/?wait=true
{"points":[id],"payload":{...}}
```

was replaced with the same pattern used by the stabilized transcription worker and mock helpers:

1. Fetch the parent point by deterministic numeric ID.
2. Preserve existing payload and vector.
3. Merge new parent fields.
4. `PUT /collections/{collection}/points?wait=true` with the full point.
5. Raise on HTTP failures.

Successful diarization sets:

```text
status = diarized
segment_count = <actual count>
```

Successful diarization also clears stale fields:

```text
diarization_error
```

## Stale-Segment Strategy

The implementation uses deterministic-ID stale cleanup rather than a `diarization_run_id` contract change.

Before writing a new segment set, the worker:

1. Scrolls all existing Qdrant points where `type=segment` and `parent_job_id=file_id` with pagination.
2. Computes deterministic IDs for the newly produced segment set.
3. Deletes only stale existing segment points whose IDs are not in the new set using `POST /points/delete?wait=true`.
4. Upserts the full new segment set with `PUT /points?wait=true`.
5. Scrolls the parent's segment points again and verifies expected IDs and expected count.

The worker does not delete segments for any other parent.

## Success Operation Ordering

The real worker now follows this order:

1. Validate job.
2. Download audio to a unique temporary file.
3. Run existing `diarize_file(...)` logic.
4. Produce the existing merged segment list.
5. Reject zero usable segments as a controlled failure.
6. Clean stale segment points for the same parent.
7. Upsert all new segment points.
8. Verify expected segment count.
9. Update parent to `status=diarized` and write `segment_count`.
10. Push all transcription jobs.
11. Remove the original item from `diarization_processing_queue`.

The parent is no longer marked `diarized` before the segment set is successfully written and verified.

## Transcription Batch Handoff

The transcription payload shape is unchanged:

```json
{
  "segment_id": "{file_id}_seg_000",
  "file_id": "{file_id}",
  "start_time": 0.0,
  "end_time": 4.8,
  "speaker": "SPEAKER_00",
  "minio_url": "http://minio:9000/uploads/..."
}
```

The worker pushes transcription jobs only after segment writes and parent update succeed. The batch is pushed through one Redis transaction/pipeline. If the batch push fails, the diarization job is retried. Segment replacement is deterministic and stale cleanup is idempotent, so retrying the diarization job does not corrupt the segment set.

## Temporary-File Cleanup

The real worker preserves the current audio behavior while changing download mechanics:

1. Uses `NamedTemporaryFile(delete=False, suffix=".wav")` for unique paths.
2. Streams `requests.get(..., stream=True)` to disk using chunks instead of loading `resp.content`.
3. Uses configured HTTP timeouts.
4. Calls `raise_for_status()`.
5. Deletes the temporary file in `finally` after success or failure.

RTTM behavior is unchanged. RTTM files are still written to `outputs/` and need a later retention/cleanup policy.

## Mock-Worker Alignment

`mock_workers/mock_diarization.py` now mirrors the real worker for:

1. `diarization_queue`, `diarization_processing_queue`, and `diarization_failed_queue` lifecycle.
2. Startup processing-queue recovery.
3. Retry counter and max attempts.
4. Malformed payload handling and raw payload truncation.
5. Parent failure fields.
6. Qdrant success ordering.
7. Stale deterministic segment cleanup.
8. Atomic transcription job batch push.

The mock still produces four fixed fake segments and does not add real audio or pyannote behavior.

## Single-Worker Recovery Assumption

Startup recovery moves all jobs from `diarization_processing_queue` back to `diarization_queue`. This intentionally assumes one real diarization worker for the FYP demonstration. Multiple concurrent real diarization workers would require leases, timestamps, or worker ownership IDs later.

## Validation Performed

Allowed validation commands were run:

```powershell
python -m py_compile gradio/diarization/diarization.py
python -m py_compile mock_workers/mock_diarization.py
python -m py_compile mock_workers/qdrant_helpers.py
docker compose config --quiet
docker compose -f compose.dev.yml config --quiet
```

Results:

| Command | Result |
| --- | --- |
| `python -m py_compile gradio/diarization/diarization.py` | Passed with no output. |
| `python -m py_compile mock_workers/mock_diarization.py` | Passed with no output. |
| `python -m py_compile mock_workers/qdrant_helpers.py` | Passed with no output. |
| `docker compose config --quiet` | Passed with no output. |
| `docker compose -f compose.dev.yml config --quiet` | Passed; Docker Compose emitted the existing warning that `version` in `compose.dev.yml` is obsolete. |

No import of `gradio/diarization/diarization.py` was performed, because importing it loads the pyannote model.

## Validation Not Performed

The following were intentionally not performed:

1. Starting the real diarization worker.
2. Building the diarization image.
3. Downloading or loading pyannote models.
4. Running GPU workloads.
5. Pushing Redis jobs.
6. Writing live Qdrant points.
7. Writing MinIO objects.
8. Modifying containers or volumes.

## Remaining Model/Cache/Dependency Work

Not changed in this stage:

1. Pyannote model ID.
2. `use_auth_token` argument.
3. Model revision or cache configuration.
4. Dependency files.
5. Dockerfiles.
6. Compose GPU settings.
7. Audio segmentation/filtering/merging rules.
8. Transcription worker implementation.

Remaining follow-up work:

1. Stabilize pyannote model/cache/revision configuration.
2. Validate Hugging Face gated model access safely.
3. Add a diarization `.dockerignore` and clean dependencies after validation.
4. Add GPU configuration only in a later GPU validation stage.
5. Define RTTM retention/cleanup policy.
6. Run a controlled conversion -> diarization -> transcription integration test after approval.
