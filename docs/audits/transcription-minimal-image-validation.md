# Transcription Minimal Image Validation

Date: 2026-07-14. Scope: validation of `transcript-app-gradio_transcription:minimal-test` only. The existing `transcript_gradio_transcription` worker was not stopped, recreated, replaced, or removed. No Redis queue, Qdrant data, MinIO data, production model cache, image, or volume was removed. No Docker Compose stack startup, VHDX compaction, broad Docker cleanup, Qdrant write, MinIO write, or Redis queue push was performed.

## Required Context Read

Read before validation:

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Project operating constraints and architecture notes. |
| `ARCHITECTURE.md` | Current service/worker topology. |
| `docs/audits/transcription-worker-audit.md` | Transcription dependency and runtime risks. |
| `docs/audits/transcription-stage1-implementation.md` | Preserved model/audio/queue behavior. |
| `docs/audits/docker-disk-and-transcription-image-audit.md` | Docker disk and model-cache findings. |
| `docs/audits/docker-cleanup-and-image-preparation.md` | Prior cleanup, minimal image, and cache-copy context. |

Inspected before validation:

| File | Notes |
| --- | --- |
| `gradio/transcription/Dockerfile` | Existing file modified earlier to support `ARG REQUIREMENTS_FILE=requirements.txt`; default Compose behavior preserved. |
| `gradio/transcription/requirements.txt` | Active requirements still include `datasets` and `pyannote.audio`. |
| `gradio/transcription/requirements.minimal.txt` | Minimal-test requirements remove only `datasets` and `pyannote.audio`. |
| `gradio/transcription/transcription.py` | Still loads model at import time and starts only under `if __name__ == "__main__"`; validation script must not import it. |
| `compose.yml` | Current worker definition includes future `HF_HOME` and `transcription_hf_cache` volume but the running container has not been recreated. |

## Current State Recorded

Commands run:

```powershell
docker image inspect transcript-app-gradio_transcription:minimal-test
docker inspect transcript_gradio_transcription
docker stats transcript_gradio_transcription --no-stream
docker volume ls
```

Summary:

| Item | Value |
| --- | --- |
| Minimal image digest | `sha256:c496eb9f3b3228652fabca26e4a6a70c7cde789fe445d480d25b0bf6f7615c47` |
| Minimal image raw inspect size before run attempts | `3,366,186,001` bytes |
| Current worker container | `transcript_gradio_transcription` / `2779752652fe` |
| Current worker state | `running=true`, status `running` |
| Current worker image ID | `sha256:a16cce6e8e5cb5fd8a790f21c005e689f2d9b0e50633aa16f3d885e992b1d313` |
| Current worker stats | `0.00%` CPU, `339.3MiB / 3.701GiB` memory during check |
| Current worker writable layer | `1.94GB`, virtual `8.68GB` |

The current container was not recreated during this stage.

## BuildKit Prune

The user explicitly requested:

```powershell
docker builder prune -f
```

Result:

```text
Total: 0B
```

No broad Docker cleanup was run.

## Isolated Cache Copy

Validation volume created:

```powershell
docker volume create transcript-app_hf_cache_validation
```

Result:

```text
transcript-app_hf_cache_validation
```

The source cache was copied by a tar stream that preserved Linux symlinks:

```powershell
cmd /c "docker exec transcript_gradio_transcription tar -C /root/.cache -cf - huggingface | docker run --rm -i -v transcript-app_hf_cache_validation:/root/.cache python:3.10-slim tar -C /root/.cache -xf -"
```

The source path was read only by `tar`; the source cache was not deleted or modified.

Copied cache verification:

| Item | Value |
| --- | --- |
| Validation volume | `transcript-app_hf_cache_validation` |
| Copied cache path | `/root/.cache/huggingface` |
| Copied cache size | `1.9G` |
| Model cache path | `/root/.cache/huggingface/hub/models--Devion333--whisper-small-dv-syn` |
| `refs/main` | `a3808e270194b7068711332c23b35cbe5e96fad4` |
| `refs/refs/pr/1` | `2f5ef2abc8e364e011568d44bc20dda56af2e086` |

Snapshots present:

```text
2f5ef2abc8e364e011568d44bc20dda56af2e086
a3808e270194b7068711332c23b35cbe5e96fad4
```

Symlinks were verified in the copied volume, including:

```text
snapshots/a3808e270194b7068711332c23b35cbe5e96fad4/pytorch_model.bin -> ../../blobs/8e629b8f40dc5eb136cb147ec2345dea8378005f44cd01e93458f66e18e82b9a
snapshots/2f5ef2abc8e364e011568d44bc20dda56af2e086/model.safetensors -> ../../blobs/ed13ef26c29f4bcde846903d760aa5f99dda5bf381047ba16c665d4f97cfcfac
```

## Validation Script

Created `gradio/transcription/validate_minimal_image.py`.

The script intentionally does not import `transcription.py`, does not connect to Redis, Qdrant, MinIO, or Dagster, and does not start `worker_loop()`.

It preserves the active inference path for standalone validation:

| Setting | Value |
| --- | --- |
| Model path | `Devion333/whisper-small-dv-syn` |
| Processor/model classes | `WhisperProcessor`, `WhisperForConditionalGeneration` |
| Offline load | `local_files_only=True` |
| Audio load | `librosa.load(..., sr=16000)` |
| Noise reduction | `noisereduce.reduce_noise(y=audio, sr=sr)` |
| Language prompt | `language="si"` |
| Generation | `do_sample=False`, `temperature=0.0`, `num_beams=1`, `max_new_tokens=444` |

## Audio Fixture

No safe existing repository audio fixture was found with:

```text
**/*.{wav,mp3,m4a,flac,ogg}
```

Created a local synthetic speech fixture without downloading anything:

```text
gradio/transcription/fixtures/synthetic_speech_hello.wav
```

The fixture was generated with Windows speech synthesis using the phrase:

```text
hello transcription validation
```

The fixture was not used for model inference because validation failed earlier at minimal-image startup.

## Import Validation

Attempted isolated import validation with networking disabled:

```powershell
docker run --rm --network none transcript-app-gradio_transcription:minimal-test python -c "import torch, torchaudio, transformers, librosa, soundfile, noisereduce, redis, requests, numpy, accelerate, sentencepiece, google.protobuf; print('imports ok'); print('torch', torch.__version__); print('torchaudio', torchaudio.__version__); print('transformers', transformers.__version__); print('cuda_available', torch.cuda.is_available())"
```

Results:

| Attempt | Timeout | Result |
| --- | ---: | --- |
| First import attempt | `120000ms` | Timed out with no output. |
| Second import attempt | `600000ms` | Timed out with no output. |

No import success, package version, CUDA availability, shared-library warning, or missing-dependency result was produced because the command never reached Python output.

## Minimal Image Startup Probe

To distinguish import slowness from image startup failure, a simple Python command was tried:

```powershell
docker run --rm --network none transcript-app-gradio_transcription:minimal-test python -c "print('python ok')"
```

Result: timed out after `180000ms` with no output.

A shell-only probe was then tried:

```powershell
docker run --rm --network none --entrypoint /bin/sh transcript-app-gradio_transcription:minimal-test -c "echo shell ok"
```

Result: timed out after `1800000ms` with no output.

This means the minimal image did not reach command execution within 30 minutes.

Docker could still start the existing latest image immediately:

```powershell
docker run --rm --network none --entrypoint /bin/sh transcript-app-gradio_transcription:latest -c "echo latest shell ok"
```

Result:

```text
latest shell ok
```

Conclusion: Docker runtime was functional; the blocker is specific to `transcript-app-gradio_transcription:minimal-test` startup/unpack state.

## Offline Model Load Result

Not run.

Reason: stopped at the safety gate because the minimal image could not start `/bin/sh` within 30 minutes. Running model load would not be meaningful until the image can start a basic command.

## Controlled Transcription Result

Not run.

Reason: stopped at the safety gate before import/model-load validation.

## Baseline Comparison

Not run.

Reason: minimal-image runtime did not start. The baseline image was only used for the isolated shell probe above to confirm Docker could start `latest`.

## Post-Failure Docker State

The timed-out `docker run --rm` attempts left two created temporary containers from the minimal image because the Docker CLI was killed before cleanup completed. They were not removed due the instruction not to remove containers.

| Container | Image | Status | Size |
| --- | --- | --- | ---: |
| `inspiring_poincare` / `a7cb2d579e29` | `transcript-app-gradio_transcription:minimal-test` | `Created` | `4.1kB`, virtual `6.38GB` |
| `serene_saha` / `898e75360144` | `transcript-app-gradio_transcription:minimal-test` | `Created` | `4.1kB`, virtual `6.38GB` |

The production/current worker remained unchanged:

| Container | State | Image | Size |
| --- | --- | --- | ---: |
| `transcript_gradio_transcription` / `2779752652fe` | `Up` | `sha256:a16cce6e8e5c...` | `1.94GB`, virtual `8.68GB` |

