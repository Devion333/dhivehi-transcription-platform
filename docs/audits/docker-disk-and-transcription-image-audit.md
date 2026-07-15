# Docker Disk and Transcription Image Audit

Audit date: 2026-07-14. Scope: read-only Docker Desktop disk audit plus transcription dependency/image cleanup planning. No cleanup, prune, Docker build, package install, model download, VHDX operation, worker start, or transcription dependency/code edit was performed.

## Evidence Read

Required docs read before edits:

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Architecture and operational constraints. |
| `ARCHITECTURE.md` | Current service, queue, storage, and Docker topology. |
| `docs/audits/system-inventory.md` | Prior full-system audit. |
| `docs/audits/transcription-worker-audit.md` | Prior transcription-worker audit. |
| `docs/audits/transcription-stage1-implementation.md` | Stage 1 implementation record. |

Transcription files inspected:

| File | Finding summary |
| --- | --- |
| `gradio/transcription/Dockerfile` | Single-stage `python:3.10-slim`; installs requirements with `--no-cache-dir`; copies entire build context; no `.dockerignore`. |
| `gradio/transcription/requirements.txt` | Includes large packages that are not directly used by `transcription.py`, especially `pyannote.audio`, `datasets`, `torchaudio`, and `accelerate`. |
| `gradio/transcription/transcription.py` | Imports `requests`, `redis`, `torch`, `transformers`, `librosa`, and `noisereduce`; loads `Devion333/whisper-small-dv-syn` at startup; active code does not use `/app/models`. |
| `compose.yml` | Transcription service builds local image, mounts `/data/911/911_whisper_model:/app/models`, but code loads the Hugging Face model ID. No GPU device request. |

No `.dockerignore` file was found in the repository.

## 1. VHDX and Host Disk

Read-only PowerShell inspection of `C:\Users\Dell\AppData\Local\Docker\wsl\disk\docker_data.vhdx`:

| Item | Value |
| --- | --- |
| VHDX path | `C:\Users\Dell\AppData\Local\Docker\wsl\disk\docker_data.vhdx` |
| VHDX size | `57,763,954,688` bytes, about `57.76 GB` decimal or `53.80 GiB` |
| Last modified | `2026-07-11 15:56:28` local time |
| C: free space | `80,370,155,520` bytes, about `80.37 GB` decimal or `74.85 GiB` |
| C: used space | `413,865,652,224` bytes, about `413.87 GB` decimal or `385.47 GiB` |

The VHDX was not opened, moved, resized, compacted, or modified.

## 2. WSL and Docker Desktop Settings

`wsl --list --verbose` returned `docker-desktop` as WSL2. The first WSL check showed it stopped; later Docker CLI calls became available, and container inspection showed active containers.

`wsl --status` reported default distribution `docker-desktop`, default version `2`, and WSL1 unsupported by the current machine configuration.

Docker Desktop settings file inspected: `C:\Users\Dell\AppData\Roaming\Docker\settings-store.json`.

Relevant settings:

```json
{
  "AutoStart": false,
  "UseContainerdSnapshotter": true
}
```

Assessment: the `53.80 GiB` VHDX is a mixture of active Docker objects, reclaimable BuildKit cache, image/container writable layers, persistent volumes, and filesystem free space that may remain inside the dynamically expanding VHDX until compaction.

## 3. Docker Command Availability

| Command | Result |
| --- | --- |
| `docker images --digests` | Succeeded. |
| `docker volume ls` | Succeeded. |
| `docker builder du` | Succeeded. |
| `docker buildx du` | Succeeded. |
| `docker system df` | Failed after Docker became reachable because container metadata is inconsistent: `rw layer snapshot not found for container 512da984...`. |
| `docker system df -v` | Same failure. |
| `docker ps -a --size` | Same failure. |

