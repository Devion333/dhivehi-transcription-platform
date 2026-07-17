# Worker Heartbeat Implementation

Status: implemented for Redis-backed worker availability reporting and admin retry safety.

## Contract

Workers publish ephemeral Redis keys with this shape:

```text
worker_heartbeat:<workerType>:<instanceId>
```

The JSON payload contains `workerType`, `instanceId`, `status`, `startedAt`, `lastHeartbeatAt`, and optional safe fields such as `device` or `modelName`. Keys use a TTL and are also registered in `worker_heartbeat_keys:<workerType>` so the backend can discover instances without `KEYS *`.

Default timing:

| Variable | Default |
| --- | --- |
| `WORKER_HEARTBEAT_INTERVAL_SECONDS` | `15` |
| `WORKER_HEARTBEAT_TTL_SECONDS` | `60` |

If TTL is configured less than or equal to the interval, publishers and backend normalize it upward.

## Coverage

Heartbeat publishing is wired into:

| Worker type | Dev service | Prod service |
| --- | --- | --- |
| `conversion` | `mock_convert` | `gradio_convert` |
| `diarization` | `mock_diarization` | `gradio_diarization` |
| `transcription` | `mock_transcription` | `gradio_transcription` |
| `analysis` | `analysis` | not present in current prod Compose |

Heartbeat write failures are logged and do not stop worker loops or the analysis HTTP service.

## Backend Behavior

`GET /api/admin/jobs/health` returns structured worker summaries:

```json
{
  "status": "available",
  "instances": 1,
  "lastHeartbeatAt": "2026-07-16T12:00:00Z"
}
```

Availability rules:

| Condition | Public status |
| --- | --- |
| At least one fresh `available` heartbeat | `available` |
| Expected worker has no fresh heartbeat | `unavailable` |
| Redis read failure or worker not expected | `unknown` |

Expected workers are configured through `EXPECTED_WORKERS`, defaulting to `conversion,diarization,transcription,analysis`.

## Retry Safety

Admin retry rejects only definite worker unavailability and returns `WORKER_UNAVAILABLE`. `unknown` preserves prior behavior so transient Redis health reads do not block retries. Retry failure audit metadata records `failureCode: WORKER_UNAVAILABLE` for this case.

No heartbeat audit events are emitted.