Image listing after run attempts:

| Image | Tag | Digest | Displayed size |
| --- | --- | --- | ---: |
| `transcript-app-gradio_transcription` | `minimal-test` | `sha256:c496eb9f3b3228652fabca26e4a6a70c7cde789fe445d480d25b0bf6f7615c47` | `9.75GB` |
| `transcript-app-gradio_transcription` | `latest` | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` | `10.2GB` |

Docker accounting after run attempts:

| Type | Total | Active | Size | Reclaimable |
| --- | ---: | ---: | ---: | ---: |
| Images | `15` | `7` | `46.28GB` | `6.5GB (14%)` |
| Containers | `8` | `2` | `2.214GB` | `272.9MB (12%)` |
| Local Volumes | `27` | `5` | `2.434GB` | `48.23MB (1%)` |
| Build Cache | `39` | `0` | `11.53GB` | `0B` |

## Static Validation Commands

Requested validation commands were run:

```powershell
python -m py_compile gradio/transcription/validate_minimal_image.py
docker compose config --quiet
```

Both passed with no output.

## Pass/Fail Decision

Fail.

Reason: `transcript-app-gradio_transcription:minimal-test` could not start even `/bin/sh -c "echo shell ok"` within 30 minutes. Therefore package imports, offline model load, controlled transcription, and baseline comparison could not be safely performed.

No missing Python dependency was identified because Python command execution was never reached.

## Recommended Next Step

Investigate or rebuild the minimal image in a controlled follow-up stage before any dependency-file promotion or Compose migration.

Smallest next action options:

1. Inspect the two `Created` minimal-test containers and Docker Desktop/containerd state without removing anything.
2. If approved, remove only the two failed temporary `minimal-test` containers, then rebuild `minimal-test` with plain Docker output and wait for a fully completed export/unpack.
3. If rebuild succeeds, rerun this validation from import test onward using `transcript-app_hf_cache_validation`.

Do not retag, replace, or recreate `transcript_gradio_transcription` until a minimal image can start, import, load offline, and match baseline transcription output.

## Second Attempt: Cleanup, Rebuild, Startup Gates

Date: 2026-07-14. Scope: remove only failed validation artifacts, rebuild `minimal-test`, and rerun validation until the first required stop condition. The existing `transcript_gradio_transcription` worker was not stopped, recreated, replaced, or modified.

### Pre-Removal Checks

The four failed validation containers were inspected before removal:

```powershell
docker inspect confident_nash quirky_mclaren inspiring_poincare serene_saha --format "Name={{.Name}} Image={{.Config.Image}} Status={{.State.Status}} Mounts={{json .Mounts}}"
```

Result:

```text
Name=/confident_nash Image=transcript-app-gradio_transcription:minimal-test Status=created Mounts=[]
Name=/quirky_mclaren Image=transcript-app-gradio_transcription:minimal-test Status=created Mounts=[]
Name=/inspiring_poincare Image=transcript-app-gradio_transcription:minimal-test Status=created Mounts=[]
Name=/serene_saha Image=transcript-app-gradio_transcription:minimal-test Status=created Mounts=[]
```

All four were created from the failed `minimal-test` image, were not running, and had no mounts.

Removed exactly these containers:

```powershell
docker rm -f confident_nash quirky_mclaren inspiring_poincare serene_saha
```

Result:

```text
confident_nash
quirky_mclaren
inspiring_poincare
serene_saha
```

Removed only the failed test image:

```powershell
docker image rm transcript-app-gradio_transcription:minimal-test
```

Result:

```text
Untagged: transcript-app-gradio_transcription:minimal-test
Deleted: sha256:c496eb9f3b3228652fabca26e4a6a70c7cde789fe445d480d25b0bf6f7615c47
```

### Controlled Rebuild

Rebuild command:

```powershell
docker build --progress=plain --build-arg REQUIREMENTS_FILE=requirements.minimal.txt -t transcript-app-gradio_transcription:minimal-test gradio/transcription
```

The build fully completed, including image unpack:

```text
#10 exporting to image
#10 exporting layers 1072.1s done
#10 exporting manifest sha256:879ed1fc5a490fd7f4c366b8a382053d6977123fef3820e89be23ad07b27516c 0.1s done
#10 exporting config sha256:704a57559a3fcc9226656edeaf68cc13bdf3f8c03eab6973de604a2446631a8c 0.0s done
#10 exporting attestation manifest sha256:208b16d806a6a34846d22bbd28775c8b9fac88200e1f2eb41666d0bd9fd04e9a 0.1s done
#10 exporting manifest list sha256:204c9ea321be14465785f55428a886bb326fdfbf0a6416c11a0c80a9489dfcc8 0.1s done
#10 naming to docker.io/library/transcript-app-gradio_transcription:minimal-test 0.1s done
#10 unpacking to docker.io/library/transcript-app-gradio_transcription:minimal-test 860.6s done
#10 DONE 1934.0s
```

Rebuilt image:

| Field | Value |
| --- | --- |
| Image | `transcript-app-gradio_transcription:minimal-test` |
| Image ID / digest | `sha256:204c9ea321be14465785f55428a886bb326fdfbf0a6416c11a0c80a9489dfcc8` |
| Config digest | `sha256:704a57559a3fcc9226656edeaf68cc13bdf3f8c03eab6973de604a2446631a8c` |
| Created | `2026-07-14T15:02:14.363567362Z` |
| Inspect size | `3,366,256,595` bytes |
| Docker CLI displayed size | `9.75GB` |

### Startup Gates

Shell gate:

```powershell
docker run --rm --network none transcript-app-gradio_transcription:minimal-test /bin/sh -c "echo shell ok"
```

Result:

```text
shell ok
```

Python gate:

```powershell
docker run --rm --network none transcript-app-gradio_transcription:minimal-test python -c "print('python ok')"
```

Result:

```text
python ok
```

Import gate:

```powershell
docker run --rm --network none transcript-app-gradio_transcription:minimal-test python -c "import torch, torchaudio, transformers, librosa, soundfile, noisereduce, redis, requests, numpy, accelerate, sentencepiece, google.protobuf; print('imports ok'); print('torch', torch.__version__); print('torchaudio', torchaudio.__version__); print('transformers', transformers.__version__); print('cuda', torch.cuda.is_available())"
```

Result:

```text
imports ok
torch 2.6.0+cu124
torchaudio 2.6.0+cu124
transformers 4.52.4
cuda False
```

### Offline Model Load

Command run with no network and the validation cache volume mounted at the requested target path:

```powershell
docker run --rm --network none -e HF_HOME=/root/.cache/huggingface -e TRANSFORMERS_OFFLINE=1 -e HF_HUB_OFFLINE=1 -v transcript-app_hf_cache_validation:/root/.cache/huggingface transcript-app-gradio_transcription:minimal-test python validate_minimal_image.py --mode load
```

Result: failed before model load completed.

Key error:

```text
huggingface_hub.errors.LocalEntryNotFoundError: Cannot find the requested files in the disk cache and outgoing traffic has been disabled.
OSError: We couldn't connect to 'https://huggingface.co' to load the files, and couldn't find them in the cached files.
```

Read-only cache-layout check showed the validation volume contains a nested `huggingface` directory at its root:

```text
/mnt/cache
/mnt/cache/huggingface
/mnt/cache/huggingface/hub
/mnt/cache/huggingface/hub/models--Devion333--whisper-small-dv-syn
```

Therefore, mounting `transcript-app_hf_cache_validation` to `/root/.cache/huggingface` creates this effective path inside the validation container:

```text
/root/.cache/huggingface/huggingface/hub/models--Devion333--whisper-small-dv-syn
```

Transformers expects:

```text
/root/.cache/huggingface/hub/models--Devion333--whisper-small-dv-syn
```

This is a validation-volume layout issue, not an identified missing Python dependency. Per instruction, validation stopped at model-load failure. Controlled transcription and baseline comparison were not run.

### Second Attempt Decision

Fail.

Startup and import validation passed, but offline model load failed because the existing validation cache volume is nested one directory deeper than the requested mount target expects.

Recommended next step: approve a validation-cache layout correction only, either by recreating/repopulating `transcript-app_hf_cache_validation` so its root contains `hub/` and `xet/`, or by mounting the existing volume at `/root/.cache` instead of `/root/.cache/huggingface`. Do not promote `requirements.minimal.txt` or recreate `transcript_gradio_transcription` until offline model load and transcript comparison pass.

## Third Attempt: Corrected Validation Cache and Comparison

Date: 2026-07-14. Scope: correct only the disposable validation cache volume layout and rerun validation from offline model load onward. No image rebuild was performed. The production transcription container, production cache, Redis, Qdrant, MinIO, queues, and protected volumes were not modified.

### Reason for Cache-Layout Correction

The previous validation volume root contained:

```text
huggingface/hub/
huggingface/xet/
```

When mounted as `transcript-app_hf_cache_validation:/root/.cache/huggingface`, Transformers saw:

```text
/root/.cache/huggingface/huggingface/hub/...
```

The expected `HF_HOME=/root/.cache/huggingface` layout is:

```text
/root/.cache/huggingface/hub/...
/root/.cache/huggingface/xet/...
```

### Pre-Correction Verification

The validation volume was inspected read-only:

```text
top-level
huggingface
size
1.9G /mnt/cache
refs
a3808e270194b7068711332c23b35cbe5e96fad4
2f5ef2abc8e364e011568d44bc20dda56af2e086
snapshots
2f5ef2abc8e364e011568d44bc20dda56af2e086
a3808e270194b7068711332c23b35cbe5e96fad4
```

The source production cache was inspected read-only:

```text
source-size
1.9G /root/.cache/huggingface
source-top
hub
xet
refs
a3808e270194b7068711332c23b35cbe5e96fad4
2f5ef2abc8e364e011568d44bc20dda56af2e086
```

No existing container mounted `transcript-app_hf_cache_validation`; production containers mounted only their existing production volumes/binds.

### Volume Recreation

Only the disposable validation volume was removed and recreated:

```powershell
docker volume rm transcript-app_hf_cache_validation
docker volume create transcript-app_hf_cache_validation
```

Results:

```text
transcript-app_hf_cache_validation
transcript-app_hf_cache_validation
```

The contents of the production cache root were copied into the validation volume root, preserving symlinks:

```powershell
cmd /c "docker exec transcript_gradio_transcription tar -C /root/.cache/huggingface -cf - . | docker run --rm -i -v transcript-app_hf_cache_validation:/root/.cache/huggingface python:3.10-slim tar -C /root/.cache/huggingface -xf -"
```

This copied `hub/` and `xet/` directly, not the parent `huggingface/` directory.

### Corrected Layout Verification

Mounted at `/root/.cache/huggingface`, the validation volume now has:

```text
top-level
hub
xet
size
1.9G /root/.cache/huggingface
```

Refs:

| Ref | Value |
| --- | --- |
| `refs/main` | `a3808e270194b7068711332c23b35cbe5e96fad4` |
| `refs/refs/pr/1` | `2f5ef2abc8e364e011568d44bc20dda56af2e086` |

Snapshots:

```text
2f5ef2abc8e364e011568d44bc20dda56af2e086
a3808e270194b7068711332c23b35cbe5e96fad4
```

Largest blobs remained present:

| Blob | Size |
| --- | ---: |
| `8e629b8f40dc5eb136cb147ec2345dea8378005f44cd01e93458f66e18e82b9a` | `967,103,455` bytes |
| `ed13ef26c29f4bcde846903d760aa5f99dda5bf381047ba16c665d4f97cfcfac` | `966,995,080` bytes |

Symlinks were verified, including:

```text
snapshots/a3808e270194b7068711332c23b35cbe5e96fad4/pytorch_model.bin -> ../../blobs/8e629b8f40dc5eb136cb147ec2345dea8378005f44cd01e93458f66e18e82b9a
snapshots/2f5ef2abc8e364e011568d44bc20dda56af2e086/model.safetensors -> ../../blobs/ed13ef26c29f4bcde846903d760aa5f99dda5bf381047ba16c665d4f97cfcfac
```

### Offline Model Load

Command:

```powershell
docker run --rm --network none -e HF_HOME=/root/.cache/huggingface -e TRANSFORMERS_OFFLINE=1 -e HF_HUB_OFFLINE=1 -v transcript-app_hf_cache_validation:/root/.cache/huggingface transcript-app-gradio_transcription:minimal-test python validate_minimal_image.py --mode load
```

Result:

```text
model_path=Devion333/whisper-small-dv-syn
revision=a3808e270194b7068711332c23b35cbe5e96fad4
device=cpu
torch_cuda_is_available=False
load_elapsed_seconds=35.710
python_peak_memory_bytes=38426996
```

Offline model load passed. Network was disabled with `--network none`; no Hugging Face download was possible.

### Package Versions

Both images reported the same runtime package versions:

| Image | torch | torchaudio | transformers | CUDA available |
| --- | --- | --- | --- | --- |
| `transcript-app-gradio_transcription:latest` | `2.6.0+cu124` | `2.6.0+cu124` | `4.52.4` | `False` |
| `transcript-app-gradio_transcription:minimal-test` | `2.6.0+cu124` | `2.6.0+cu124` | `4.52.4` | `False` |

Image IDs:

| Image | ID |
| --- | --- |
| `transcript-app-gradio_transcription:latest` | `sha256:7d6f14ba1df7cb0649dd26ba392e24c0f7ad69ae7c3f1cf32d6e7212e30f3a9d` |
| `transcript-app-gradio_transcription:minimal-test` | `sha256:204c9ea321be14465785f55428a886bb326fdfbf0a6416c11a0c80a9489dfcc8` |

### Load Timing Comparison

Both images used the same corrected validation cache, offline mode, CPU device, model path, and model revision.

| Image | Revision | Device | Load time | Python peak memory |
| --- | --- | --- | ---: | ---: |
| `latest` | `a3808e270194b7068711332c23b35cbe5e96fad4` | `cpu` | `20.900s` | `38,413,524` bytes |
| `minimal-test` | `a3808e270194b7068711332c23b35cbe5e96fad4` | `cpu` | `28.361s` | `38,426,921` bytes |

### Controlled Transcription Comparison

Fixture:

```text
gradio/transcription/fixtures/synthetic_speech_hello.wav
```

Both runs used:

| Setting | Value |
| --- | --- |
| Network | `--network none` |
| HF env | `HF_HOME=/root/.cache/huggingface`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_OFFLINE=1` |
| Cache mount | `transcript-app_hf_cache_validation:/root/.cache/huggingface` |
| Audio load | `librosa.load(..., sr=16000)` |
| Noise reduction | `noisereduce.reduce_noise(y=audio, sr=sr)` |
| Language | `si` |
| Generation | `do_sample=False`, `temperature=0.0`, `num_beams=1`, `max_new_tokens=444` |
| Worker loop | Not started |
| Redis/Qdrant/MinIO/Dagster | Not connected |