Important finding: Docker has a broken/dead container metadata entry for `512da984a414`, named `/transcript_gradio_diarization`, with status `dead`, image `transcript-app-gradio_diarization`, and error path reporting `rw layer snapshot not found`. This blocks normal `docker system df` and `docker ps --size` summaries.

## 4. Docker Storage Summary

Because `docker system df` is blocked by the broken container layer, exact Docker-wide image/container/volume reclaimability could not be obtained from Docker's summary command. Available read-only evidence gives this partial storage picture:

| Category | Observed data | Reclaimable estimate |
| --- | --- | --- |
| Images | `docker images --digests` shows about `29.99 GB` of image sizes by CLI display, dominated by transcription and diarization images. This is not deduplicated reclaimable size. | Unknown from `docker system df`; must be rechecked after resolving/removing the broken dead container. |
| Build cache | `docker builder du` and `docker buildx du` report `14.36 GB total`, `14.36 GB reclaimable`, `12.4 GB private`, `1.963 GB shared`. | `14.36 GB` appears reclaimable if user later approves BuildKit cache pruning. |
| Container writable layers | Individual `docker inspect --size` succeeded for most containers. Largest writable layer is `transcript_gradio_transcription` at `1,940,578,304` bytes, about `1.94 GB`. | Not safe to reclaim while preserving the active container/cache. Reclaiming it would require removing/recreating the container after model-cache strategy is decided. |
| Volumes | `docker volume ls` shows TranscriptApp protected volumes plus many anonymous volumes and one Backstep Postgres volume. Exact volume sizes were not safely measured through Docker because `docker system df -v` fails. | Unknown. Protected app volumes must not be deleted. Anonymous/unknown volumes require review. |
| VHDX retained free space | VHDX is `53.80 GiB`, larger than clearly attributable reclaimable cache alone. | Some Windows-space recovery will likely require VHDX compaction after Docker cleanup. |

## 5. Image Inventory

`docker images --digests` reported:

| Repository:tag | Image ID | CLI size | Container use observed | Project/service | Replaceable? | ML/model indicators | Notes |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| `transcript-app-gradio_transcription:latest` | `7d6f14ba1df7` | `10.2GB` | Used by running `/transcript_gradio_transcription` | TranscriptApp real transcription | Not until rebuilt/validated | PyTorch, Transformers, Whisper runtime cache in container writable layer | Largest image by CLI. `docker history` shows `pip install -r requirements.txt` layer at `6.6GB`. |
| `transcript-app-gradio_diarization:latest` | `a82f7444335d` | `3.41GB` | Used by dead `/transcript_gradio_diarization` | TranscriptApp real diarization | Requires review | PyTorch, pyannote stack | Container metadata is broken/dead. |
| `transcript-app-backend:latest` | `2ab804f0944b` | `2.14GB` | No current container observed | TranscriptApp backend | Rebuild strategy could reduce later | No ML | Large for Go service; likely single-stage Go build image. Not part of transcription scope. |
| `transcript-app-gradio_convert:latest` | `672e70b89041` | `1.11GB` | Used by running `/transcript_gradio_convert` | TranscriptApp conversion | Keep if current prod-style stack is used | ffmpeg/audio conversion | Current running worker. |
| `postgres:15` | `3b0d656f5fff` | `633MB` | No current container observed | Backstep/old project likely | User review | No ML | Paired with `backstep_backstep_postgres_data`. |
| `transcript-app-analysis:latest` | `7bf1c60d305f` | `410MB` | No current container observed | TranscriptApp dev analysis | User review | No ML | Dev-only service in `compose.dev.yml`. |
| `backstep-backstep-web:latest` | `35578561309e` | `383MB` | No current container observed | Backstep project | User review | No ML | Separate project. |
| `qdrant/qdrant:latest` | `75eab8c4ba42` | `270MB` | Used by exited `/qdrant` | TranscriptApp Qdrant | Preserve | No ML | Persistent metadata volume attached. |
| `minio/minio:latest` | `14cea493d9a3` | `241MB` | Used by exited `/transcript_minio` | TranscriptApp MinIO | Preserve | No ML | Persistent upload volume attached. |
| `transcript-app-mock_convert:latest` | `834c86c7175e` | `211MB` | No current container observed | TranscriptApp dev mock | Keep for dev or remove after review | No ML | Dev convenience. |
| `transcript-app-mock_diarization:latest` | `6c5bea569487` | `211MB` | No current container observed | TranscriptApp dev mock | Keep for dev or remove after review | No ML | Dev convenience. |
| `transcript-app-mock_transcription:latest` | `b74d6e06df42` | `211MB` | No current container observed | TranscriptApp dev mock | Keep for dev or remove after review | No ML | Dev convenience. |
| `python:3.10-slim` | `5f9928ea3977` | `185MB` | Used by running `/transcript_dagster`; base for workers | Shared base | Preserve if images/containers depend on it | No ML | Dagster installs packages at runtime. |
| `redis:7` | `b2b95679e3b4` | `170MB` | Used by exited `/transcript_redis` | TranscriptApp Redis | Preserve | No ML | Redis container has an anonymous data volume. |

