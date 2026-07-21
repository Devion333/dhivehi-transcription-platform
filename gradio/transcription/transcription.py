# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: transcription.py
# Description: Gradio worker for the transcription service
# First Written on: 03/07/2026
# Edited on: 21/07/2026
import os
import time
import json
import requests
import redis
import torch
from datetime import datetime
from transformers import WhisperProcessor, WhisperForConditionalGeneration
import librosa
import tempfile
import noisereduce as nr
from worker_heartbeat import start_heartbeat

# =========================
# Environment & Setup
# =========================

# Redis connection
REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)

# Qdrant backend API
QDRANT_HOST = os.getenv("QDRANT_HOST", "http://qdrant:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "file_metadata")

# Redis queue names
TRANSCRIPTION_QUEUE = "transcription_queue"
TRANSCRIPTION_PROCESSING_QUEUE = "transcription_processing_queue"
TRANSCRIPTION_FAILED_QUEUE = "transcription_failed_queue"
TRANSCRIPTION_MAX_ATTEMPTS = max(1, int(os.getenv("TRANSCRIPTION_MAX_ATTEMPTS", "3")))

# HTTP timeouts
HTTP_CONNECT_TIMEOUT_SECONDS = float(os.getenv("HTTP_CONNECT_TIMEOUT_SECONDS", "10"))
HTTP_READ_TIMEOUT_SECONDS = float(os.getenv("HTTP_READ_TIMEOUT_SECONDS", "120"))
HTTP_TIMEOUT = (HTTP_CONNECT_TIMEOUT_SECONDS, HTTP_READ_TIMEOUT_SECONDS)

# MinIO credentials for downloading segments
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minio123")

#Dagster integration
DAGSTER_ENABLED = os.getenv("DAGSTER_ENABLED", "false").lower() == "true"
DAGSTER_API_URL = os.getenv("DAGSTER_API_URL", "http://dagster:3000")

def log_dagster_event(event_type, asset_key, metadata):
    """Send event to Dagster for tracking"""
    if not DAGSTER_ENABLED:
        return
    
    try:
        import requests
        payload = {
            "event_type": event_type,
            "asset_key": asset_key,
            "metadata": metadata,
            "timestamp": datetime.now().isoformat()
        }
        requests.post(f"{DAGSTER_API_URL}/events", json=payload, timeout=HTTP_TIMEOUT)
    except Exception as e:
        print(f"âš ï¸ Failed to log Dagster event: {e}")


# =========================
# Load Whisper Model
# =========================

print("ðŸ”Š Loading Whisper model...")
# Load from local checkpoint
#model_path = "/app/models/checkpoint-3000"
model_path = "Devion333/whisper-small-dv-syn"

try:
    # Try loading with auto classes first (more flexible)
    from transformers import AutoProcessor, AutoModelForSpeechSeq2Seq
    processor = AutoProcessor.from_pretrained(model_path, use_fast=False)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(model_path)
except Exception as e:
    print(f"âš ï¸ Auto loading failed: {e}")
    print("Trying WhisperProcessor...")
    # Fallback to WhisperProcessor
    processor = WhisperProcessor.from_pretrained(model_path, use_fast=False)
    model = WhisperForConditionalGeneration.from_pretrained(model_path)

model.eval()

# Use GPU if available
device = "cuda" if torch.cuda.is_available() else "cpu"
model = model.to(device)
print(f"âœ… Whisper model loaded from {model_path} on {device}")
start_heartbeat(r, "transcription", device=device, modelName=model_path)

# =========================
# Helper Functions
# =========================

class TranscriptionJobError(Exception):
    """Controlled exception for retryable or final job failures."""


class QdrantUpdateError(Exception):
    """Raised when a required Qdrant update fails."""


class QdrantCompletionCheckError(Exception):
    """Raised when parent completion cannot be checked safely."""


REQUIRED_JOB_FIELDS = [
    "segment_id",
    "file_id",
    "start_time",
    "end_time",
    "speaker",
    "minio_url",
]

MAX_RAW_JOB_CHARS = 1000


def utc_now():
    return datetime.now().isoformat()


def sanitize_error_message(error):
    message = str(error).strip() or error.__class__.__name__
    message = " ".join(message.split())
    if len(message) > 180:
        message = message[:177] + "..."
    return message


def decode_job(job_data):
    if isinstance(job_data, bytes):
        job_data = job_data.decode("utf-8")
    try:
        job = json.loads(job_data)
    except json.JSONDecodeError as e:
        raise TranscriptionJobError(f"malformed JSON job: {e.msg}")
    if not isinstance(job, dict):
        raise TranscriptionJobError("job payload must be a JSON object")
    return job


def validate_job(job):
    for field in REQUIRED_JOB_FIELDS:
        if field not in job:
            raise TranscriptionJobError(f"missing required field: {field}")

    segment_id = str(job["segment_id"]).strip()
    file_id = str(job["file_id"]).strip()
    minio_url = str(job["minio_url"]).strip()

    if not segment_id:
        raise TranscriptionJobError("empty segment_id")
    if not file_id:
        raise TranscriptionJobError("empty file_id")
    if not minio_url:
        raise TranscriptionJobError("empty minio_url")

    try:
        start_time = float(job["start_time"])
        end_time = float(job["end_time"])
    except (TypeError, ValueError):
        raise TranscriptionJobError("start_time and end_time must be numeric")

    if start_time < 0:
        raise TranscriptionJobError("start_time must be non-negative")
    if end_time <= start_time:
        raise TranscriptionJobError("end_time must be greater than start_time")

    job["segment_id"] = segment_id
    job["file_id"] = file_id
    job["minio_url"] = minio_url
    job["start_time"] = start_time
    job["end_time"] = end_time
    job["speaker"] = str(job["speaker"])
    job["attempts"] = int(job.get("attempts", 0) or 0)
    job["segment_saved"] = job.get("segment_saved") is True
    return job


def serialize_job(job):
    return json.dumps(job, separators=(",", ":"))


def remove_processing_job(job_data):
    removed = r.lrem(TRANSCRIPTION_PROCESSING_QUEUE, 1, job_data)
    if removed == 0:
        print("âš ï¸ Processing queue item was not found during removal")
    return removed


def requeue_job(job_data, job, error_message):
    job["attempts"] = int(job.get("attempts", 0) or 0) + 1
    updated_job = serialize_job(job)
    remove_processing_job(job_data)
    r.lpush(TRANSCRIPTION_QUEUE, updated_job)
    print(
        f"ðŸ” Retrying segment {job.get('segment_id', 'unknown')} "
        f"(attempt {job['attempts']}/{TRANSCRIPTION_MAX_ATTEMPTS}): {error_message}"
    )


def fail_job(job_data, job, error_message):
    failure_payload = dict(job) if isinstance(job, dict) else {}
    failure_payload["attempts"] = max(int(failure_payload.get("attempts", 0) or 0), TRANSCRIPTION_MAX_ATTEMPTS)
    failure_payload["error"] = error_message
    failure_payload["failed_at"] = utc_now()

    remove_processing_job(job_data)
    r.lpush(TRANSCRIPTION_FAILED_QUEUE, serialize_job(failure_payload))

    segment_id = str(failure_payload.get("segment_id", "")).strip()
    if segment_id and not failure_payload.get("segment_saved"):
        try:
            update_segment_failure_in_qdrant(segment_id, error_message)
        except QdrantUpdateError as e:
            print(f"âš ï¸ Failed to write final failure status for {segment_id}: {sanitize_error_message(e)}")

    print(f"ðŸ›‘ Final transcription failure for segment {segment_id or 'unknown'}: {error_message}")


def handle_job_failure(job_data, job, error):
    error_message = sanitize_error_message(error)
    attempts = int(job.get("attempts", 0) or 0) if isinstance(job, dict) else 0
    if attempts + 1 >= TRANSCRIPTION_MAX_ATTEMPTS:
        fail_job(job_data, job, error_message)
    else:
        requeue_job(job_data, job, error_message)


def fail_malformed_job(job_data, error):
    error_message = sanitize_error_message(error)
    raw_job = job_data.decode("utf-8", errors="replace") if isinstance(job_data, bytes) else str(job_data)
    raw_job_truncated = len(raw_job) > MAX_RAW_JOB_CHARS
    if raw_job_truncated:
        raw_job = raw_job[:MAX_RAW_JOB_CHARS]

    failure_payload = {
        "raw_job": raw_job,
        "attempts": TRANSCRIPTION_MAX_ATTEMPTS,
        "error": error_message,
        "failed_at": utc_now(),
    }
    if raw_job_truncated:
        failure_payload["raw_job_truncated"] = True
    remove_processing_job(job_data)
    r.lpush(TRANSCRIPTION_FAILED_QUEUE, serialize_job(failure_payload))
    print(f"ðŸ›‘ Final transcription failure for malformed job: {error_message}")


def recover_processing_jobs():
    recovered = 0
    while True:
        job_data = r.rpop(TRANSCRIPTION_PROCESSING_QUEUE)
        if job_data is None:
            break
        r.lpush(TRANSCRIPTION_QUEUE, job_data)
        recovered += 1
    print(f"ðŸ” Recovered {recovered} transcription processing jobs")
    return recovered

def hash_string_to_uint64(s):
    """Convert string to uint64 for Qdrant ID"""
    hash_val = 5381
    for c in s:
        hash_val = ((hash_val << 5) + hash_val) + ord(c)
    return hash_val & 0xFFFFFFFFFFFFFFFF


def get_qdrant_point(numeric_id, label):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/{numeric_id}"
    resp = requests.get(url, timeout=HTTP_TIMEOUT)
    print(f"ðŸ” {label} point exists check: {resp.status_code}")
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
    print(f"ðŸ” {label} update response status: {resp.status_code}")
    if resp.status_code >= 300:
        raise QdrantUpdateError(f"failed to update {label}: HTTP {resp.status_code}")


def get_parent_payload(file_id):
    numeric_id = hash_string_to_uint64(file_id)
    try:
        point = get_qdrant_point(numeric_id, "parent")
    except QdrantUpdateError as e:
        raise QdrantCompletionCheckError(
            f"could not fetch parent metadata for completion check: {sanitize_error_message(e)}"
        )
    return point.get("payload", {}) or {}

def download_audio_segment(minio_url, start_time, end_time):
    """Download audio from MinIO and extract segment"""
    tmp_path = None
    try:
        # Download full audio file
        resp = requests.get(minio_url, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_file:
            tmp_file.write(resp.content)
            tmp_path = tmp_file.name
        
        # Load audio and extract segment
        audio, sr = librosa.load(tmp_path, sr=16000)
        audio = nr.reduce_noise(y=audio, sr=sr)
        # Extract segment based on timestamps
        start_sample = int(start_time * sr)
        end_sample = int(end_time * sr)
        segment_audio = audio[start_sample:end_sample]
        
        return segment_audio, sr
        
    except Exception as e:
        print(f"âš ï¸ Error downloading audio segment: {e}")
        return None, None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception as e:
                print(f"âš ï¸ Failed to clean up temporary audio file: {e}")

def transcribe_audio(audio, sr=16000):
    """Transcribe audio using Whisper model"""
    try:
        print(f"ðŸ” Transcribing audio segment (length: {len(audio)/sr:.2f}s)")
        
        # Convert to input features
        input_features = processor(audio, sampling_rate=sr, return_tensors="pt").input_features
        input_features = input_features.to(device)
        
        # Force Dhivehi decoding - only get the IDs, don't pass task
        forced_decoder_ids = processor.get_decoder_prompt_ids(language="si")
        
        print(f"ðŸ” Generating transcription...")
        # Generate transcription
        with torch.no_grad():
            predicted_ids = model.generate(
                input_features,
                forced_decoder_ids=forced_decoder_ids,
                do_sample=False,
                temperature=0.0,
                num_beams=1,
                max_new_tokens=444,
            )
        
        transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
        return transcription
        
    except Exception as e:
        print(f"âš ï¸ Error transcribing audio: {e}")
        import traceback
        traceback.print_exc()
        return None

def update_segment_in_qdrant(segment_id, transcription):
    """Update segment with transcription in Qdrant"""
    numeric_id = hash_string_to_uint64(segment_id)
    
    print(f"ðŸ” Updating segment {segment_id} (numeric_id: {numeric_id})")
    
    try:
        # Get existing point data
        point_data = get_qdrant_point(numeric_id, "segment")
        existing_payload = point_data.get("payload", {})
        existing_vector = point_data.get("vector", [0.0] * 512)
        
        print(f"ðŸ” Existing payload keys: {list(existing_payload.keys())}")
        
        # Merge with new transcription data
        updated_payload = {**existing_payload}
        updated_payload["transcript_text"] = transcription
        updated_payload["status"] = "transcribed"
        updated_payload["transcription_completed_at"] = utc_now()
        updated_payload.pop("transcription_error", None)
        updated_payload.pop("transcription_failed_at", None)

        upsert_qdrant_point(numeric_id, updated_payload, existing_vector, "segment")
        print(f"âœ… Updated segment {segment_id} in Qdrant")
        return True
             
    except Exception as e:
        message = sanitize_error_message(e)
        print(f"âš ï¸ Failed Qdrant segment write for {segment_id}: {message}")
        raise QdrantUpdateError(message)


def update_segment_failure_in_qdrant(segment_id, error_message):
    """Mark a segment as failed while preserving existing point data."""
    numeric_id = hash_string_to_uint64(segment_id)
    try:
        point_data = get_qdrant_point(numeric_id, "segment")
        existing_payload = point_data.get("payload", {})
        existing_vector = point_data.get("vector", [0.0] * 512)
        updated_payload = {**existing_payload}
        updated_payload["status"] = "transcription_failed"
        updated_payload["transcription_error"] = sanitize_error_message(error_message)
        updated_payload["transcription_failed_at"] = utc_now()
        upsert_qdrant_point(numeric_id, updated_payload, existing_vector, "segment failure")
        print(f"âœ… Marked segment {segment_id} as transcription_failed")
        return True
    except Exception as e:
        message = sanitize_error_message(e)
        raise QdrantUpdateError(message)

def update_parent_status(file_id):
    """Update parent job status after all segments are transcribed"""
    numeric_id = hash_string_to_uint64(file_id)
    
    print(f"ðŸ” Updating parent status for {file_id} (numeric_id: {numeric_id})")
    
    try:
        # Get existing point data
        point_data = get_qdrant_point(numeric_id, "parent")
        existing_payload = point_data.get("payload", {})
        existing_vector = point_data.get("vector", [0.0] * 512)
        
        # Merge with new status
        updated_payload = {**existing_payload}
        updated_payload["status"] = "transcribed"
        updated_payload["transcription_completed_at"] = utc_now()

        upsert_qdrant_point(numeric_id, updated_payload, existing_vector, "parent")
        print(f"âœ… Updated parent {file_id} status to transcribed")
        return True
             
    except Exception as e:
        message = sanitize_error_message(e)
        print(f"âš ï¸ Failed Qdrant parent write for {file_id}: {message}")
        raise QdrantUpdateError(message)

def check_all_segments_transcribed(file_id):
    """Check if all segments for a parent job are transcribed"""
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/scroll"
    all_segments = []
    offset = None

    while True:
        payload = {
            "limit": 100,
            "with_payload": True,
            "with_vector": False,
            "filter": {
                "must": [
                    {"key": "type", "match": {"value": "segment"}},
                    {"key": "parent_job_id", "match": {"value": file_id}},
                ]
            }
        }
        if offset is not None:
            payload["offset"] = offset

        try:
            resp = requests.post(url, json=payload, timeout=HTTP_TIMEOUT)
        except Exception as e:
            raise QdrantCompletionCheckError(f"segment scroll failed: {sanitize_error_message(e)}")

        if resp.status_code >= 300:
            raise QdrantCompletionCheckError(f"segment scroll failed: HTTP {resp.status_code}")

        data = resp.json()
        result = data.get("result", {})
        points = result.get("points", [])
        all_segments.extend(points)
        next_offset = result.get("next_page_offset")

        if next_offset is None:
            break
        if next_offset == offset:
            raise QdrantCompletionCheckError("Qdrant scroll offset did not advance")
        offset = next_offset

    if not all_segments:
        print(f"â³ No segments found for parent {file_id}; parent is not complete")
        return False

    parent_payload = get_parent_payload(file_id)
    expected_count = parent_payload.get("segment_count")
    if expected_count is not None:
        try:
            expected_count = int(expected_count)
        except (TypeError, ValueError):
            raise QdrantCompletionCheckError("parent segment_count is not numeric")
        if len(all_segments) != expected_count:
            print(
                f"â³ Parent {file_id} has {len(all_segments)} discovered segments, "
                f"expected {expected_count}; parent is not complete"
            )
            return False

    return all(
        seg.get("payload", {}).get("status") == "transcribed"
        for seg in all_segments
    )

# =========================
# Worker Loop
# =========================

def worker_loop():
    print("ðŸš€ Transcription worker started, waiting for jobs...")
    print(f"ðŸ” Connected to Redis at {REDIS_HOST}:{REDIS_PORT}")
    print(f"ðŸ” Connected to Qdrant at {QDRANT_HOST}")
    recover_processing_jobs()
    
    while True:
        job_data = None
        job = None
        try:
            job_data = r.execute_command(
                "BLMOVE",
                TRANSCRIPTION_QUEUE,
                TRANSCRIPTION_PROCESSING_QUEUE,
                "LEFT",
                "RIGHT",
                10,
            )

            if job_data is None:
                continue

            print("ðŸ“¥ Moved transcription job to processing queue")

            try:
                job = validate_job(decode_job(job_data))
            except TranscriptionJobError as e:
                try:
                    decoded = decode_job(job_data)
                    if isinstance(decoded, dict):
                        job = decoded
                        handle_job_failure(job_data, job, e)
                    else:
                        fail_malformed_job(job_data, e)
                except TranscriptionJobError:
                    fail_malformed_job(job_data, e)
                continue

            segment_id = job["segment_id"]
            file_id = job["file_id"]
            start_time = job["start_time"]
            end_time = job["end_time"]
            speaker = job["speaker"]
            minio_url = job["minio_url"]
            attempt_number = int(job.get("attempts", 0) or 0) + 1

            print(f"\n{'='*60}")
            print(f"ðŸŽ™ï¸ Processing segment {segment_id}")
            print(f"   Attempt: {attempt_number}/{TRANSCRIPTION_MAX_ATTEMPTS}")
            print(f"   Speaker: {speaker}")
            print(f"   Time: {start_time}s - {end_time}s")
            print(f"   URL: {minio_url}")
            print(f"{'='*60}\n")

            if job.get("segment_saved"):
                print(f"âœ… Segment {segment_id} already saved; retrying parent completion only")
            else:
                # Download and transcribe
                print("ðŸ“¥ Downloading audio segment...")
                audio, sr = download_audio_segment(minio_url, start_time, end_time)
                if audio is None:
                    raise TranscriptionJobError("failed to download or prepare audio segment")

                print(f"âœ… Audio downloaded ({len(audio)/sr:.2f}s)")
                transcription = transcribe_audio(audio, sr)
                if transcription is None:
                    raise TranscriptionJobError("model transcription failed")

                print(f"ðŸ“ Transcription complete for segment {segment_id}")
                log_dagster_event(
                    "segment_transcribed",
                    "transcribed_segments",
                    {
                        "segment_id": segment_id,
                        "file_id": file_id,
                        "speaker": speaker,
                        "duration": end_time - start_time,
                        "transcription_length": len(transcription)
                    }
                )

                # Update Qdrant
                print("ðŸ’¾ Updating Qdrant...")
                update_segment_in_qdrant(segment_id, transcription)
                job["segment_saved"] = True

            # Check if all segments are done
            print(f"ðŸ” Checking if all segments complete for parent {file_id}...")
            if check_all_segments_transcribed(file_id):
                update_parent_status(file_id)
                print(f"âœ… All segments transcribed for parent job {file_id}")
                log_dagster_event(
                    "file_fully_transcribed",
                    "completed_files",
                    {
                        "file_id": file_id,
                        "total_segments": "auto"
                    }
                )
            else:
                print(f"â³ Still waiting for other segments of parent {file_id}")

            remove_processing_job(job_data)
            print(f"âœ… Completed transcription job for segment {segment_id}")

        except Exception as e:
            message = sanitize_error_message(e)
            print(f"âš ï¸ Error in transcription worker: {message}")
            if job_data is not None:
                if job is None:
                    fail_malformed_job(job_data, e)
                else:
                    handle_job_failure(job_data, job, e)
            time.sleep(5)

if __name__ == "__main__":
    worker_loop()
