"""
Mock transcription worker.
Same Redis/Qdrant contract as gradio/transcription/transcription.py:
- BLPOP on transcription_queue
- Updates segment (status="transcribed", transcript_text=...)
- Checks if all sibling segments for the parent are done
- Updates parent (status="transcribed") when complete
No real Whisper inference — fills in placeholder text so downstream
analysis-module work has real, schema-correct transcript_text to consume.
"""
import os
import time
import json
import redis
from datetime import datetime

from qdrant_helpers import hash_string_to_uint64, upsert_point, scroll_filter, get_point
from worker_heartbeat import start_heartbeat

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
start_heartbeat(r, "transcription")

# Rotates through a few fake lines so segments aren't all identical —
# useful for sanity-checking that NER/keyword/summary features key off
# the right segment rather than always seeing the same text.
FAKE_TRANSCRIPTS = [
    "މިއަދު ހެނދުނު ބައްދަލުވުމެއް ބޭއްވުނެވެ.",
    "އެ ތަނުގައި ތިން މީހުން ތިއްބެވިއެވެ.",
    "ފުލުހުންނަށް ރިޕޯޓު ކުރެވުނީ ހެނދުނު ނުވައެއް ޖަހާއިރުއެވެ.",
    "އޭނާ ބުނީ ހާދިސާ ހިނގީ މާލޭގައި ކަމަށެވެ.",
]


def update_segment_in_qdrant(segment_id, transcription):
    numeric_id = hash_string_to_uint64(segment_id)
    upsert_point(numeric_id, {
        "transcript_text": transcription,
        "status": "transcribed",
        "transcription_completed_at": datetime.now().isoformat(),
    })
    print(f"✅ [mock_transcription] updated segment {segment_id}")


def update_segment_failure_in_qdrant(segment_id, error_message):
    numeric_id = hash_string_to_uint64(segment_id)
    upsert_point(numeric_id, {
        "status": "transcription_failed",
        "transcription_error": str(error_message)[:180],
        "transcription_failed_at": datetime.now().isoformat(),
    })
    print(f"✅ [mock_transcription] marked segment {segment_id} -> transcription_failed")


def update_parent_status(file_id):
    numeric_id = hash_string_to_uint64(file_id)
    upsert_point(numeric_id, {
        "status": "transcribed",
        "transcription_completed_at": datetime.now().isoformat(),
    })
    print(f"✅ [mock_transcription] updated parent {file_id} -> transcribed")


def check_all_segments_transcribed(file_id):
    segments = scroll_filter([
        {"key": "type", "match": {"value": "segment"}},
        {"key": "parent_job_id", "match": {"value": file_id}}
    ])
    if not segments:
        return False
    parent = get_point(hash_string_to_uint64(file_id)) or {}
    segment_count = parent.get("payload", {}).get("segment_count")
    if segment_count is not None and len(segments) != int(segment_count):
        return False
    return all(seg.get("payload", {}).get("status") == "transcribed" for seg in segments)


def worker_loop():
    print("🚀 [mock_transcription] started, waiting for jobs...")
    counter = 0
    while True:
        segment_id = None
        try:
            result = r.blpop("transcription_queue", timeout=10)
            if result is None:
                continue
            _, job_data = result
            job = json.loads(job_data)

            segment_id = job["segment_id"]
            file_id = job["file_id"]
            speaker = job["speaker"]

            fake_text = FAKE_TRANSCRIPTS[counter % len(FAKE_TRANSCRIPTS)]
            counter += 1

            print(f"🎭 [mock_transcription] processing '{segment_id}' (speaker={speaker})")

            update_segment_in_qdrant(segment_id, fake_text)

            if check_all_segments_transcribed(file_id):
                update_parent_status(file_id)
                print(f"✅ [mock_transcription] all segments done for {file_id}")
            else:
                print(f"⏳ [mock_transcription] still waiting on siblings of {file_id}")

        except Exception as e:
            print(f"⚠️ [mock_transcription] error: {e}")
            if segment_id:
                try:
                    update_segment_failure_in_qdrant(segment_id, e)
                except Exception as update_error:
                    print(f"⚠️ [mock_transcription] failed to mark failure: {update_error}")
            import traceback
            traceback.print_exc()
            time.sleep(5)


if __name__ == "__main__":
    worker_loop()