`docker image inspect` reported lower raw `Size` for some images than `docker image ls` display, for example transcription `3,461,760,642` bytes. This discrepancy should be rechecked after Docker metadata is healthy. For planning, use the CLI's displayed `10.2GB` as the user-visible image footprint and `docker history` as evidence that the dependency layer is the main contributor.

No dangling `<none>` images were listed by `docker images --digests`.

## 6. Transcription Image History

`docker history --no-trunc transcript-app-gradio_transcription:latest` shows:

| Layer | Size | Assessment |
| --- | ---: | --- |
| `RUN pip install --no-cache-dir -r requirements.txt` | `6.6GB` | Dominant image layer. Caused by PyTorch, torchaudio, pyannote/audio ecosystem, datasets/pyarrow-style dependencies, Transformers/audio stack, and transitive native libraries. |
| `COPY . .` | `28.7kB` | Build context content is currently tiny, but lack of `.dockerignore` is fragile. |
| `python:3.10-slim` base layers | about `138MB` visible in history | Small compared with ML dependency layer. |

The image itself does not appear to bake the Whisper model during build. Runtime inspection of the running container shows model cache in the writable layer instead.

## 7. Container Inventory

Container list from `docker container ls -aq` returned seven IDs. `docker ps -a --size` failed due to the dead diarization container, so containers were inspected individually.

| Container | Image | Status | Writable layer | Mounts | Current project? | Obsolete? |
| --- | --- | --- | ---: | --- | --- | --- |
| `/transcript_gradio_transcription` | `transcript-app-gradio_transcription` | `running` | `1,940,578,304` bytes | bind `/data/911/911_whisper_model -> /app/models` | Yes | No. Running before audit; not started by this audit. Writable layer contains Hugging Face model cache. |
| `/transcript_dagster` | `python:3.10-slim` | `running` | `272,830,464` bytes | bind repo `dagster`, volume `transcript-app_dagster_home` | Yes | No if prod-style Dagster is being used. Runtime pip install increases writable layer. |
| `/transcript_gradio_convert` | `transcript-app-gradio_convert` | `running` | `724,992` bytes | none | Yes | No if prod-style stack is being used. |
| `/transcript_gradio_diarization` | `transcript-app-gradio_diarization` | `dead` | Not measurable; `--size` says no such object after snapshot error | bind `gradio/diarization/outputs`, bind `models/pyannote` | Yes | Likely cleanup candidate after user approval because state is `dead` and snapshot metadata is broken. |
| `/transcript_redis` | `redis:7` | `exited` | `4,096` bytes | anonymous volume to `/data` | Yes | Preserve until queue/data retention decision. Small writable layer. |
| `/qdrant` | `qdrant/qdrant:latest` | `exited` | `24,576` bytes | volume `transcript-app_qdrant_data` | Yes | Preserve; contains transcript metadata volume. |
| `/transcript_minio` | `minio/minio:latest` | `exited` | `24,576` bytes | volume `transcript-app_minio_data` | Yes | Preserve; contains uploaded audio data volume. |

