# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: diarization.py
# Description: Gradio worker for the diarization service
# First Written on: 03/07/2026
# Edited on: 21/07/2026
import os
import time
import json
import tempfile
import requests
import redis
from datetime import datetime
from pyannote.audio import Pipeline
from worker_heartbeat import start_heartbeat

# =========================
# Environment & Setup
# =========================

HUGGINGFACE_ACCESS_TOKEN = os.getenv("HUGGINGFACE_ACCESS_TOKEN", "")
if not HUGGINGFACE_ACCESS_TOKEN:
    raise EnvironmentError("Missing HUGGINGFACE_ACCESS_TOKEN.")

# Pyannote diarization pipeline
print("ðŸ”Š Loading pyannote speaker diarization pipeline...")
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1", use_auth_token=HUGGINGFACE_ACCESS_TOKEN
)
print("âœ… Pyannote diarization model loaded successfully.")

# Redis connection
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
start_heartbeat(r, "diarization", modelName="pyannote/speaker-diarization-3.1")

# Redis queue names
DIARIZATION_QUEUE = "diarization_queue"
DIARIZATION_PROCESSING_QUEUE = "diarization_processing_queue"
DIARIZATION_FAILED_QUEUE = "diarization_failed_queue"
DIARIZATION_MAX_ATTEMPTS = max(1, int(os.getenv("DIARIZATION_MAX_ATTEMPTS", "3")))
MAX_RAW_JOB_CHARS = 1000

