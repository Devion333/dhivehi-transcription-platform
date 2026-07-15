# Docker Cleanup and Image Preparation

Date: 2026-07-14. Scope: explicitly approved cleanup and low-risk transcription image preparation only. No broad prune, image removal, volume removal, worker start, Docker build, model download, package install, VHDX compaction, transcription source edit, or active dependency-file overwrite was performed.

## Inputs Read

Required context was read before cleanup:

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Project architecture and operational constraints. |
| `ARCHITECTURE.md` | Current service, volume, and worker topology. |
| `docs/audits/transcription-worker-audit.md` | Transcription worker dependency, image, model-cache, and deployment findings. |
| `docs/audits/transcription-stage1-implementation.md` | Stage 1 queue/correctness implementation record and preserved behavior. |
| `docs/audits/docker-disk-and-transcription-image-audit.md` | Stage 2 disk/image audit and approved cleanup candidates. |

## Reconfirmed State Before Cleanup

Commands run:

```powershell
docker container ls -a
docker images --digests
docker volume ls
docker builder du
docker buildx du
```

Confirmed assumptions:

| Assumption | Result |
| --- | --- |
| `transcript_gradio_diarization` is still dead | Confirmed: status `Dead`, container ID `512da984a414`. |
| Transcription container still exists | Confirmed: `transcript_gradio_transcription`, container ID `2779752652fe`, status `Up`. |
| `transcript-app_minio_data` exists | Confirmed. |
| `transcript-app_qdrant_data` exists | Confirmed. |
| `transcript-app_dagster_home` exists | Confirmed. |

Pre-cleanup VHDX size:

| Path | Size | Last modified |
| --- | ---: | --- |
| `C:\Users\Dell\AppData\Local\Docker\wsl\disk\docker_data.vhdx` | `57,763,954,688` bytes | `2026-07-14 15:06:34` |

Pre-cleanup BuildKit cache:

| Command | Total | Reclaimable | Private | Shared |
| --- | ---: | ---: | ---: | ---: |
| `docker builder du` | `14.36GB` | `14.36GB` | `12.4GB` | `1.963GB` |
| `docker buildx du` | `14.36GB` | `14.36GB` | `12.4GB` | `1.963GB` |

## Dead Container Removal

Only this container was removed:

```powershell
docker rm transcript_gradio_diarization
```

Result:

```text
transcript_gradio_diarization
```

No image was removed. Its image `transcript-app-gradio_diarization:latest` remains present.

## Docker Accounting After Dead Container Removal

After removing the dead container, Docker accounting commands worked again.

Commands run:

```powershell
docker system df
docker system df -v
docker ps -a --size
```

`docker system df` after dead container removal, before BuildKit prune:

| Type | Total | Active | Size | Reclaimable |
| --- | ---: | ---: | ---: | ---: |
| Images | `14` | `6` | `33.25GB` | `6.5GB (19%)` |
| Containers | `6` | `3` | `2.214GB` | `53.25kB (0%)` |
| Local Volumes | `26` | `4` | `497.2MB` | `48.23MB (9%)` |
| Build Cache | `288` | `0` | `14.36GB` | `12.4GB` |

Largest container writable layers:

| Container | Status | Writable size |
| --- | --- | ---: |
| `transcript_gradio_transcription` | `Up` | `1.94GB` |
| `transcript_dagster` | `Up` | `273MB` |
| `transcript_gradio_convert` | `Up` | `725kB` |

Protected volume sizes reported by Docker:

| Volume | Size | Links |
| --- | ---: | ---: |
| `transcript-app_minio_data` | `86.95MB` | `1` |
| `transcript-app_qdrant_data` | `344.1MB` | `1` |
| `transcript-app_dagster_home` | `17.97MB` | `1` |

## BuildKit Cache Prune

Only this prune command was run:

```powershell
docker builder prune -f
```

Result reported by Docker:

```text
Total: 12.4GB
```

No `docker system prune`, `docker volume prune`, image prune, container prune, network prune, or second buildx prune was run.

## Docker Accounting After BuildKit Prune

`docker system df` after BuildKit prune:

| Type | Total | Active | Size | Reclaimable |
| --- | ---: | ---: | ---: | ---: |
| Images | `14` | `6` | `21.72GB` | `6.5GB (29%)` |
| Containers | `6` | `3` | `2.214GB` | `53.25kB (0%)` |
| Local Volumes | `26` | `4` | `497.2MB` | `48.23MB (9%)` |
| Build Cache | `36` | `0` | `1.963GB` | `0B` |

`docker buildx du` still reports shared cache:

| Metric | Value |
| --- | ---: |
| Shared | `1.963GB` |
| Private | `0B` |
| Reclaimable | `1.963GB` |
| Total | `1.963GB` |

This was reported only. A second prune was not run automatically.

Post-cleanup VHDX size:

| Path | Size | Last modified |
| --- | ---: | --- |
| `C:\Users\Dell\AppData\Local\Docker\wsl\disk\docker_data.vhdx` | `57,763,954,688` bytes | `2026-07-14 15:08:03` |

The VHDX physical size did not change. This is expected: Docker cleanup can free space inside Docker Desktop's Linux filesystem, while the dynamically expanding VHDX usually does not shrink until a later explicit compaction step.

## Protected Data Verification

After cleanup:

| Item | Verification |
| --- | --- |
| MinIO volume | `transcript-app_minio_data` still exists, size reported `86.95MB`. |
| Qdrant volume | `transcript-app_qdrant_data` still exists, size reported `344.1MB`. |
| Dagster volume | `transcript-app_dagster_home` still exists, size reported `17.97MB`. |
| Transcription container | `transcript_gradio_transcription` still exists and remains `Up`. |
| Transcription image | `transcript-app-gradio_transcription:latest` still exists. |
| Current model cache | `docker diff transcript_gradio_transcription` still shows `/root/.cache/huggingface/hub/models--Devion333--whisper-small-dv-syn` and related Xet cache/log paths. |

No MinIO, Qdrant, Redis, Dagster, Backstep, anonymous, or unknown volumes were removed.

## Current Hugging Face Cache Inspection

Read-only inspection of the running `transcript_gradio_transcription` container confirmed the currently cached model state before any rebuild or migration:

| Item | Value |
| --- | --- |
| Cache root | `/root/.cache/huggingface` |
| Total reported size | `1.9G` |
| Model cache path | `/root/.cache/huggingface/hub/models--Devion333--whisper-small-dv-syn` |
| Model cache size | `1.9G` |
| Xet cache size | `464K` |
| Lock directory size | `4.0K` |

Refs:

| Ref | Revision |
| --- | --- |
| `refs/main` | `a3808e270194b7068711332c23b35cbe5e96fad4` |
| `refs/refs/pr/1` | `2f5ef2abc8e364e011568d44bc20dda56af2e086` |

Snapshots present:

| Snapshot | Reported directory size | Notes |
| --- | ---: | --- |
| `a3808e270194b7068711332c23b35cbe5e96fad4` | `8.0K` | Contains symlinks to the main model/config/tokenizer blobs, including `pytorch_model.bin`. |
| `2f5ef2abc8e364e011568d44bc20dda56af2e086` | `8.0K` | Contains a symlink to `model.safetensors`. |

Large blobs:

| Blob | Size | Referenced as |
| --- | ---: | --- |
| `8e629b8f40dc5eb136cb147ec2345dea8378005f44cd01e93458f66e18e82b9a` | `967,103,455` bytes | `snapshots/a3808e.../pytorch_model.bin` |
| `ed13ef26c29f4bcde846903d760aa5f99dda5bf381047ba16c665d4f97cfcfac` | `966,995,080` bytes | `snapshots/2f5ef.../model.safetensors` |

The two large model blobs are close in size but distinct files. This matters for migration: copying the whole cache as-is preserves both the current `main` snapshot and the `refs/pr/1` snapshot.

## `.dockerignore`

Created `gradio/transcription/.dockerignore`:

```text
__pycache__/
*.pyc
*.pyo
*.log
.env
.env.*
.cache/
models/
checkpoints/
outputs/
*.bin
*.safetensors
*.pt
*.pth
```

Purpose: prevent accidental model checkpoints, Hugging Face caches, logs, env files, Python bytecode, or output artifacts from entering the transcription Docker build context. It does not ignore `Dockerfile`, `requirements.txt`, or `transcription.py`.

## Minimal Requirements Proposal

Created `gradio/transcription/requirements.minimal.txt`. The active `requirements.txt` was not changed.

Difference from active requirements:

| Package | Active `requirements.txt` | Minimal proposal | Reason |
| --- | --- | --- | --- |
| `pyannote.audio` | `pyannote.audio==3.1.1` | Removed | Diarization-only package; not imported by transcription. |
| `datasets` | `datasets` | Removed | Not imported by transcription; large dependency tree. |
| `torchaudio` | `torchaudio==2.6.0` | Kept | Pending runtime validation. |
| `accelerate` | `accelerate` | Kept | Pending runtime validation. |
| `sentencepiece` | `sentencepiece` | Kept | Pending tokenizer/model-load validation. |
| `protobuf` | `protobuf` | Kept | Pending tokenizer/model-load validation. |