Important: several real prod-style containers were already running when inspected (`transcript_gradio_transcription`, `transcript_gradio_convert`, and `transcript_dagster`). This audit did not start, stop, restart, or modify them.

## 8. Runtime Model Cache Finding

`docker diff transcript_gradio_transcription` shows the running transcription container added:

```text
/root/.cache/huggingface/hub/models--Devion333--whisper-small-dv-syn
/root/.cache/huggingface/xet
```

It includes model snapshot files such as `pytorch_model.bin`, `model.safetensors`, tokenizer/config files, and Xet logs. This explains the `1.94GB` writable layer. Because this cache is inside the container writable layer, removing/recreating the container would reclaim it but also force a future model download unless an explicit persistent Hugging Face cache volume or mounted local model is configured.

The Compose mount `/data/911/911_whisper_model:/app/models` is not used by active code because `model_path = "Devion333/whisper-small-dv-syn"`.

## 9. Volume Inventory

`docker volume ls` shows protected TranscriptApp volumes, one Backstep named volume, and many anonymous volumes.

Named volumes inspected:

| Volume | Labels/project | Mountpoint | Referenced by container? | Approx size | Contains | Delete risk |
| --- | --- | --- | --- | ---: | --- | --- |
| `transcript-app_minio_data` | Compose project `transcript-app`, volume `minio_data` | `/var/lib/docker/volumes/transcript-app_minio_data/_data` | `/transcript_minio` | Not safely measurable because `docker system df -v` fails | MinIO uploaded/converted audio objects | Must preserve; deleting causes audio data loss. |
| `transcript-app_qdrant_data` | Compose project `transcript-app`, volume `qdrant_data` | `/var/lib/docker/volumes/transcript-app_qdrant_data/_data` | `/qdrant` | Not safely measurable | Qdrant transcript metadata, segment payloads, analysis data | Must preserve; deleting causes metadata/transcript loss. |
| `transcript-app_dagster_home` | Compose project `transcript-app`, volume `dagster_home` | `/var/lib/docker/volumes/transcript-app_dagster_home/_data` | `/transcript_dagster` | Not safely measurable | Dagster runtime state | Preserve unless user decides Dagster state is disposable. |
| `backstep_backstep_postgres_data` | Compose project `backstep`, volume `backstep_postgres_data` | `/var/lib/docker/volumes/backstep_backstep_postgres_data/_data` | No current container observed | Not safely measurable | Separate project PostgreSQL data | Requires user review; possible data loss. |
| Anonymous volumes, 21 observed | No names meaningful from `volume ls` | `/var/lib/docker/volumes/<id>/_data` | One anonymous Redis volume is referenced by `/transcript_redis`; others unknown | Not safely measurable | Unknown; may be abandoned container data | Requires user review unless proven orphaned. |

Host bind/cache paths inspected:

| Path | Size | Meaning |
| --- | ---: | --- |
| `models/pyannote` | `17,125,144` bytes, about `16.3 MiB` | Diarization Hugging Face cache bind mount. Small currently. Preserve unless diarization cache is intentionally reset. |
| `gradio/diarization/outputs` | Empty or size not returned by PowerShell sum | Local RTTM output bind mount. Preserve until output retention decision. |
| `C:\data\911\911_whisper_model` | Not found | The Windows path corresponding to Compose's Linux-style `/data/911/911_whisper_model` was not found. |

## 10. Build Cache Inventory

`docker builder du` and `docker buildx du` both reported:

| Metric | Value |
| --- | ---: |
| Total build cache | `14.36GB` |
| Reclaimable build cache | `14.36GB` |
| Private | `12.4GB` |
| Shared | `1.963GB` |

