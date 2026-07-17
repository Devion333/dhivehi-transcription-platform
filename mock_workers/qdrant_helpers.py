"""
Shared helpers for mock workers.
Mirrors the exact Qdrant ID hashing scheme used in the real
gradio/diarization/diarization.py and gradio/transcription/transcription.py
workers, so mock-produced data is indistinguishable in shape from real data.
"""
import os
import requests

QDRANT_HOST = os.getenv("QDRANT_HOST", "http://qdrant:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "file_metadata")
HTTP_CONNECT_TIMEOUT_SECONDS = float(os.getenv("HTTP_CONNECT_TIMEOUT_SECONDS", "10"))
HTTP_READ_TIMEOUT_SECONDS = float(os.getenv("HTTP_READ_TIMEOUT_SECONDS", "120"))
HTTP_TIMEOUT = (HTTP_CONNECT_TIMEOUT_SECONDS, HTTP_READ_TIMEOUT_SECONDS)


def hash_string_to_uint64(s: str) -> int:
    """Identical djb2-style hash to the real workers — must match exactly
    so mock-created points have the same IDs the backend/frontend expect."""
    hash_val = 5381
    for c in s:
        hash_val = ((hash_val << 5) + hash_val) + ord(c)
    return hash_val & 0xFFFFFFFFFFFFFFFF


def get_point(numeric_id: int):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/{numeric_id}"
    resp = requests.get(url, timeout=HTTP_TIMEOUT)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("result", {})


def upsert_point(numeric_id: int, payload: dict, vector=None):
    """Upsert a single point, merging with any existing payload (mirrors
    the merge-then-PUT pattern used in the real transcription worker)."""
    existing = get_point(numeric_id)
    existing_payload = existing.get("payload", {}) if existing else {}
    existing_vector = existing.get("vector") if existing else None

    merged_payload = {**existing_payload, **payload}
    final_vector = vector if vector is not None else (existing_vector or [0.0] * 512)

    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points?wait=true"
    body = {
        "points": [{
            "id": numeric_id,
            "vector": final_vector,
            "payload": merged_payload,
        }]
    }
    resp = requests.put(url, json=body, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def upsert_points(points: list):
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points?wait=true"
    resp = requests.put(url, json={"points": points}, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def delete_points(point_ids: list):
    if not point_ids:
        return None
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/delete?wait=true"
    resp = requests.post(url, json={"points": point_ids}, timeout=HTTP_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def scroll_filter(must_conditions: list, limit: int = 100):
    points = []
    offset = None
    url = f"{QDRANT_HOST}/collections/{QDRANT_COLLECTION}/points/scroll"
    while True:
        body = {
            "limit": limit,
            "with_payload": True,
            "with_vector": False,
            "filter": {"must": must_conditions},
        }
        if offset is not None:
            body["offset"] = offset
        resp = requests.post(url, json=body, timeout=HTTP_TIMEOUT)
        resp.raise_for_status()
        result = resp.json().get("result", {})
        points.extend(result.get("points", []))
        next_offset = result.get("next_page_offset")
        if next_offset is None:
            break
        if next_offset == offset:
            raise RuntimeError("Qdrant scroll offset did not advance")
        offset = next_offset
    return points
