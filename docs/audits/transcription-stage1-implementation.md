# Transcription Stage 1 Implementation

Implementation date: 2026-07-14. Scope was strictly limited to transcription correctness and queue safety. Model loading, inference configuration, audio preprocessing, denoising, language prompting, Docker dependencies, CUDA configuration, Compose GPU settings, and deployment configuration were not changed.

## Files Changed

| File | Change |
| --- | --- |
| `gradio/transcription/transcription.py` | Added processing queue lifecycle, retries, failed-job tracking, job validation, Qdrant success/failure handling, corrected parent completion checks, HTTP timeouts, and temp-file cleanup. |
| `mock_workers/mock_transcription.py` | Aligned completion filtering with `type=segment`, paginated helper behavior, and `transcription_failed` failure fields. |
| `mock_workers/qdrant_helpers.py` | Added request timeouts and paginated `scroll_filter` with `with_vector=false`. |
| `ARCHITECTURE.md` | Updated affected Redis queue/status and transcription-worker behavior references. |
| `docs/audits/transcription-stage1-implementation.md` | This implementation report. |

## Implemented Changes

### Queue Safety

The real transcription worker no longer destructively consumes jobs with direct `BLPOP`. It now uses:

| Queue | Purpose |
| --- | --- |
| `transcription_queue` | Ready jobs from diarization and retry handling. |
| `transcription_processing_queue` | Jobs atomically moved into active processing. |
| `transcription_failed_queue` | Malformed or exhausted jobs after final failure. |

The worker uses Redis `BLMOVE transcription_queue transcription_processing_queue LEFT RIGHT 10` through `execute_command`. This preserves the previous left-pop behavior as closely as practical while adding an acknowledgement-style processing queue.

On successful completion, the exact raw job payload is removed from `transcription_processing_queue` with `LREM`.

### Retry Behavior

Each parsed job can carry an `attempts` field. Missing `attempts` defaults to `0`.

On retryable failure:

1. The worker increments `attempts`.
2. Removes the old exact payload from `transcription_processing_queue`.
3. Pushes the updated payload back to `transcription_queue`.

After max attempts:

1. The worker removes the exact payload from `transcription_processing_queue`.
2. Pushes a failed payload to `transcription_failed_queue`.
3. Updates the segment, when `segment_id` is available, to `status=transcription_failed`.

No exponential backoff, scheduling queue, or distributed lease system was added in this stage.

### New Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRANSCRIPTION_MAX_ATTEMPTS` | `3` | Maximum attempts before a job is moved to `transcription_failed_queue`. Values below `1` are clamped to `1`. |
| `HTTP_CONNECT_TIMEOUT_SECONDS` | `10` | Connect timeout for transcription-worker HTTP requests. |
| `HTTP_READ_TIMEOUT_SECONDS` | `120` | Read timeout for transcription-worker HTTP requests. |

### Job Validation

The worker validates every parsed job before processing.

Required fields:

`segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, `minio_url`.

Rejected payloads:

1. Malformed JSON.
2. Non-object JSON.
3. Missing required fields.
4. Non-numeric `start_time` or `end_time`.
5. Negative `start_time`.
6. `end_time <= start_time`.
7. Empty `segment_id`.
8. Empty `file_id`.
9. Empty `minio_url`.

Malformed JSON cannot reliably carry an attempt counter, so it is moved directly to `transcription_failed_queue` with a concise error and raw payload preview. Parsed invalid jobs use the normal retry/max-attempt path. If a parsed invalid job has a segment ID, final failure updates the segment status in Qdrant.

### Qdrant Status Fields

Successful transcription preserves existing behavior and adds cleanup for stale failure fields:

```text
transcript_text = model output
status = transcribed
transcription_completed_at = timestamp
```

On successful segment update, these stale fields are removed from the payload if present:

```text
transcription_error
transcription_failed_at
```

Final failure writes:

```text
status = transcription_failed
transcription_error = concise error message
transcription_failed_at = timestamp
```

The failure helper preserves existing payload fields and vectors by fetching the existing point and upserting a merged payload.

### Qdrant Update Success Handling

The required Qdrant writes now raise controlled errors on failure:

1. `update_segment_in_qdrant(...)` raises `QdrantUpdateError` if the segment point is missing, fetch fails, or upsert fails.
2. `update_parent_status(...)` raises `QdrantUpdateError` if the parent point is missing, fetch fails, or upsert fails.
3. Parent-completion checking is not run when the current segment update fails.

Qdrant write errors no longer silently continue through the worker loop.

### Parent Completion Logic

`check_all_segments_transcribed(file_id)` now:

1. Filters by both `type=segment` and `parent_job_id=file_id`.
2. Uses `with_payload=true` and `with_vector=false`.
3. Paginates through all matching points using Qdrant `next_page_offset`.
4. Explicitly returns `False` when zero segments are found.
5. Returns `True` only when every matching segment has `status=transcribed`.
6. Treats `transcription_failed` and all other non-transcribed states as incomplete.
7. Raises `QdrantCompletionCheckError` for Qdrant HTTP errors or non-advancing scroll offsets.
8. Fetches the parent payload and compares discovered segment count to `segment_count` when present.

If `segment_count` is present and differs from the discovered segment count, completion returns `False`. If `segment_count` is absent, the complete paginated segment result is used without inventing a count.

### Parent Status Update

The worker only calls `update_parent_status(file_id)` after:

1. The current segment was transcribed.
2. The segment Qdrant update succeeded.
3. The full paginated completion check confirmed all segments are transcribed.

The parent status remains `transcribed`. No `completed` status was introduced.

### Processing-Queue Recovery

On worker startup, `recover_processing_jobs()` moves all existing jobs from `transcription_processing_queue` back to `transcription_queue` and logs the recovered count.

This stage intentionally assumes one real transcription worker for the FYP demonstration. It does not implement timestamp-based leases or distributed ownership.

### Temporary-File Cleanup

`download_audio_segment()` now removes the temporary audio file in a `finally` block. Cleanup runs after successful processing and after download, decode, denoise, slicing, or later exceptions once the temp file exists.

No source MinIO object, shared cache file, or model file is deleted.

### HTTP Timeouts

Explicit timeouts were added to transcription-worker HTTP calls:

1. MinIO/audio download via `requests.get`.
2. Qdrant point fetch via `requests.get`.
3. Qdrant upsert via `requests.put`.
4. Qdrant scroll via `requests.post`.
5. Optional Dagster event post via `requests.post`.

The mock Qdrant helper also now uses the same timeout defaults for Qdrant calls.

## Preserved Behavior

The following were intentionally not changed:

1. `model_path = "Devion333/whisper-small-dv-syn"`.
2. Model/processor loading lifecycle.
3. `language="si"`.
4. `processor.get_decoder_prompt_ids(...)` behavior.
5. `torch.no_grad()` generation block.
6. Generation settings: `do_sample=False`, `temperature=0.0`, `num_beams=1`, `max_new_tokens=444`.
7. Audio download source URL contract.
8. `librosa.load(..., sr=16000)`.
9. `noisereduce.reduce_noise(...)`.
10. Segment slicing logic.

## Known Limitations

1. Completion-check Qdrant errors after a successful segment update are treated as job failures, which can cause a later retry of an already-transcribed segment. This preserves safety for parent completion but can repeat work.
2. Malformed non-JSON jobs are moved directly to failed queue because no trustworthy payload exists for attempt tracking.
3. Startup recovery assumes one real transcription worker. Multiple concurrent real workers would need lease timestamps or worker IDs later.
4. The real module still loads the Whisper model at import time, so import-based unit tests are intentionally avoided in this stage.
5. Mock transcription remains lightweight and does not implement the full Redis processing-queue lifecycle because it does not run model/audio failure paths.

## Validation Performed

Safe validation performed:

```text
python -m py_compile gradio/transcription/transcription.py mock_workers/mock_transcription.py mock_workers/qdrant_helpers.py
```

Result: passed with no output.

## Validation Not Performed

The following were intentionally not performed:

1. Importing `gradio/transcription/transcription.py`, because import-time code loads the Whisper model.
2. Running the real transcription worker.
3. Loading or downloading the Whisper model.
4. Docker build or Compose stack startup.
5. GPU runtime validation.
6. End-to-end queue tests against live Redis/Qdrant/MinIO.

These should be covered later in a controlled runtime validation pass with a prepared model cache or mockable module boundary.