Assessment:

1. Build cache is a major contributor and is the clearest low-risk reclaim candidate after explicit approval.
2. Cache entries include many layers in the 40-80 MB range and several large entries up to about `716.2MB`, consistent with repeated Python dependency builds/pulls.
3. Because the transcription image's `pip install` layer is large, repeated transcription/diarization/backend builds likely created duplicate or stale BuildKit cache records.
4. BuildKit cache pruning later should be safe for application data because it removes rebuild acceleration cache, not named volumes. It will slow future builds.

## 11. Why the VHDX Reached About 53 GiB

Likely contributors supported by inspection:

1. Transcription image CLI size `10.2GB`, with `6.6GB` dependency install layer.
2. Diarization image `3.41GB`, also ML-heavy.
3. BuildKit cache `14.36GB`, fully reported reclaimable.
4. Transcription container writable layer `1.94GB`, confirmed to contain Hugging Face model cache for `Devion333/whisper-small-dv-syn`.
5. Other images total several GB, including backend `2.14GB`, convert `1.11GB`, Postgres `633MB`, analysis `410MB`, and a separate Backstep image `383MB`.
6. Persistent named and anonymous volumes of unknown size, including protected MinIO/Qdrant volumes and Backstep Postgres data.
7. Dynamically expanding VHDX behavior: deleting Docker objects later will not necessarily shrink `docker_data.vhdx` until the internal filesystem is compacted.

Conclusion: the VHDX is a mixture of active Docker objects, reclaimable BuildKit cache, runtime model cache, persistent app data, and retained free space.

## 12. Reclamation Plan

No cleanup was run. Commands below are proposed only for a later approved stage.

### Safe, Low-Risk Candidates After Approval

| Candidate | Evidence | Estimated reclaim | Risk |
| --- | --- | ---: | --- |
| BuildKit cache prune | `docker builder du` reports `14.36GB` total and reclaimable | Up to `14.36GB` inside Docker storage | Low for data; future builds slower. |
| Dead `/transcript_gradio_diarization` container cleanup | Status `dead`; snapshot metadata broken; blocks `docker system df` | Unknown; may also restore Docker accounting commands | Low/medium; container should be recreated from image if needed, but confirm no needed writable data. |
| Recreate transcription container after adding persistent HF cache volume | Writable layer `1.94GB` contains HF model cache | About `1.94GB`, but only after cache moved/preserved elsewhere | Medium; removing current container loses current downloaded model cache and can force re-download. |

### Requires User Review

| Candidate | Evidence | Estimated reclaim | Risk |
| --- | --- | ---: | --- |
| Unused TranscriptApp dev images: `transcript-app-analysis`, mock worker images | No current containers observed | About `1.04GB` by CLI sizes | Low if dev images can be rebuilt; keep if dev stack is actively used. |
| `backstep-backstep-web`, `postgres:15`, `backstep_backstep_postgres_data` | Separate project image/volume; no current container observed | At least `1.016GB` in images plus unknown volume | User review required; possible unrelated project data loss. |
| Anonymous volumes | 21 anonymous volumes observed; one Redis volume is referenced | Unknown | Must identify ownership before removal. |
| `transcript-app-backend:latest` large image | `2.14GB`; no current backend container observed | Unknown/deduped | Not transcription scope; may be needed for backend dev. |
| Transcript model cache in writable layer | `docker diff` confirms HF cache | `1.94GB` writable layer | Preserve until model-cache strategy prevents redownload. |

### Must Preserve

| Data | Why |
| --- | --- |
| `transcript-app_minio_data` | Active/persistent uploaded and converted audio data. |
| `transcript-app_qdrant_data` | Active/persistent transcript metadata, segment text, statuses, analysis fields. |
| `transcript-app_dagster_home` | Preserve unless Dagster run history is explicitly disposable. |
| Current TranscriptApp images used by active services | Needed to run current stack unless rebuilt. |
| Hugging Face model cache until a cache volume/model path plan exists | Avoids forced re-download and startup delay. |
| Any unknown anonymous volume until owner is identified | Possible data loss. |