# Qdrant backend API
QDRANT_HOST = os.getenv("QDRANT_HOST", "http://qdrant:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "file_metadata")

# HTTP timeouts
HTTP_CONNECT_TIMEOUT_SECONDS = float(os.getenv("HTTP_CONNECT_TIMEOUT_SECONDS", "10"))
HTTP_READ_TIMEOUT_SECONDS = float(os.getenv("HTTP_READ_TIMEOUT_SECONDS", "120"))
HTTP_TIMEOUT = (HTTP_CONNECT_TIMEOUT_SECONDS, HTTP_READ_TIMEOUT_SECONDS)

# Output folder for RTTM files
OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Dagster integration (optional)
DAGSTER_ENABLED = os.getenv("DAGSTER_ENABLED", "false").lower() == "true"
DAGSTER_API_URL = os.getenv("DAGSTER_API_URL", "http://dagster:3000")


class DiarizationJobError(Exception):
    """Controlled exception for retryable or final diarization failures."""


class QdrantUpdateError(Exception):
    """Raised when a required Qdrant operation fails."""


def utc_now():
    return datetime.now().isoformat()


def sanitize_error_message(error):
    message = str(error).strip() or error.__class__.__name__
    message = " ".join(message.split())
    if len(message) > 180:
        message = message[:177] + "..."
    return message


def log_dagster_event(event_type, asset_key, metadata):
    """Send event to Dagster for tracking."""
    if not DAGSTER_ENABLED:
        return

    try:
        payload = {
            "event_type": event_type,
            "asset_key": asset_key,
            "metadata": metadata,
            "timestamp": utc_now(),
        }
        requests.post(f"{DAGSTER_API_URL}/events", json=payload, timeout=HTTP_TIMEOUT)
    except Exception as e:
        print(f"âš ï¸ Failed to log Dagster event: {e}")


# =========================
# Helper Functions
# =========================

def hash_string_to_uint64(s):
    """Convert string to uint64 for Qdrant ID."""
    hash_val = 5381
    for c in s:
        hash_val = ((hash_val << 5) + hash_val) + ord(c)
    return hash_val & 0xFFFFFFFFFFFFFFFF


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


def serialize_job(job):
    return json.dumps(job, separators=(",", ":"))


def remove_processing_job(job_data):
    removed = r.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    if removed == 0:
        print("âš ï¸ Diarization processing queue item was not found during removal")
    return removed


def requeue_job(job_data, job, error_message):
    job["attempts"] = int(job.get("attempts", 0) or 0) + 1
    updated_job = serialize_job(job)
    pipe = r.pipeline(transaction=True)
    pipe.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    pipe.lpush(DIARIZATION_QUEUE, updated_job)
    pipe.execute()
    print(
        f"ðŸ” Retrying diarization for {job.get('file_id', 'unknown')} "
        f"(attempt {job['attempts']}/{DIARIZATION_MAX_ATTEMPTS}): {error_message}"
    )


def update_parent_failure_in_qdrant(file_id, error_message):
    numeric_id = hash_string_to_uint64(file_id)
    point_data = get_qdrant_point(numeric_id, "parent")
    existing_payload = point_data.get("payload", {})
    existing_vector = point_data.get("vector", [0.0] * 512)
    updated_payload = {**existing_payload}
    updated_payload["status"] = "diarization_failed"
    updated_payload["diarization_error"] = sanitize_error_message(error_message)
    updated_payload["diarization_failed_at"] = utc_now()
    upsert_qdrant_point(numeric_id, updated_payload, existing_vector, "parent failure")
    print(f"âœ… Marked parent {file_id} as diarization_failed")


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
            update_parent_failure_in_qdrant(file_id, error_message)
        except Exception as e:
            print(
                f"âš ï¸ Failed to write final diarization failure status for {file_id}: "
                f"{sanitize_error_message(e)}"
            )

    pipe = r.pipeline(transaction=True)
    pipe.lrem(DIARIZATION_PROCESSING_QUEUE, 1, job_data)
    pipe.lpush(DIARIZATION_FAILED_QUEUE, serialize_job(failure_payload))
    pipe.execute()
    print(f"ðŸ›‘ Final diarization failure for {file_id or 'unknown'}: {error_message}")


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
    print(f"ðŸ›‘ Final diarization failure for malformed job: {error_message}")


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
    print(f"ðŸ” Recovered {recovered} diarization processing jobs")
    return recovered


# =========================
# Diarization Function
# =========================

def diarize_file(file_path):
    """Run diarization and return segments + RTTM path."""
    diarization = pipeline(file_path)

    base_name = os.path.splitext(os.path.basename(file_path))[0]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    rttm_path = os.path.join(OUTPUT_DIR, f"{base_name}_{timestamp}.rttm")

    with open(rttm_path, "w") as f:
        diarization.write_rttm(f)

    # Collect all segments
    raw_segments = []
    for segment, _, speaker in diarization.itertracks(yield_label=True):
        duration = segment.end - segment.start
        # Skip very short segments (less than 1 second)
        if duration < 1.0:
            print(f"â© Skipping short segment: {speaker} ({duration:.2f}s)")
            continue

        raw_segments.append({
            "speaker": speaker,
            "start": round(segment.start, 2),
            "end": round(segment.end, 2)
        })

    # Merge nearby segments from the same speaker
    merged_segments = []
    if not raw_segments:
        return merged_segments, rttm_path

    current_segment = raw_segments[0].copy()

    for next_segment in raw_segments[1:]:
        # If same speaker and gap < 0.5 seconds, merge
        gap = next_segment["start"] - current_segment["end"]
        if (next_segment["speaker"] == current_segment["speaker"] and gap < 0.5):
            # Extend current segment
            current_segment["end"] = next_segment["end"]
            print(f"ðŸ”— Merged segments: {current_segment['speaker']} "
                  f"({current_segment['start']}s-{current_segment['end']}s)")
        else:
            # Save current and start new
            merged_segments.append(current_segment)
            current_segment = next_segment.copy()

    # Don't forget the last segment
    merged_segments.append(current_segment)

    print(f"ðŸ“Š Segments: {len(raw_segments)} raw â†’ {len(merged_segments)} after filtering & merging")

    return merged_segments, rttm_path


# =========================
# Qdrant Functions
# =========================

def get_qdrant_point(numeric_id, label):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/{numeric_id}"
    resp = requests.get(url, timeout=HTTP_TIMEOUT)
    if resp.status_code == 404:
        raise QdrantUpdateError(f"{label} point not found")
    if resp.status_code >= 300:
        raise QdrantUpdateError(f"failed to fetch {label} point: HTTP {resp.status_code}")
    return resp.json().get("result", {})


def upsert_qdrant_point(numeric_id, payload, vector, label):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points?wait=true"
    body = {
        "points": [{
            "id": numeric_id,
            "vector": vector,
            "payload": payload,
        }]
    }
    resp = requests.put(url, json=body, timeout=HTTP_TIMEOUT)
    if resp.status_code >= 300:
        raise QdrantUpdateError(f"failed to upsert {label}: HTTP {resp.status_code} {resp.text}")


def scroll_segments_for_parent(file_id, limit=100):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/scroll"
    points = []
    offset = None
    while True:
        body = {
            "limit": limit,
            "with_payload": True,
            "with_vector": False,
            "filter": {
                "must": [
                    {"key": "type", "match": {"value": "segment"}},
                    {"key": "parent_job_id", "match": {"value": file_id}},
                ]
            },
        }
        if offset is not None:
            body["offset"] = offset
        resp = requests.post(url, json=body, timeout=HTTP_TIMEOUT)
        if resp.status_code >= 300:
            raise QdrantUpdateError(f"failed to scroll existing segments: HTTP {resp.status_code} {resp.text}")
        result = resp.json().get("result", {})
        points.extend(result.get("points", []))
        next_offset = result.get("next_page_offset")
        if next_offset is None:
            break
        if next_offset == offset:
            raise QdrantUpdateError("Qdrant scroll offset did not advance")
        offset = next_offset
    return points


def delete_qdrant_points(point_ids, label):
    if not point_ids:
        return
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/delete?wait=true"
    resp = requests.post(url, json={"points": point_ids}, timeout=HTTP_TIMEOUT)
    if resp.status_code >= 300:
        raise QdrantUpdateError(f"failed to delete stale {label}: HTTP {resp.status_code} {resp.text}")
    print(f"ðŸ§¹ Deleted {len(point_ids)} stale {label}")


def upsert_qdrant_points(points, label):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points?wait=true"
    resp = requests.put(url, json={"points": points}, timeout=HTTP_TIMEOUT)
    if resp.status_code >= 300:
        raise QdrantUpdateError(f"failed to upsert {label}: HTTP {resp.status_code} {resp.text}")


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
    """Replace this parent's segment set using deterministic segment IDs."""
    points, transcription_jobs = build_segment_points_and_jobs(file_id, segments, minio_url)
    new_ids = {point["id"] for point in points}
    existing_segments = scroll_segments_for_parent(file_id)
    stale_ids = [point["id"] for point in existing_segments if point.get("id") not in new_ids]

    delete_qdrant_points(stale_ids, "diarization segments")
    upsert_qdrant_points(points, "diarization segments")

    discovered = scroll_segments_for_parent(file_id)
    discovered_ids = {point.get("id") for point in discovered}
    if len(discovered_ids.intersection(new_ids)) != len(new_ids):
        raise QdrantUpdateError("segment write verification failed")
    if len(discovered) != len(points):
        raise QdrantUpdateError(
            f"segment count verification failed: expected {len(points)}, found {len(discovered)}"
        )

    print(f"âœ… Replaced segment set with {len(points)} Qdrant entries")
    return transcription_jobs


def update_parent_metadata(file_id, segment_count):
    """Update parent job status in Qdrant after segment writes succeed."""
    numeric_id = hash_string_to_uint64(file_id)
    point_data = get_qdrant_point(numeric_id, "parent")
    existing_payload = point_data.get("payload", {})
    existing_vector = point_data.get("vector", [0.0] * 512)
    updated_payload = {**existing_payload}
    updated_payload["status"] = "diarized"
    updated_payload["segment_count"] = segment_count
    updated_payload["diarization_completed_at"] = utc_now()
    updated_payload.pop("diarization_error", None)
    updated_payload.pop("diarization_failed_at", None)
    upsert_qdrant_point(numeric_id, updated_payload, existing_vector, "parent")
    print(f"âœ… Updated parent metadata for file {file_id}")


def push_transcription_jobs(jobs):
    """Push all segment jobs to transcription queue as one Redis transaction."""
    pipe = r.pipeline(transaction=True)
    for job in jobs:
        pipe.lpush("transcription_queue", serialize_job(job))
    pipe.execute()
    print(f"âœ… Pushed {len(jobs)} transcription jobs")


def download_audio_to_temp(minio_url):
    tmp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tmp_path = tmp_file.name
    try:
        with tmp_file:
            resp = requests.get(minio_url, stream=True, timeout=HTTP_TIMEOUT)
            resp.raise_for_status()
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    tmp_file.write(chunk)
        return tmp_path
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception as cleanup_error:
                print(f"âš ï¸ Failed to clean up partial temporary audio file: {cleanup_error}")
        raise


# =========================
# Worker Loop
# =========================

def worker_loop():
    print("ðŸš€ Diarization worker started, waiting for jobs...")
    print(f"ðŸ” Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
    print(f"ðŸ” Connected to Qdrant at {QDRANT_HOST}")
    recover_processing_jobs()
    # Recovery assumes one real diarization worker for the FYP demonstration.

    while True:
        job_data = None
        job = None
        local_path = None
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

            print("ðŸ“¥ Moved diarization job to processing queue")
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
            attempt_number = int(job.get("attempts", 0) or 0) + 1

            print(f"ðŸŽ™ï¸ Processing file {file_id} from {minio_url}")
            print(f"   Attempt: {attempt_number}/{DIARIZATION_MAX_ATTEMPTS}")

            local_path = download_audio_to_temp(minio_url)
            segments, rttm_path = diarize_file(local_path)
            print(f"ðŸ—‚ï¸ Diarization complete: {len(segments)} segments")
            print(f"ðŸ“ RTTM written to {rttm_path}")

            if not segments:
                raise DiarizationJobError("diarization produced zero usable segments")

            transcription_jobs = replace_segment_entries(file_id, segments, minio_url)
            update_parent_metadata(file_id, len(segments))
            push_transcription_jobs(transcription_jobs)

            remove_processing_job(job_data)
            print(f"âœ… Queued {len(transcription_jobs)} segments for transcription")
            log_dagster_event(
                "file_diarized",
                "diarized_files",
                {
                    "file_id": file_id,
                    "segment_count": len(segments),
                    "speakers": list(set(s["speaker"] for s in segments)),
                },
            )

        except Exception as e:
            print(f"âš ï¸ Error in diarization worker: {sanitize_error_message(e)}")
            if job_data is not None:
                if job is None:
                    fail_malformed_job(job_data, e)
                else:
                    handle_job_failure(job_data, job, e)
            time.sleep(5)
        finally:
            if local_path and os.path.exists(local_path):
                try:
                    os.unlink(local_path)
                except Exception as e:
                    print(f"âš ï¸ Failed to clean up temporary audio file: {e}")


if __name__ == "__main__":
    worker_loop()
