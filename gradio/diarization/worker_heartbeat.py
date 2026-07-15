import atexit
import json
import os
import socket
import threading
import uuid
from datetime import datetime, timezone

DEFAULT_INTERVAL_SECONDS = 15
DEFAULT_TTL_SECONDS = 60


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def safe_int_env(name, default):
    try:
        value = int(os.getenv(name, ""))
        return value if value > 0 else default
    except ValueError:
        return default


def instance_id():
    value = os.getenv("WORKER_INSTANCE_ID", "").strip() or socket.gethostname().strip() or str(uuid.uuid4())[:12]
    return value[:64]


class HeartbeatPublisher:
    def __init__(self, redis_client, worker_type, **safe_fields):
        self.redis_client = redis_client
        self.worker_type = worker_type
        self.instance_id = instance_id()
        self.started_at = utc_now()
        self.interval = safe_int_env("WORKER_HEARTBEAT_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS)
        self.ttl = safe_int_env("WORKER_HEARTBEAT_TTL_SECONDS", DEFAULT_TTL_SECONDS)
        if self.ttl <= self.interval:
            self.ttl = self.interval * 4
        self.safe_fields = {key: value for key, value in safe_fields.items() if value}
        self.key = f"worker_heartbeat:{self.worker_type}:{self.instance_id}"
        self.set_key = f"worker_heartbeat_keys:{self.worker_type}"
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._loop, daemon=True)

    def payload(self):
        data = {"workerType": self.worker_type, "instanceId": self.instance_id, "status": "available", "startedAt": self.started_at, "lastHeartbeatAt": utc_now()}
        data.update(self.safe_fields)
        return data

    def write_safely(self):
        try:
            self.redis_client.setex(self.key, self.ttl, json.dumps(self.payload(), separators=(",", ":")))
            self.redis_client.sadd(self.set_key, self.key)
        except Exception as exc:
            print(f"⚠️ heartbeat write failed for {self.worker_type}: {exc}")

    def start(self):
        self.write_safely()
        self.thread.start()
        atexit.register(self.stop)
        return self

    def _loop(self):
        while not self.stop_event.wait(self.interval):
            self.write_safely()

    def stop(self):
        self.stop_event.set()
        try:
            self.redis_client.delete(self.key)
        except Exception:
            pass


def start_heartbeat(redis_client, worker_type, **safe_fields):
    return HeartbeatPublisher(redis_client, worker_type, **safe_fields).start()