## 13. Proposed Later Cleanup Commands

Do not run without explicit approval. Re-run `docker ps -a`, `docker system df -v`, and `docker builder du` immediately before cleanup.

Low-risk sequence after approval:

```powershell
# Reconfirm state first
docker container ls -a
docker images --digests
docker volume ls
docker builder du
docker buildx du

# If approved: remove only the dead broken diarization container by exact ID/name
docker rm transcript_gradio_diarization

# Recheck Docker accounting after broken container removal
docker system df
docker system df -v
docker ps -a --size

# If approved: prune BuildKit cache only
docker builder prune
# or, if using buildx-specific cache management after review:
docker buildx prune
```

User-review cleanup examples, not recommended until confirmed:

```powershell
# Only if user confirms these images are rebuildable/disposable
docker image rm transcript-app-analysis:latest
docker image rm transcript-app-mock_convert:latest transcript-app-mock_diarization:latest transcript-app-mock_transcription:latest

# Only if user confirms Backstep project data is disposable
docker image rm backstep-backstep-web:latest postgres:15
docker volume rm backstep_backstep_postgres_data
```

Do not run broad `docker system prune --volumes` for this project because it can remove volumes containing application data.

## 14. Future VHDX Compaction Procedure

Compaction is a separate action requiring explicit approval after Docker cleanup. It should not be used as a substitute for data backup.

Recommended procedure:

1. Back up protected data first: MinIO data, Qdrant data, and any needed Docker volumes. Use Docker-supported export/backup methods, not direct VHDX editing.
2. Run Docker cleanup only after approval and verify the app still has required images/volumes.
3. Quit Docker Desktop from the tray UI.
4. Run `wsl --shutdown`.
5. Confirm WSL is stopped with `wsl --list --verbose`.
6. Confirm no Docker Desktop or WSL processes remain in Task Manager or with safe process inspection.
7. Check whether Hyper-V `Optimize-VHD` is available with `Get-Command Optimize-VHD`.
8. If available, compact the VHDX with an approved command such as `Optimize-VHD -Path "C:\Users\Dell\AppData\Local\Docker\wsl\disk\docker_data.vhdx" -Mode Full`.
9. If `Optimize-VHD` is unavailable, use a supported alternative such as Docker Desktop's built-in disk cleanup/compact feature if present, or a supported `diskpart` compact workflow for VHDX files. Do not improvise direct edits.
10. Restart Docker Desktop.
11. Verify `docker ps -a`, `docker volume ls`, `docker images`, MinIO, Qdrant, and transcript data before doing more cleanup.

`Get-Command Optimize-VHD` returned no command in this environment, so the Hyper-V PowerShell cmdlet does not appear available from the current shell.

## 15. Requirements Usage Analysis

