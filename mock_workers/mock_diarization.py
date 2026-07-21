# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: mock_diarization.py
# Description: Mock worker for development testing
# First Written on: 03/07/2026
# Edited on: 21/07/2026
"""
Mock diarization worker.

Matches the real diarization worker's Redis/Qdrant contract without running
pyannote or reading audio. It creates a fixed deterministic segment layout so
the dev stack can exercise queue reliability and downstream transcription.
"""
import os
import time
import json
import redis
from datetime import datetime

from qdrant_helpers import (
    hash_string_to_uint64,
    get_point,
    upsert_point,
    upsert_points,
    delete_points,
    scroll_filter,
)
from worker_heartbeat import start_heartbeat

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
start_heartbeat(r, "diarization")

DIARIZATION_QUEUE = "diarization_queue"
DIARIZATION_PROCESSING_QUEUE = "diarization_processing_queue"
DIARIZATION_FAILED_QUEUE = "diarization_failed_queue"
DIARIZATION_MAX_ATTEMPTS = max(1, int(os.getenv("DIARIZATION_MAX_ATTEMPTS", "3")))
MAX_RAW_JOB_CHARS = 1000

# Fixed fake diarization layout â€” two speakers alternating, ~5s segments.
FAKE_SEGMENTS = [
    {"speaker": "SPEAKER_00", "start": 0.0, "end": 4.8},
    {"speaker": "SPEAKER_01", "start": 5.1, "end": 9.6},
    {"speaker": "SPEAKER_00", "start": 10.0, "end": 14.2},
    {"speaker": "SPEAKER_01", "start": 14.6, "end": 18.9},
]


class DiarizationJobError(Exception):
    pass


def utc_now():
    return datetime.now().isoformat()


def sanitize_error_message(error):
    message = str(error).strip() or error.__class__.__name__
    message = " ".join(message.split())
    if len(message) > 180:
        message = message[:177] + "..."
    return message


def serialize_job(job):
    return json.dumps(job, separators=(",", ":"))


def decode_job(job_data):
    if isinstance(job_data, bytes):
        job_data = job_data.decode("utf-8")
    try:
        job = json.loads(job_data)
    except json.JSONDecodeError as e:
        raise DiarizationJobError(f"malformed JSON job: {e.msg}")
    if not isinstance(job, dict):
        raise DiarizationJobError("job payload must be a JSON object")
    return job


def validate_job(job):
    for field in ("file_id", "minio_url"):
        if field not in job:
            raise DiarizationJobError(f"missing required field: {field}")
    file_id = str(job["file_id"]).strip()
    minio_url = str(job["minio_url"]).strip()
    if not file_id:
        raise DiarizationJobError("empty file_id")
    if not minio_url:
        raise DiarizationJobError("empty minio_url")
    job["file_id"] = file_id
    job["minio_url"] = minio_url
    job["attempts"] = int(job.get("attempts", 0) or 0)
    return job


def remove_processing_job(job_data):
    removed = r.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    if removed == 0:
        print("âš ï¸ [mock_diarization] processing queue item was not found during removal")
    return removed


def requeue_job(job_data, job, error_message):
    job["attempts"] = int(job.get("attempts", 0) or 0) + 1
    pipe = r.pipeline(transaction=True)
    pipe.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    pipe.lpush(DIARIZATION_QUEUE, serialize_job(job))
    pipe.execute()
    print(
        f"ðŸ” [mock_diarization] retrying {job.get('file_id', 'unknown')} "
        f"(attempt {job['attempts']}/{DIARIZATION_MAX_ATTEMPTS}): {error_message}"
    )


def update_parent_failure(file_id, error_message):
    numeric_id = hash_string_to_uint64(file_id)
    upsert_point(numeric_id, {
        "status": "diarization_failed",
        "diarization_error": sanitize_error_message(error_message),
        "diarization_failed_at": utc_now(),
    })
    print(f"âœ… [mock_diarization] marked parent {file_id} -> diarization_failed")


def fail_job(job_data, job, error_message):
    failure_payload = dict(job) if isinstance(job, dict) else {}
    failure_payload["attempts"] = max(
        int(failure_payload.get("attempts", 0) or 0), DIARIZATION_MAX_ATTEMPTS
    )
    failure_payload["error"] = error_message
    failure_payload["failed_at"] = utc_now()

    file_id = str(failure_payload.get("file_id", "")).strip()
    if file_id:
        try:
            update_parent_failure(file_id, error_message)
        except Exception as e:
            print(
                f"âš ï¸ [mock_diarization] failed to write final failure status for {file_id}: "
                f"{sanitize_error_message(e)}"
            )

    pipe = r.pipeline(transaction=True)
    pipe.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    pipe.lpush(DIARIZATION_FAILED_QUEUE, serialize_job(failure_payload))
    pipe.execute()
    print(f"ðŸ›‘ [mock_diarization] final failure for {file_id or 'unknown'}: {error_message}")


def fail_malformed_job(job_data, error):
    error_message = sanitize_error_message(error)
    raw_job = job_data.decode("utf-8", errors="replace") if isinstance(job_data, bytes) else str(job_data)
    raw_job_truncated = len(raw_job) > MAX_RAW_JOB_CHARS
    if raw_job_truncated:
        raw_job = raw_job[:MAX_RAW_JOB_CHARS]
    failure_payload = {
        "raw_job": raw_job,
        "attempts": DIARIZATION_MAX_ATTEMPTS,
        "error": error_message,
        "failed_at": utc_now(),
    }
    if raw_job_truncated:
        failure_payload["raw_job_truncated"] = True
    pipe = r.pipeline(transaction=True)
    pipe.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    pipe.lpush(DIARIZATION_FAILED_QUEUE, serialize_job(failure_payload))
    pipe.execute()
    print(f"ðŸ›‘ [mock_diarization] final malformed-job failure: {error_message}")


