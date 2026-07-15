"""
Mock conversion worker.
Same Redis contract as gradio/convert/convert.py: BLPOP on conversion_queue,
push to diarization_queue. No real ffmpeg work — for dev purposes every
uploaded file is treated as already-audio so we don't need real video/audio
test fixtures.
"""
import os
import time
import json
import redis
from worker_heartbeat import start_heartbeat

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0)
start_heartbeat(r, "conversion")


def process_file(file_id, minio_url, filename):
    print(f"🎭 [mock_convert] '{filename}' (file_id={file_id}) — skipping real "
          f"conversion, forwarding as-is")
    job = {"file_id": file_id, "minio_url": minio_url}
    r.lpush("diarization_queue", json.dumps(job))
    print(f"✅ [mock_convert] pushed to diarization_queue")


def worker_loop():
    print("🚀 [mock_convert] started, waiting for jobs...")
    while True:
        try:
            result = r.blpop("conversion_queue", timeout=10)
            if result is None:
                continue
            _, job_data = result
            job = json.loads(job_data)
            process_file(job["file_id"], job["minio_url"], job.get("filename", "unknown"))
        except Exception as e:
            print(f"⚠️ [mock_convert] error: {e}")
            time.sleep(5)


if __name__ == "__main__":
    worker_loop()