| Package | Declared version | Direct import in `transcription.py` | Probable transitive use | Likely image-size impact | Required for current behavior | Safe removal confidence | Validation needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `transformers` | `4.52.4` | Yes, `WhisperProcessor`, `WhisperForConditionalGeneration`, Auto classes | Model/processor loading, generation, tokenizer integration | High/moderate | Yes | Do not remove | Import and model-load test. |
| `torch` | `2.6.0` | Yes | Model backend, tensor ops, CUDA check | Very high | Yes | Do not remove | Import, CPU/GPU availability, known sample transcription. |
| `torchaudio` | `2.6.0` | No | May be used by some audio/model stacks, but current code uses `librosa` and Transformers | High | Not confirmed | Medium, after validation | Fresh image import/model-load/transcription test without it. |
| `librosa` | `0.10.1` | Yes | Audio decode/resample; uses `soundfile`, `audioread`, `numba` stack | Moderate/high | Yes | Do not remove while preserving audio path | Known audio decode and transcript comparison. |
| `soundfile` | `0.12.1` | No | Librosa backend for audio reading | Low/moderate native | Likely yes | Low removal confidence | Librosa load test across WAV/input formats. |
| `redis` | `5.0.1` | Yes | None beyond Redis client | Low | Yes | Do not remove | Static import and queue integration. |
| `requests` | `2.31.0` | Yes | HTTP downloads/Qdrant/Dagster | Low | Yes | Do not remove | Static import and HTTP tests. |
| `numpy` | `1.26.4` | No direct import | Librosa/noisereduce/audio arrays, Transformers processor input | Moderate | Yes indirectly | Low removal confidence | Audio and inference tests. |
| `accelerate` | unpinned | No | Optional Transformers acceleration/device-map paths; current code does not use `device_map` or `accelerate` APIs | Moderate | Not confirmed | Medium/high | Model-load test without it; ensure Transformers does not require it for this model. |
| `sentencepiece` | unpinned | No | Tokenizer support for some models/processors | Low/moderate native | Possibly | Medium/low | Processor/tokenizer load test without it. |
| `protobuf` | unpinned | No | Tokenizer/config serialization for some HF processors | Low/moderate | Possibly | Medium/low | Processor/tokenizer load test without it. |
| `datasets` | unpinned | No | None apparent in current runtime | High, due dependency tree | No apparent need | High | Fresh image import/model-load/transcription test without it. |
| `pyannote.audio` | `3.1.1` | No | None in transcription; belongs to diarization worker | Very high | No apparent need | High | Fresh image import/model-load/transcription test without it. |
| `noisereduce` | unpinned | Yes, `nr.reduce_noise` | Scientific/audio stack | Moderate | Yes for current output path | Do not remove | Audio preprocessing and transcript comparison. |

## 16. Proposed Minimal Requirements

Do not edit `requirements.txt` until approved and validated.

### Confirmed Required

```text
transformers==4.52.4
torch==2.6.0
librosa==0.10.1
soundfile==0.12.1
redis==5.0.1
requests==2.31.0
numpy==1.26.4
noisereduce
```

`soundfile` and `numpy` are not directly imported but are required by the current audio/scientific stack in practice.

### Probably Removable

```text
datasets
pyannote.audio==3.1.1
accelerate
```

`pyannote.audio` is the strongest removal candidate because the transcription worker does not perform diarization. `datasets` is also a strong candidate. `accelerate` is likely removable because current loading does not use `device_map`, `low_cpu_mem_usage`, or accelerate APIs, but this needs a model-load check.

### Requires Runtime Verification

```text
torchaudio==2.6.0
sentencepiece
protobuf
```

`torchaudio` is not imported but may be pulled or expected by some audio/model stacks. `sentencepiece` and `protobuf` may be tokenizer/processor support dependencies depending on the exact model files.

## 17. Dockerfile Audit

| Topic | Finding | Recommendation |
| --- | --- | --- |
| Base image | `python:3.10-slim` is small and CPU-compatible, but not explicitly CUDA/GPU-ready. | Keep for CPU/static baseline; use separate GPU image or override later. |
| Build stages | Single-stage only. | Multi-stage is less useful for pure pip runtime unless compiling wheels; focus first on removing unused packages and cache strategy. |
| Copied files | `COPY . .` copies the entire `gradio/transcription` context. Currently tiny. | Add `.dockerignore` to prevent future model/cache/checkpoint inclusion. |
| Pip cache | Uses `--no-cache-dir`; good. | Keep. |
| Layer ordering | Requirements copied and installed before source; good for build cache. | Keep. |
| OS packages | No OS packages installed. | Good for size, but verify audio decoding requirements in fresh builds. |
| Reproducibility | Several packages are unpinned: `accelerate`, `sentencepiece`, `protobuf`, `datasets`, `noisereduce`. | Pin direct dependencies after validation, or use constraints/lock file. |
| Model files | Dockerfile does not download/copy model files, but no `.dockerignore` protects future accidental cache/checkpoint copies. | Add `.dockerignore`; keep model download out of normal build. |
| CPU/GPU split | Current image can run CPU but Compose does not request GPU. | Use CPU baseline for validation and GPU-specific Dockerfile/Compose override for rented GPU. |