def handle_job_failure(job_data, job, error):
    error_message = sanitize_error_message(error)
    attempts = int(job.get("attempts", 0) or 0) if isinstance(job, dict) else 0
    if attempts + 1 >= DIARIZATION_MAX_ATTEMPTS:
        fail_job(job_data, job, error_message)
    else:
        requeue_job(job_data, job, error_message)


def recover_processing_jobs():
    recovered = 0
    while True:
        job_data = r.rpop(DIARIZATION_PROCESSING_QUEUE)
        if job_data is None:
            break
        r.lpush(DIARIZATION_QUEUE, job_data)
        recovered += 1
    print(f"ðŸ” [mock_diarization] recovered {recovered} processing jobs")


def update_parent_metadata(file_id, segment_count):
    numeric_id = hash_string_to_uint64(file_id)
    existing = get_point(numeric_id) or {}
    existing_payload = existing.get("payload", {})
    updated_payload = {**existing_payload}
    updated_payload["status"] = "diarized"
    updated_payload["segment_count"] = segment_count
    updated_payload["diarization_completed_at"] = utc_now()
    updated_payload.pop("diarization_error", None)
    updated_payload.pop("diarization_failed_at", None)
    upsert_point(numeric_id, updated_payload)
    print(f"âœ… [mock_diarization] updated parent {file_id} -> diarized")


def build_segment_points_and_jobs(file_id, segments, minio_url):
    points = []
    transcription_jobs = []
    for idx, segment in enumerate(segments):
        segment_id = f"{file_id}_seg_{idx:03d}"
        numeric_id = hash_string_to_uint64(segment_id)
        segment_payload = {
            "type": "segment",
            "parent_job_id": file_id,
            "segment_index": idx,
            "speaker": segment["speaker"],
            "start_time": segment["start"],
            "end_time": segment["end"],
            "minio_url": minio_url,
            "transcript_text": None,
            "embedding_generated": False,
            "status": "pending_transcription",
            "timestamp": utc_now(),
        }
        points.append({
            "id": numeric_id,
            "vector": [0.0] * 512,
            "payload": segment_payload,
        })
        transcription_jobs.append({
            "segment_id": segment_id,
            "file_id": file_id,
            "start_time": segment["start"],
            "end_time": segment["end"],
            "speaker": segment["speaker"],
            "minio_url": minio_url,
        })
    return points, transcription_jobs


def replace_segment_entries(file_id, segments, minio_url):
    points, transcription_jobs = build_segment_points_and_jobs(file_id, segments, minio_url)
    new_ids = {point["id"] for point in points}
    existing_segments = scroll_filter([
        {"key": "type", "match": {"value": "segment"}},
        {"key": "parent_job_id", "match": {"value": file_id}},
    ])
    stale_ids = [point["id"] for point in existing_segments if point.get("id") not in new_ids]
    delete_points(stale_ids)
    upsert_points(points)

    discovered = scroll_filter([
        {"key": "type", "match": {"value": "segment"}},
        {"key": "parent_job_id", "match": {"value": file_id}},
    ])
    discovered_ids = {point.get("id") for point in discovered}
    if len(discovered_ids.intersection(new_ids)) != len(new_ids):
        raise RuntimeError("segment write verification failed")
    if len(discovered) != len(points):
        raise RuntimeError(f"segment count verification failed: expected {len(points)}, found {len(discovered)}")
    print(f"âœ… [mock_diarization] replaced {len(points)} fake segments in Qdrant")
    return transcription_jobs


def push_transcription_jobs(jobs):
    pipe = r.pipeline(transaction=True)
    for job in jobs:
        pipe.lpush("transcription_queue", serialize_job(job))
    pipe.execute()
    print(f"âœ… [mock_diarization] pushed {len(jobs)} jobs to transcription_queue")


def worker_loop():
    print("ðŸš€ [mock_diarization] started, waiting for jobs...")
    recover_processing_jobs()
    # Recovery assumes one mock diarization worker in the dev stack.
    while True:
        job_data = None
        job = None
        try:
            job_data = r.execute_command(
                "BLMOVE",
                DIARIZATION_QUEUE,
                DIARIZATION_PROCESSING_QUEUE,
                "LEFT",
                "RIGHT",
                10,
            )
            if job_data is None:
                continue
            try:
                job = validate_job(decode_job(job_data))
            except DiarizationJobError as e:
                try:
                    decoded = decode_job(job_data)
                    if isinstance(decoded, dict):
                        job = decoded
                        handle_job_failure(job_data, job, e)
                    else:
                        fail_malformed_job(job_data, e)
                except DiarizationJobError:
                    fail_malformed_job(job_data, e)
                continue

            file_id = job["file_id"]
            minio_url = job["minio_url"]
            print(f"ðŸŽ­ [mock_diarization] processing file {file_id} (fake â€” no real audio read)")

            jobs = replace_segment_entries(file_id, FAKE_SEGMENTS, minio_url)
            update_parent_metadata(file_id, len(FAKE_SEGMENTS))
            push_transcription_jobs(jobs)
            remove_processing_job(job_data)

        except Exception as e:
            print(f"âš ï¸ [mock_diarization] error: {sanitize_error_message(e)}")
            if job_data is not None:
                if job is None:
                    fail_malformed_job(job_data, e)
                else:
                    handle_job_failure(job_data, job, e)
            time.sleep(5)


if __name__ == "__main__":
    worker_loop()