Baseline `latest` output:

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
elapsed_inference_seconds=107.439
python_peak_memory_bytes=103850420
```

Minimal `minimal-test` output:

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
elapsed_inference_seconds=107.848
python_peak_memory_bytes=99136269
```

Warnings appeared in both images:

```text
You have passed task=transcribe, but also have set `forced_decoder_ids` to [(1, 50322), (2, 50363)] which creates a conflict. `forced_decoder_ids` will be ignored in favor of task=transcribe.
The attention mask is not set and cannot be inferred from input because pad token is same as eos token. As a consequence, you may observe unexpected behavior. Please pass your input's `attention_mask` to obtain reliable results.
```

These warnings are equivalent between images and do not indicate a minimal-image-only regression.

### Output Comparison

| Field | `latest` | `minimal-test` | Match |
| --- | --- | --- | --- |
| Revision | `a3808e270194b7068711332c23b35cbe5e96fad4` | `a3808e270194b7068711332c23b35cbe5e96fad4` | Yes |
| Duration | `2.759s` | `2.759s` | Yes |
| Device | `cpu` | `cpu` | Yes |
| Transcription | `ހެލޯ ޓްރެންސްގްރިޕްޝިން ވަލަޑޭޝަން` | `ހެލޯ ޓްރެންސްގްރިޕްޝިން ވަލަޑޭޝަން` | Yes |
| Output length | `34` | `34` | Yes |
| Inference time | `107.439s` | `107.848s` | Comparable |
| Warnings | Same | Same | Yes |

### Third Attempt Decision

Pass.

The corrected validation cache allowed offline model load. The minimal image imported required runtime packages, loaded the same cached revision offline, ran the same preprocessing/inference path, and produced output exactly matching the current `latest` image on the controlled synthetic fixture.

### Recommended Migration Step

In a later approved stage, promote `requirements.minimal.txt` into the active transcription build path and plan a controlled Compose migration using a persistent Hugging Face cache volume whose root contains `hub/` and `xet/`. Do not recreate `transcript_gradio_transcription` until the persistent production cache volume is pre-populated and verified with the same offline load check.

## Unchanged Production Data Confirmation

Confirmed unchanged or untouched in this stage:

| Item | Confirmation |
| --- | --- |
| Existing transcription worker | `transcript_gradio_transcription` remains running and was not recreated. |
| Source Hugging Face cache | Read by tar only; not deleted or modified. |
| Redis queues | No queue push/pop command was run. |
| Qdrant data | No Qdrant write command was run. |
| MinIO data | No MinIO write/delete command was run. |
| Production volumes | No existing production volume was removed. |
| Images | No image was removed. |
| VHDX | No compaction or VHDX operation was run. |
