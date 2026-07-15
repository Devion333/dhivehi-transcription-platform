# Transcription Minimal Production Migration

Date: 2026-07-15. Scope: promote the validated transcription dependency set, prepare a persistent Hugging Face cache volume, build and validate the new production image, restore only required infrastructure dependencies, and replace only the live transcription worker after queue/service readiness was verified.

## Files Changed

| File | Change |
| --- | --- |
| `gradio/transcription/requirements.txt` | Replaced active dependencies with the validated minimal dependency set. Removed only `datasets` and `pyannote.audio==3.1.1`; kept `torchaudio`, `accelerate`, `sentencepiece`, `protobuf`, and all version pins. |
| `compose.yml` | Added transcription-only offline Hugging Face env vars and changed the transcription HF cache mount to an explicitly named Docker volume `transcript-app_hf_cache`. Existing `/app/models` bind mount was preserved. |
| `docs/audits/transcription-minimal-production-migration.md` | This migration report. |

No model code, inference parameters, `language="si"`, preprocessing, noise reduction, queue names, retry behavior, Qdrant logic, Redis service, Qdrant service, MinIO service, Dagster service, conversion service, diarization service, analysis service, or frontend service was intentionally changed.

## Rollback State

Current running transcription container before changes:

| Field | Value |
| --- | --- |
| Container | `transcript_gradio_transcription` |
| Container ID | `2779752652fef94170dc9cddb1fee7377249021e44828d885eef273cb31bb89e` |
| Status | `running` |
| Container image ID | `sha256:a16cce6e8e5cb5fd8a790f21c005e689f2d9b0e50633aa16f3d885e992b1d313` |
| Config image | `transcript-app-gradio_transcription` |
| Network mode | `transcript-app_app_network` |
| Restart policy | `on-failure:5` |
| Writable layer | `1,940,594,688` bytes |
| Virtual/rootfs size | `8,675,041,280` bytes |
| Mounts | `/data/911/911_whisper_model:/app/models:rw` only |

Environment variables were recorded with `HUGGINGFACE_ACCESS_TOKEN` redacted. Key runtime values included:

```text
REDIS_HOST=redis
REDIS_PORT=6379
MINIO_ACCESS_KEY=minio
MINIO_SECRET_KEY=minio123
QDRANT_HOST=http://qdrant:6333
QDRANT_COLLECTION=file_metadata
DAGSTER_ENABLED=true
DAGSTER_API_URL=http://dagster:3000
HUGGINGFACE_ACCESS_TOKEN=<redacted>
```

Old tagged production image before rebuild:

| Field | Value |
| --- | --- |
| Image | `transcript-app-gradio_transcription:latest` |
| Image ID / digest | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` |
| Created | `2026-07-02T11:02:23.795332738Z` |
| Inspect size | `3,461,760,642` bytes |
| Docker CLI size | `10.2GB` |

Current container cache before migration:

| Field | Value |
| --- | --- |
| Cache path | `/root/.cache/huggingface` |
| Size | `1.9G` |
| `refs/main` | `a3808e270194b7068711332c23b35cbe5e96fad4` |
| `refs/refs/pr/1` | `2f5ef2abc8e364e011568d44bc20dda56af2e086` |
| Large blobs | `967,103,455` bytes and `966,995,080` bytes |

Rollback tag created before changing the active image tag:

```powershell
docker tag transcript-app-gradio_transcription:latest transcript-app-gradio_transcription:rollback-pre-minimal
```

Rollback tag verification:

| Image | Digest | Size |
| --- | --- | ---: |
| `transcript-app-gradio_transcription:rollback-pre-minimal` | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` | `10.2GB` |

The running container was not removed or retagged.

## Requirements Promotion

`gradio/transcription/requirements.txt` now matches the validated minimal dependency set:

```text
transformers==4.52.4
torch==2.6.0
torchaudio==2.6.0
librosa==0.10.1
soundfile==0.12.1
redis==5.0.1
requests==2.31.0
numpy==1.26.4

# Pending runtime validation: kept for now because tokenizer/model loading may rely on them indirectly.
accelerate
sentencepiece
protobuf

# Pending runtime validation: required by current audio preprocessing path.
noisereduce
```

Validated removals only:

| Removed package | Reason |
| --- | --- |
| `datasets` | Not used by the transcription worker; removed in validated minimal image. |
| `pyannote.audio==3.1.1` | Diarization-only dependency; removed in validated minimal image. |

Packages explicitly retained in this stage:

```text
torchaudio
accelerate
sentencepiece
protobuf
```

## Production Cache Volume

Created production cache volume:

```powershell
docker volume create transcript-app_hf_cache
```

Result:

```text
transcript-app_hf_cache
```

Before creation/use, existing container mounts were inspected. No production container mounted `transcript-app_hf_cache`.

The production cache was copied from the running old transcription container into the new volume root with symlink-preserving tar:

```powershell
cmd /c "docker exec transcript_gradio_transcription tar -C /root/.cache/huggingface -cf - . | docker run --rm -i -v transcript-app_hf_cache:/root/.cache/huggingface python:3.10-slim tar -C /root/.cache/huggingface -xf -"
```

This copied the contents of `/root/.cache/huggingface/`, not the parent `huggingface` directory.

Production cache verification:

| Field | Value |
| --- | --- |
| Volume | `transcript-app_hf_cache` |
| Mounted path checked | `/root/.cache/huggingface` |
| Top-level entries | `hub`, `xet` |
| Size | `1.9G` |
| `refs/main` | `a3808e270194b7068711332c23b35cbe5e96fad4` |
| `refs/refs/pr/1` | `2f5ef2abc8e364e011568d44bc20dda56af2e086` |
| Largest blob 1 | `967,103,455` bytes, `8e629b8f40dc5eb136cb147ec2345dea8378005f44cd01e93458f66e18e82b9a` |
| Largest blob 2 | `966,995,080` bytes, `ed13ef26c29f4bcde846903d760aa5f99dda5bf381047ba16c665d4f97cfcfac` |

The source cache inside `transcript_gradio_transcription` was not modified or deleted.

## Compose Configuration

Updated only the `gradio_transcription` service cache/offline settings.

Added environment variables:

```yaml
HF_HOME: /root/.cache/huggingface
TRANSFORMERS_OFFLINE: "1"
HF_HUB_OFFLINE: "1"
```

Updated mount:

```yaml
- hf_cache:/root/.cache/huggingface
```

Declared exact Docker volume name:

```yaml
hf_cache:
  name: transcript-app_hf_cache
```

Preserved existing mount:

```yaml
- /data/911/911_whisper_model:/app/models
```

Validation:

```powershell
docker compose config --quiet
```

Result: passed with no output.

## Production Image Build

Build command:

```powershell
docker build --progress=plain -t transcript-app-gradio_transcription:latest gradio/transcription
```

The build completed fully, including export and unpack:

```text
#10 exporting to image
#10 exporting layers 1555.3s done
#10 exporting manifest sha256:f673148c7b3e65e928d7fdba99ce8124f695b52f7bfb5885f8c9ccf0a0e2eec6 1.0s done
#10 exporting config sha256:250b481382f6486835445ad81f68b7ec65001421209159e98093ea52d1c93a0b 0.8s done
#10 exporting attestation manifest sha256:3a0766c4a2fa1128b04a4b6e52a55e30d1b5ec91ea18c28aa63d0fc95659f3be 1.3s done
#10 exporting manifest list sha256:23b960ad72faef36573abf377796afb3ad257e7e8a741496da452ccfc344e414 0.2s done
#10 naming to docker.io/library/transcript-app-gradio_transcription:latest 7.2s done
#10 unpacking to docker.io/library/transcript-app-gradio_transcription:latest 1488.1s done
#10 DONE 3057.8s
```

New production image:

| Field | Value |
| --- | --- |
| Image | `transcript-app-gradio_transcription:latest` |
| Image ID / digest | `sha256:23b960ad72faef36573abf377796afb3ad257e7e8a741496da452ccfc344e414` |
| Manifest digest | `sha256:f673148c7b3e65e928d7fdba99ce8124f695b52f7bfb5885f8c9ccf0a0e2eec6` |
| Config digest | `sha256:250b481382f6486835445ad81f68b7ec65001421209159e98093ea52d1c93a0b` |
| Created | `2026-07-14T17:02:00.703995415Z` |
| Inspect size | `3,366,258,236` bytes |
| Docker CLI size | `9.75GB` |

Rollback tag still points to the old image:

| Image | Digest | Size |
| --- | --- | ---: |
| `transcript-app-gradio_transcription:rollback-pre-minimal` | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` | `10.2GB` |

No old image was removed.

## Isolated Offline Validation

All isolated validation used:

| Setting | Value |
| --- | --- |
| Network | `--network none` |
| Cache volume | `transcript-app_hf_cache:/root/.cache/huggingface` |
| HF env | `HF_HOME=/root/.cache/huggingface`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_OFFLINE=1` |
| Worker loop | Not started |
| Redis/Qdrant/MinIO/Dagster | Not connected |

Startup gates:

| Test | Result |
| --- | --- |
| `/bin/sh -c "echo shell ok"` | `shell ok` |
| `python -c "print('python ok')"` | `python ok` |
| Import test | Passed |

Import versions:

```text
imports ok
torch 2.6.0+cu124
torchaudio 2.6.0+cu124
transformers 4.52.4
cuda False
```

Offline load:

```text
model_path=Devion333/whisper-small-dv-syn
revision=a3808e270194b7068711332c23b35cbe5e96fad4
device=cpu
torch_cuda_is_available=False
load_elapsed_seconds=43.728
python_peak_memory_bytes=38426869
```

Controlled transcription fixture:

```text
gradio/transcription/fixtures/synthetic_speech_hello.wav
```

Controlled transcription result:

```text
source_fixture=synthetic_speech_hello.wav
model_path=Devion333/whisper-small-dv-syn
revision=a3808e270194b7068711332c23b35cbe5e96fad4
duration_seconds=2.759
selected_device=cpu
language=si
generation=do_sample=False,temperature=0.0,num_beams=1,max_new_tokens=444
transcription=ހެލޯ ޓްރެންސްގްރިޕްޝިން ވަލަޑޭޝަން
transcription_length=34
elapsed_inference_seconds=72.807
python_peak_memory_bytes=99135509
```

Expected output matched exactly:

```text
ހެލޯ ޓްރެންސްގްރިޕްޝިން ވަލަޑޭޝަން
```

Warnings were equivalent to prior validation and related to existing generation behavior:

```text
You have passed task=transcribe, but also have set `forced_decoder_ids` to [(1, 50322), (2, 50363)] which creates a conflict. `forced_decoder_ids` will be ignored in favor of task=transcribe.
The attention mask is not set and cannot be inferred from input because pad token is same as eos token.
```

## Queue Readiness and Replacement Decision

Initial replacement was blocked while Redis, Qdrant, and MinIO were stopped. Before the final replacement, only those existing dependency containers were started:

```powershell
docker start transcript_redis qdrant transcript_minio
```

Readiness checks before replacement:

| Check | Result |
| --- | --- |
| `transcript_redis` | Running |
| `qdrant` | Running |
| `transcript_minio` | Running |
| Redis `PING` | `PONG` |
| `transcription_queue` | `0` |
| `transcription_processing_queue` | `0` |
| `transcription_failed_queue` | `0` |
| Qdrant `/healthz` | `healthz check passed` |
| Qdrant `file_metadata` collection | Green, `points_count=12`, update queue length `0` |
| MinIO live health | HTTP `200` |

Because dependencies were healthy and all transcription queues were empty, the live worker replacement was performed with no dependency recreation and no rebuild:

