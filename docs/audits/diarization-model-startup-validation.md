# Diarization Model Startup Validation

Date: 2026-07-15

## Scope

Validate the current pyannote/auth/cache/startup behavior for the real diarization worker without running real diarization jobs and without changing queue/Qdrant logic.

## Preflight State

- `transcript_gradio_diarization` was not running.
- `transcript_gradio_transcription` was running on image `sha256:23b960ad72faef36573abf377796afb3ad257e7e8a741496da452ccfc344e414` with restart count `0`.
- Diarization image present:
  - repository: `transcript-app-gradio_diarization:latest`
  - digest/ID: `sha256:a82f7444335dd352cd1684ec4db51ed8e3a038d8f4d02f136cfe8060e992af56`
  - created: `2026-07-02T12:01:55.83964932Z`
  - size: `3412187271`
- Protected volumes present:
  - `transcript-app_minio_data`
  - `transcript-app_qdrant_data`
  - `transcript-app_dagster_home`
  - `transcript-app_hf_cache`
- Redis/Qdrant/MinIO were healthy:
  - Redis: `PONG`
  - Qdrant: `healthz check passed`
  - MinIO live health: `200`
- Queue lengths were all `0`:
  - `diarization_queue`
  - `diarization_processing_queue`
  - `diarization_failed_queue`
  - `transcription_queue`
  - `transcription_processing_queue`

## Configuration Observed

- `gradio/diarization/requirements.txt` pins `pyannote.audio==3.1.1` and `huggingface_hub==0.20.3`.
- `compose.yml` mounts `./models/pyannote` at `/root/.cache/huggingface/hub` for `gradio_diarization`.
- `compose.yml` passes `HUGGINGFACE_ACCESS_TOKEN` from the host environment.
- `.env` contains a non-empty `HUGGINGFACE_ACCESS_TOKEN` entry. The token value was not printed.
- Diarization image metadata:
  - entrypoint: `null`
  - cmd: `["python3", "diarization.py"]`
  - working dir: `/app`

## Cache Observed

Host cache root: `models/pyannote/`

Top-level entries include:

- `models--pyannote--speaker-diarization-3.1`
- `models--pyannote--segmentation-3.0`
- `models--pyannote--speaker-diarization-community-1`
- `.locks`
- repo-like files such as `config.yaml`, `handler.py`, `README.md`, `requirements.txt`

Snapshot refs:

- `pyannote/speaker-diarization-3.1`: `84fd25912480287da0247647c3d2b4853cb3ee5d`
- `pyannote/segmentation-3.0`: `e66f3d3b9eb0873085418a7b813d3b369bf160bb`

Cache size reported: `17125144` bytes.

Notable cache concern:

- The `speaker-diarization-3.1` cache appears very small. Largest observed file under that repo was `488` bytes.
- The `segmentation-3.0` model blob exists at about `5.9 MB`, but the snapshot `pytorch_model.bin` entry reported as `76` bytes, likely a symlink/pointer on the host filesystem.
- This cache layout is not sufficient proof that `Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=...)` can load fully offline.

## Container Probe Result

Safe `docker run` probes were attempted with networking disabled and no Redis/Qdrant/MinIO interaction.

Attempted probes:

- `sh -c "echo shell_ok"`
- Python `print('python_ok')`
- Python package import/version probe
- pyannote `Pipeline.from_pretrained` signature probe

Result:

- Even the minimal `sh -c "echo shell_ok"` and Python `print` probes timed out without output.
- No leftover diarization containers were present afterward.
- Queues remained empty after the timeouts.
- Transcription worker remained running on the expected image with restart count `0`.
- A separate `docker system df` command also timed out, while simple metadata commands like `docker image inspect` succeeded.

Conclusion:

- The model-load gate was not validated.
- The blocker appears to be Docker runtime/storage responsiveness for starting transient containers, not an observed pyannote import or model-auth failure.
- Do not start/recreate `transcript_gradio_diarization` until simple transient container startup works again.

## Current Status

Validated:

- No jobs were running or queued.
- Infra health was good before probes.
- Transcription worker was unchanged and stable.
- Diarization image metadata was readable and matched the existing image.
- Token presence was confirmed without exposing the token.
- Cache paths and refs were inspected read-only.

Not validated:

- Container shell startup for the diarization image.
- Python imports inside the diarization image.
- `pyannote.audio` API signature inside the image.
- Offline/read-only `Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=...)` model load.
- Real diarization worker startup.

## Recommended Next Gate

After Docker transient container startup responsiveness is restored, run only these gates, in order:

1. `docker run --rm --network none --entrypoint sh transcript-app-gradio_diarization:latest -c "echo shell_ok"`
2. `docker run --rm --network none --entrypoint python transcript-app-gradio_diarization:latest -u -c "print('python_ok', flush=True)"`
3. Import/version probe for `torch`, `torchaudio`, `pyannote.audio`, and `huggingface_hub`.
4. Inspect `Pipeline.from_pretrained` signature and confirm `use_auth_token` is accepted.
5. Run offline cache-only model-load with networking disabled and `models/pyannote` mounted read-only.

Only after those pass should `transcript_gradio_diarization` be started with `--no-deps --no-build` while queues remain empty.