`requirements.minimal.txt` contents:

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

No package versions were changed beyond copying the active declarations.

## Dockerfile Test Hook

Updated `gradio/transcription/Dockerfile` to make the requirements file selectable at build time while preserving the current default behavior:

```dockerfile
ARG REQUIREMENTS_FILE=requirements.txt
COPY ${REQUIREMENTS_FILE} requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
```

Normal Compose builds still use `requirements.txt`. A future approved test build can opt into the minimal proposal with a build argument, for example:

```powershell
docker build --build-arg REQUIREMENTS_FILE=requirements.minimal.txt -t transcript-app-gradio_transcription:minimal-test gradio/transcription
```

No Docker build was run during this preparation step.

Follow-up build was later approved and run after the cache inspection.

## Compose Hugging Face Cache Preparation

Updated only `compose.yml` for the transcription worker cache path.

Added environment variable:

```yaml
HF_HOME: /root/.cache/huggingface
```

Added volume mount to `gradio_transcription`:

```yaml
- transcription_hf_cache:/root/.cache/huggingface
```

Added named volume declaration:

```yaml
transcription_hf_cache:
```

The existing model mount remains unchanged:

```yaml
- /data/911/911_whisper_model:/app/models
```

The current transcription container was not recreated. Therefore, the existing cached model remains in the current container writable layer until a controlled migration/recreate step is approved later.

## Validation

Safe validation performed:

```powershell
docker compose config --quiet
```

`--quiet` was used to validate Compose without printing interpolated `.env` values. Result: passed with no output.

Python syntax checks were not run because no Python source file was modified.

## Minimal Test Image Build

Before the test build, BuildKit cache was checked and then pruned with the already approved command:

```powershell
docker builder prune -f
```

Result:

```text
Total: 0B
```

Docker still reported `1.963GB` shared BuildKit cache afterward, but the prune command did not reclaim it.

Test image build command:

```powershell
docker build --build-arg REQUIREMENTS_FILE=requirements.minimal.txt -t transcript-app-gradio_transcription:minimal-test gradio/transcription
```

The first build attempt exceeded the command timeout while installing packages and did not register the test image. The second attempt completed package installation and image export; the shell command timed out during the final unpack phase, but Docker registered the image successfully.

Registered images after build:

| Image | Tag | Digest | Size |
| --- | --- | --- | ---: |
| `transcript-app-gradio_transcription` | `minimal-test` | `sha256:c496eb9f3b3228652fabca26e4a6a70c7cde789fe445d480d25b0bf6f7615c47` | `3.37GB` |
| `transcript-app-gradio_transcription` | `latest` | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` | `10.2GB` |

The running `transcript_gradio_transcription` container was not recreated, stopped, or replaced. It still uses the old image/container writable layer and still reports a `1.94GB` writable size.

Docker storage after the test build:

| Type | Total | Active | Size | Reclaimable |
| --- | ---: | ---: | ---: | ---: |
| Images | `15` | `6` | `31.29GB` | `9.683GB (30%)` |
| Containers | `6` | `2` | `2.214GB` | `272.9MB (12%)` |
| Local Volumes | `26` | `4` | `497.3MB` | `48.23MB (9%)` |
| Build Cache | `43` | `0` | `11.53GB` | `117.2kB` via `docker system df` |

`docker builder du` reported the post-build cache differently:

| Metric | Value |
| --- | ---: |
| Shared | `11.53GB` |
| Private | `117.2kB` |
| Reclaimable | `11.53GB` |
| Total | `11.53GB` |

No post-build BuildKit prune was run without fresh approval.

Post-build VHDX size remained unchanged:

| Path | Size | Last modified |
| --- | ---: | --- |
| `C:\Users\Dell\AppData\Local\Docker\wsl\disk\docker_data.vhdx` | `57,763,954,688` bytes | `2026-07-14 17:19:38` |

## Remaining Steps

Before replacing or recreating the transcription service:

1. Optionally approve a post-build BuildKit prune to reduce the `11.53GB` cache reported by `docker builder du`.
2. Run import tests in a safe boundary that does not unexpectedly download/load models, or use a prepared cache.
3. Validate model/processor load with the existing model and cache strategy.
4. Run one known transcription sample and compare output before/after dependency removal.
5. Decide whether to migrate the current container's Hugging Face cache into the new named volume before recreating the transcription container.
6. Only after Docker cleanup and validation, consider explicit VHDX compaction with backup and user approval.