## 18. Proposed Docker Strategy

| Step | Recommendation | Likely image-size effect | Startup effect | Risk | Validation needed | Could output change? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Create a clean CPU-compatible baseline image from `python:3.10-slim` with only confirmed/minimal dependencies. | Large reduction if `pyannote.audio`, `datasets`, and possibly `accelerate` are removed. | Similar startup unless model cache changes. | Medium due indirect deps. | Fresh build, import test, model-load test, one known transcription. | No if dependency removals are truly unused. |
| 2 | Add GPU-specific Dockerfile or Compose override for rented GPU deployment. | May increase image size if CUDA runtime is included explicitly. | Better runtime performance; possibly slower image pull. | Medium/high due CUDA compatibility. | `torch.cuda.is_available()` inside container, short transcription, VRAM monitoring. | No if dtype/inference settings unchanged. |
| 3 | Add explicit Hugging Face/model-cache volume. | Moves model cache from container writable layer to persistent volume; image unchanged. | Faster restart; avoids repeated downloads. | Low/medium; cache invalidation must be understood. | Start with prewarmed cache and verify no redownload. | No. |
| 4 | Make model path and revision explicit via env while preserving default behavior initially. | No direct size change. | More predictable startup. | Medium if model revision/path changes. | Verify exact revision and transcript comparison. | Could change if revision/path changes; pin current revision first. |
| 5 | Add `.dockerignore` for caches/models/checkpoints/temp outputs. | Prevents accidental huge contexts/layers. | Faster build context send. | Low. | Build context check. | No. |
| 6 | Pin or lock dependencies after minimal set is validated. | No direct size change, but avoids drift. | More reproducible install. | Low/medium. | Fresh build from empty cache. | No if versions unchanged. |
| 7 | Keep model download out of ordinary image build unless making a deliberately tagged demo image. | Keeps normal image smaller. Demo image would be larger. | Normal build faster; runtime needs cache. | Low. | Startup with cache and offline behavior check if desired. | No if same model files. |

## 19. Recommended Implementation Order

1. Do not change Dockerfiles or requirements until this report is reviewed.
2. In an approved cleanup stage, remove the dead broken diarization container or otherwise resolve its metadata issue, then rerun `docker system df -v`.
3. In the same approved cleanup stage, prune BuildKit cache if the user accepts slower future builds.
4. Add a persistent HF cache volume strategy for transcription before removing/recreating the current transcription container.
5. Add `.dockerignore` protection.
6. Remove `pyannote.audio` and `datasets` from a branch/test image first, then validate import/model load/transcription output.
7. Test removal of `accelerate`, then `torchaudio`, then only consider `sentencepiece`/`protobuf` after tokenizer/processor checks.
8. Create CPU baseline and GPU override strategy separately.
9. After cleanup and verification, compact the VHDX only with explicit user approval.

## 20. Decision Gate

Stop here. No cleanup or implementation should happen until the user approves the next stage.

Key decision points:

1. Is it acceptable to remove the dead `transcript_gradio_diarization` container to restore Docker accounting?
2. Is it acceptable to prune `14.36GB` of BuildKit cache?
3. Should the current transcription container's `1.94GB` HF cache be preserved by moving to an explicit cache volume before container recreation?
4. Should `pyannote.audio` and `datasets` be removed first in a validation branch/image?
5. Should dev/mock/analysis and Backstep images/volumes be preserved or cleaned after user review?