```powershell
docker compose up -d --no-deps --no-build --force-recreate gradio_transcription
```

Compose emitted the expected warning that `transcript-app_hf_cache` already existed outside Compose ownership. The warning was accepted because the volume was intentionally pre-created and explicitly named for this migration.

Queue state after replacement:

| Queue | Length |
| --- | ---: |
| `transcription_queue` | `0` |
| `transcription_processing_queue` | `0` |
| `transcription_failed_queue` | `0` |

## Smoke Test Result

| Check | Result |
| --- | --- |
| New image shell startup | Passed |
| New image Python startup | Passed |
| New image imports | Passed |
| New image offline model load from production cache | Passed |
| New image controlled transcription | Passed, exact expected output |
| Live worker replacement | Passed |
| Live container image | `sha256:23b960ad72faef36573abf377796afb3ad257e7e8a741496da452ccfc344e414` |
| Live container status | Running |
| Live restart count | `0` |
| Live HF cache mount | `transcript-app_hf_cache:/root/.cache/huggingface` |
| Live offline env | `HF_HOME=/root/.cache/huggingface`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_OFFLINE=1` |

Live startup logs:

```text
🔊 Loading Whisper model...
✅ Whisper model loaded from Devion333/whisper-small-dv-syn on cpu
🚀 Transcription worker started, waiting for jobs...
🔍 Connected to Redis at redis:6379
🔍 Connected to Qdrant at http://qdrant:6333
🔁 Recovered 0 transcription processing jobs
```

Writable-layer comparison:

| Container | Writable layer | Virtual/rootfs size |
| --- | ---: | ---: |
| Old pre-migration `transcript_gradio_transcription` | `1,940,594,688` bytes | `8,675,041,280` bytes |
| New live `transcript_gradio_transcription` | `2.19MB` | `6.39GB` |

## Rollback Readiness

Rollback remains ready:

| Item | Status |
| --- | --- |
| Rollback image tag | `transcript-app-gradio_transcription:rollback-pre-minimal` exists |
| Rollback image digest | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` |
| New live image digest | `sha256:23b960ad72faef36573abf377796afb3ad257e7e8a741496da452ccfc344e414` |
| Production cache volume | Preserved and mounted by the live worker |

No rollback action was required.

## Final Decision

Pass.

Completed:

1. Requirements promotion.
2. Exact rollback image tagging.
3. Production HF cache volume creation and verification.
4. Compose syntax validation.
5. New production image build from active `requirements.txt`.
6. Isolated no-network startup/import/model-load/transcription validation.
7. Exact transcription output match on the controlled fixture.
8. Safe dependency restoration for Redis, Qdrant, and MinIO only.
9. Read-only queue and service readiness checks.
10. Targeted live transcription worker replacement with `--no-deps --no-build`.
11. Live startup smoke check and queue-after comparison.

## Remaining Cleanup Candidates

No cleanup was performed in this final stage. Later candidates after explicit approval:

1. After a rollback window, decide whether to remove the old rollback image.
2. Prune BuildKit cache only after approval; build cache grew during image rebuild.
3. If desired, mark `transcript-app_hf_cache` as an external Compose volume to suppress the ownership warning.

## Production Safety Confirmation

| Item | Confirmation |
| --- | --- |
| `transcript_gradio_transcription` | Recreated once with `--no-deps --no-build`; now running the promoted image. |
| Production cache volume | Preserved and mounted read/write by the live worker at `/root/.cache/huggingface`. |
| Redis | Existing container started; queues read only; no jobs submitted. |
| Qdrant | Existing container started; health/collection read only. |
| MinIO | Existing container started; health checked only. |
| Protected volumes | `transcript-app_minio_data`, `transcript-app_qdrant_data`, and `transcript-app_dagster_home` preserved. |
| Unrelated services | Not recreated. |
| Images | Old production image preserved via rollback tag; no image removed. |
| VHDX | No compaction performed. |
