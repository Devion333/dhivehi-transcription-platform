# Transcription Worker Audit

Audit date: 2026-07-14. Scope: dedicated read-only audit of `gradio/transcription/` and directly related pipeline contracts. No worker, model, Docker build, Docker Compose stack, model download, package download, GPU workload, Docker prune, runtime data mutation, or application code change was performed.

## Evidence Sources

Required documents read in full:

| File | Purpose in audit |
| --- | --- |
| `AGENTS.md` | Operator notes and known architecture conventions. |
| `ARCHITECTURE.md` | Current authoritative architecture inventory. |
| `docs/audits/system-inventory.md` | Detailed prior source inventory and known risks. |

Source inspected:

| File | Purpose in audit |
| --- | --- |
| `gradio/transcription/Dockerfile` | Transcription image build. |
| `gradio/transcription/requirements.txt` | Python dependencies. |
| `gradio/transcription/transcription.py` | Worker lifecycle, model loading, audio processing, Redis, Qdrant. |
| `compose.yml` | Production-style service definition, mounts, env, GPU config. |
| `compose.dev.yml` | Development topology and mock replacement. |
| `gradio/diarization/diarization.py` | Producer of transcription jobs and Qdrant segment schema. |
| `gradio/diarization/requirements.txt` | Dependency overlap. |
| `gradio/convert/convert.py` | Upstream MinIO URL behavior. |
| `mock_workers/mock_diarization.py` | Mock transcription job shape and segment schema. |
| `mock_workers/mock_transcription.py` | Mock completion semantics. |
| `mock_workers/qdrant_helpers.py` | Shared mock Qdrant update pattern. |

Confirmed repository fact: `gradio/transcription/` contains only `Dockerfile`, `requirements.txt`, and `transcription.py`. No `.dockerignore` file exists anywhere in the repository.

## Executive Summary

The transcription worker is difficult to run locally because it combines a large PyTorch/Transformers image, runtime Hugging Face model loading, repeated full-audio downloads and full-file decoding for every segment, optional CPU fallback that is likely too slow for demonstrations, and no Docker GPU configuration. The active Compose mount `/data/911/911_whisper_model:/app/models` is not used by the active code because `model_path` is set to `Devion333/whisper-small-dv-syn`.

The largest likely image contributors are `torch`, `torchaudio`, `pyannote.audio` and its ML stack, `datasets`, `transformers`, `librosa`/audio-native dependencies, and runtime Hugging Face model caches. `pyannote.audio` and `datasets` appear unnecessary for the current transcription source.

The current image is not genuinely GPU-ready as a deployment unit. The code can use CUDA if PyTorch sees it, but the base image is `python:3.10-slim`, Compose requests no NVIDIA device, no NVIDIA environment variables are set, and the PyTorch installation source is not explicit about CUDA runtime compatibility.

The highest-risk correctness issue in the transcription worker is parent completion logic: it scrolls only 100 points, omits a `type=segment` filter, treats an empty result as complete because `all([])` is true, and only checks the subset returned by a single unpaginated query. This can mark a parent complete incorrectly or fail for larger transcripts.

## 1. Current Worker Execution Flow

### Process Startup

Confirmed behavior:

1. Docker runs `python -u transcription.py` from `/app` (`gradio/transcription/Dockerfile:10`).
2. Python imports standard modules, `requests`, `redis`, `torch`, `transformers`, `librosa`, `tempfile`, and `noisereduce` (`gradio/transcription/transcription.py:1-11`).
3. Import-time code immediately creates Redis client configuration and loads the model before entering `worker_loop` (`transcription.py:16-77`, `297-380`).

Assumption:

The service fails and restarts under Compose if model loading raises an unhandled exception, because model loading occurs before `worker_loop()` and is not wrapped by the outer worker-loop exception handler. Compose uses `restart: on-failure:5` (`compose.yml:76-80`).

### Dependency Initialization

Redis connection object:

`REDIS_HOST` defaults to `redis`, `REDIS_PORT` defaults to `6379`, and `redis.Redis(host=..., port=..., db=0)` is created at import time (`transcription.py:16-19`). No `ping()` is performed.

Qdrant configuration:

`QDRANT_HOST` defaults to `http://qdrant:6333`; `QDRANT_COLLECTION` defaults to `file_metadata` (`transcription.py:21-23`).

MinIO credentials:

`MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are read but are not used in the transcription source (`transcription.py:25-27`). Audio download uses `requests.get(minio_url)`, not MinIO SDK authentication.

Dagster event configuration:

`DAGSTER_ENABLED` and `DAGSTER_API_URL` are read, and `log_dagster_event()` posts to `{DAGSTER_API_URL}/events` if enabled (`transcription.py:29-48`). The current Dagster definitions inspected do not expose a matching custom `/events` endpoint, so these event posts are best-effort and failures are swallowed.

### Device Selection

Confirmed behavior:

The code sets `device = "cuda" if torch.cuda.is_available() else "cpu"`, then moves the model with `model.to(device)` (`transcription.py:74-77`).

Assumptions:

CUDA visibility depends on the container having a CUDA-compatible PyTorch wheel, the NVIDIA driver, NVIDIA Container Toolkit, and a Compose/runtime GPU device request. Compose currently supplies none of the GPU runtime configuration.

### Model and Processor Loading

Confirmed behavior:

1. Active `model_path` is `Devion333/whisper-small-dv-syn` (`transcription.py:55-58`).
2. Commented local path is `#model_path = "/app/models/checkpoint-3000"` (`transcription.py:56-57`).
3. The worker first tries `AutoProcessor.from_pretrained(model_path, use_fast=False)` and `AutoModelForSpeechSeq2Seq.from_pretrained(model_path)` (`transcription.py:60-64`).
4. On any exception, it falls back to `WhisperProcessor.from_pretrained(model_path, use_fast=False)` and `WhisperForConditionalGeneration.from_pretrained(model_path)` (`transcription.py:65-70`).
5. `model.eval()` is called (`transcription.py:72`).
6. Model loading happens once per process, not per job.

Assumptions:

If the Hugging Face model snapshot is not already cached inside the container or mounted cache path, `from_pretrained` will attempt network access at startup. No `local_files_only=True`, revision pin, or explicit cache directory is configured.

### Hugging Face Authentication or Cache Requirements

Confirmed behavior:

The transcription source does not read `HUGGINGFACE_ACCESS_TOKEN`, `HF_HOME`, `TRANSFORMERS_CACHE`, `HF_HUB_CACHE`, or `local_files_only`. It relies on Transformers defaults and any environment variables in `.env` indirectly loaded by Compose (`compose.yml:80-81`).

Assumption:

The active model may be public if it downloads without a token, but that is not confirmed by source. If private or gated, startup requires a token available through Hugging Face standard environment/config mechanisms.

### Redis Connection and Queue Blocking Behavior

Confirmed behavior:

`worker_loop()` calls `r.blpop("transcription_queue", timeout=10)` inside an infinite loop (`transcription.py:297-308`). If no job arrives in 10 seconds, it continues.

Producer:

Real diarization pushes transcription jobs with `r.lpush("transcription_queue", job_json)` (`gradio/diarization/diarization.py:232-238`). Mock diarization uses the same queue (`mock_workers/mock_diarization.py:75-78`).

Queue ordering:

Producers use `LPUSH`; consumer uses `BLPOP`. With a single list, this consumes newest-pushed items first in LIFO order relative to multiple pushed segment jobs.

### Job Decoding

Confirmed behavior:

After pop, the worker JSON-decodes `job_data` and expects keys `segment_id`, `file_id`, `start_time`, `end_time`, `speaker`, and `minio_url` (`transcription.py:310-318`). Missing keys or malformed JSON are caught by the broad outer exception handler, logged, followed by `time.sleep(5)`, and the already-popped job is lost (`transcription.py:373-377`).

### Audio Download

Confirmed behavior:

`download_audio_segment(minio_url, start_time, end_time)` performs `requests.get(minio_url)` and `resp.raise_for_status()` (`transcription.py:90-95`). It downloads the entire source object for every segment job. It does not stream to disk, use range requests, use MinIO SDK, pass credentials, set a timeout, or reuse files across segments.

Upstream URL behavior:

Conversion forwards original audio URLs or writes converted WAV files to bucket `uploads` and constructs `http://{MINIO_ENDPOINT}/uploads/{file_id}_converted.wav` (`gradio/convert/convert.py:113-121`, `147-171`). Diarization places that same full-file `minio_url` into every transcription job (`gradio/diarization/diarization.py:207-214`).

### Temporary-File Handling

Confirmed behavior:

The worker writes the full downloaded response content into a `NamedTemporaryFile(delete=False, suffix='.wav')`, then stores `tmp_path` (`transcription.py:97-100`). On the success path, it deletes the temp file after `librosa.load` and denoising (`transcription.py:110-111`).

Bug:

If any exception occurs after the temp file is created and before `os.unlink(tmp_path)`, the temp file is not cleaned up because there is no `finally` block (`transcription.py:90-117`).

### Audio Loading

Confirmed behavior:

The worker calls `librosa.load(tmp_path, sr=16000)` (`transcription.py:102-103`). This decodes the entire audio file and resamples to 16 kHz for every segment.

Assumption:

If the input is already converted by `gradio/convert` to 16 kHz mono WAV, repeated resampling may be cheap or a no-op internally, but full-file decode still occurs per segment.

### Denoising

Confirmed behavior:

`audio = nr.reduce_noise(y=audio, sr=sr)` is applied to the full decoded audio before segment slicing (`transcription.py:103-108`).

Assumption:

`noisereduce` can be computationally significant on long audio because it processes the full waveform. The source does not configure stationary/non-stationary mode, chunking, or segment-only denoise.

### Segment Extraction

Confirmed behavior:

The worker computes `start_sample = int(start_time * sr)` and `end_sample = int(end_time * sr)`, then slices `segment_audio = audio[start_sample:end_sample]` (`transcription.py:105-108`). It does not validate negative times, end before start, end beyond audio length, or empty segments.

### Feature Preparation

Confirmed behavior:

`processor(audio, sampling_rate=sr, return_tensors="pt").input_features` creates Whisper input features, then `input_features.to(device)` transfers them to CPU/GPU (`transcription.py:124-126`). No attention mask is provided.

### Model Generation

Confirmed behavior:

The worker gets decoder prompts using `processor.get_decoder_prompt_ids(language="si")` (`transcription.py:128-130`). Generation runs under `torch.no_grad()` (`transcription.py:133-141`) with:

```python
do_sample=False
temperature=0.0
num_beams=1
max_new_tokens=444
forced_decoder_ids=forced_decoder_ids
```

No `task`, `return_timestamps`, `use_cache`, `attention_mask`, dtype, or precision options are set.

### Transcript Decoding

Confirmed behavior:

The worker decodes with `processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]` (`transcription.py:143`). It does not strip whitespace or normalize output before saving.

### Qdrant Segment Update

Confirmed behavior:

`update_segment_in_qdrant(segment_id, transcription)` hashes `segment_id` with djb2 (`transcription.py:83-88`, `152-155`). It fetches the point with `GET /collections/{collection}/points/{numeric_id}` (`transcription.py:158-170`), extracts existing `payload` and `vector`, merges `transcript_text`, `status=transcribed`, and `transcription_completed_at`, then upserts the full point using `PUT /collections/{collection}/points?wait=true` (`transcription.py:176-192`).

Bug:

If the segment point is missing or Qdrant update fails, the function only logs and returns. The worker still proceeds to parent completion check (`transcription.py:165-167`, `196-199`, `353-360`).

### Parent Completion Check

Confirmed behavior:

`check_all_segments_transcribed(file_id)` scrolls Qdrant with filter only on `parent_job_id=file_id`, `limit=100`, and `with_payload=True` (`transcription.py:256-271`). It does not set `with_vector=False`, does not filter `type=segment`, and does not paginate. It returns `all(seg.payload.status == "transcribed" for seg in segments)` (`transcription.py:278-287`).

Critical bug:

If the scroll returns an empty list, `all([])` returns `True`, so a parent can be marked `transcribed` even when no segment points were found.

Additional bugs:

Only the first 100 points are checked. If a transcript has more than 100 segments, the parent can be marked complete based on a subset. Any future non-segment point with `parent_job_id` could affect completion because `type=segment` is omitted.

### Qdrant Parent Update

Confirmed behavior:

`update_parent_status(file_id)` hashes the parent `file_id`, fetches the parent point, merges `status=transcribed` and `transcription_completed_at`, and upserts the full point (`transcription.py:206-249`). It preserves existing vector and payload fields as returned by Qdrant.

Idempotency:

The update is mostly idempotent for status, but repeated calls update `transcription_completed_at` each time.

### Failure Handling

Confirmed behavior:

Download/audio failures in `download_audio_segment` are caught and return `(None, None)` (`transcription.py:115-117`). The worker logs and `continue`s, losing the popped job (`transcription.py:327-332`).

Model failures in `transcribe_audio` are caught and return `None` (`transcription.py:146-150`). The worker logs and `continue`s, losing the popped job (`transcription.py:335-338`).

Qdrant update failures are caught inside update functions and do not rethrow (`transcription.py:201-204`, `251-254`). The popped job is not retried and may be treated as processed by the loop.

Malformed jobs are caught by the outer loop and lost after a 5 second sleep (`transcription.py:373-377`).

### Loop Restart Behavior

Confirmed behavior:

The worker loop catches broad exceptions inside the loop, logs a traceback, sleeps 5 seconds, and continues (`transcription.py:373-377`). Startup failures before `worker_loop()` are not caught by this loop and depend on container restart policy.

## 2. Docker Image Audit

### Dockerfile Facts

| Item | Confirmed value |
| --- | --- |
| Base image | `python:3.10-slim` (`gradio/transcription/Dockerfile:1`) |
| OS packages installed | none in transcription Dockerfile |
| Python version | Python 3.10 from base image |
| Pip strategy | `pip install --no-cache-dir -r requirements.txt` (`Dockerfile:5-6`) |
| Pip cache | `--no-cache-dir` prevents pip cache retention in image layer |
| Build stages | single-stage |
| Copy behavior | copies `requirements.txt`, installs, then `COPY . .` |
| Build context contents | only `Dockerfile`, `requirements.txt`, `transcription.py` confirmed |
| `.dockerignore` | none found in repository |

No unnecessary copied files are currently present in `gradio/transcription/`, but absence of `.dockerignore` is still fragile if model files, caches, checkpoints, or test artifacts are later placed in that directory.

### Likely Image-Size Contributors

The likely largest static image contributors are PyTorch and native ML/audio stacks:

1. `torch==2.6.0`: very large wheel and native libraries.
2. `torchaudio==2.6.0`: native audio/torch extension stack.
3. `pyannote.audio==3.1.1`: pulls model/audio ML ecosystem and duplicates diarization dependencies, but is unused by `transcription.py`.
4. `datasets`: large dependency tree (`pyarrow`, dataset tooling) and unused by `transcription.py`.
5. `transformers==4.52.4`: required for model loading, moderate-large dependency.
6. `librosa`, `soundfile`, `numba`/`llvmlite` transitive dependencies, and audio decoding stack.
7. `noisereduce`: smaller than torch but adds scientific stack dependency pressure.
8. Runtime model cache: Hugging Face model snapshots are not part of the built image unless cached into a layer, but can consume significant disk after startup.

### Dependency Table

| Package | Declared version | Confirmed source usage | Likely size impact | Necessary now? | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `transformers` | `4.52.4` | `WhisperProcessor`, `WhisperForConditionalGeneration`, `AutoProcessor`, `AutoModelForSpeechSeq2Seq` | high/moderate | yes | keep; pin with model revision strategy. |
| `torch` | `2.6.0` | `torch.cuda.is_available`, `torch.no_grad`, model backend | very high | yes | keep; choose explicit CPU or CUDA wheel/image based on deployment target. |
| `torchaudio` | `2.6.0` | not imported in `transcription.py` | high | not confirmed | investigate/remove if Transformers model does not need it at runtime. |
| `librosa` | `0.10.1` | full audio load/resample | moderate/high | yes for current code | keep initially; later consider replacing with faster targeted decoder. |
| `soundfile` | `0.12.1` | not directly imported; used by librosa backend | low/moderate native | likely yes via librosa | keep while using librosa. |
| `redis` | `5.0.1` | Redis queue client | low | yes | keep. |
| `requests` | `2.31.0` | MinIO HTTP downloads, Qdrant HTTP, Dagster event posts | low | yes | keep; add timeouts later. |
| `numpy` | `1.26.4` | indirect through audio/model stack; arrays from librosa/noisereduce | moderate | yes | keep; version constraint useful for audio libs. |
| `accelerate` | unpinned | not imported | moderate | not confirmed | investigate; remove unless needed by model loading/device map. |
| `sentencepiece` | unpinned | not imported directly | low/moderate native | possibly needed by processor/tokenizer | investigate; keep until tokenizer requirements verified. |
| `protobuf` | unpinned | not imported directly | low/moderate | possibly needed by tokenizer/model config | investigate; keep until tokenizer requirements verified. |
| `datasets` | unpinned | not imported | high | no | remove later if runtime validation confirms no hidden use. |
| `pyannote.audio` | `3.1.1` | not imported | very high | no for transcription | remove later; belongs in diarization image. |
| `noisereduce` | unpinned | `nr.reduce_noise` | moderate | yes for current behavior | keep if preserving output; investigate cost and effect. |

### Duplicate or Unnecessary Dependencies

Confirmed unused by transcription source:

1. `pyannote.audio==3.1.1`: diarization-only package; not imported by transcription.
2. `datasets`: not imported by transcription.
3. `torchaudio`: not imported by transcription, though some audio/model stacks may use it indirectly.
4. `accelerate`: not imported and no `device_map`/accelerate loading path is used.

Dependency overlap with diarization:

`pyannote.audio`, `torch`, `torchaudio`, `soundfile`, `librosa`, and `numpy` overlap with `gradio/diarization/requirements.txt`. Some overlap is natural for audio processing, but `pyannote.audio` in transcription appears unnecessary.

### Runtime Model Files and Caches

The Dockerfile does not copy model files. The worker may download model snapshots at startup through Transformers default cache paths. Without a mounted cache volume, model files are stored in the container writable layer and are lost when the container is recreated. They persist across simple process restarts inside the same container only as long as the container filesystem remains.

### Host-Mounted Model Directory

`compose.yml` mounts `/data/911/911_whisper_model:/app/models` for `gradio_transcription` (`compose.yml:95-97`). Active code does not use `/app/models` because the local path is commented and `model_path` is set to a Hugging Face model ID (`transcription.py:56-58`).

## 3. CUDA and GPU Compatibility Audit

### Base Image and CUDA Runtime

Confirmed behavior:

The base image is `python:3.10-slim`, not an NVIDIA CUDA runtime/devel image (`gradio/transcription/Dockerfile:1`). The Dockerfile installs no OS CUDA libraries.

Assessment:

The image is not explicitly CUDA-runtime-based. Whether it can use GPU depends entirely on the PyTorch wheel contents and host/container NVIDIA runtime injection.

### PyTorch Installation Source

Confirmed behavior:

`pip install --no-cache-dir -r requirements.txt` installs `torch==2.6.0` from default pip indexes unless environment/index configuration is supplied externally (`Dockerfile:6`, `requirements.txt:2`). No `--index-url` or `--extra-index-url` for CUDA-specific PyTorch wheels is declared.

Assessment:

Modern PyTorch pip packages may pull CUDA runtime dependency packages on Linux for some versions, but this is not explicit in the repo and should not be treated as a deployment guarantee. A rented GPU deployment should choose either an NVIDIA CUDA base image plus a matching CUDA PyTorch wheel, or an official PyTorch CUDA runtime image, and document the required host NVIDIA driver compatibility.

### Compose GPU Request

Confirmed behavior:

`compose.yml` has no `gpus`, `runtime: nvidia`, `deploy.resources.reservations.devices`, `NVIDIA_VISIBLE_DEVICES`, or `NVIDIA_DRIVER_CAPABILITIES` entries for `gradio_transcription` (`compose.yml:76-98`).

Assessment:

The current Compose definition does not request a GPU. Even if the host has a GPU and NVIDIA Container Toolkit installed, the service may start without GPU visibility.

### CPU Fallback

Confirmed behavior:

The code safely falls back to `cpu` if `torch.cuda.is_available()` is false (`transcription.py:74-77`).

Assessment:

CPU fallback is functionally safe but likely impractical for demonstrations when processing many segments. Whisper-small-sized models can run on CPU, but with repeated full-file decode/denoise overhead and serial segment processing, throughput is likely poor on low-power hardware.

### VRAM and Precision

Confirmed behavior:

No dtype is specified in `from_pretrained`, and no `.half()`, `torch_dtype=torch.float16`, `bfloat16`, quantization, or automatic mixed precision is used (`transcription.py:60-77`, `119-145`). The model likely loads in default float32.

Estimate, clearly not runtime-measured:

For a Whisper-small-class sequence-to-sequence model, model weights in float32 are likely under 1 GB, but runtime memory includes activations, generation cache, input features, tokenizer/model overhead, CUDA context, and PyTorch allocator overhead. A practical minimum GPU for reliable demonstration is likely 4 GB VRAM for short sequential segments, with 8 GB recommended for headroom. Larger or different checkpoints, longer segments, batching, or float32-only execution can increase the requirement.

Generation memory characteristics:

`num_beams=1` and `do_sample=False` are memory-conservative. `max_new_tokens=444` allows long outputs and can increase decoder cache memory compared with shorter caps. The code uses `torch.no_grad()` but not `torch.inference_mode()` (`transcription.py:133-141`).

## 4. Model Source and Cache Audit

### Active and Inactive Model Sources

| Item | Value | Evidence |
| --- | --- | --- |
| Active model identifier | `Devion333/whisper-small-dv-syn` | `transcription.py:58` |
| Commented local checkpoint | `/app/models/checkpoint-3000` | `transcription.py:56-57` |
| Compose model mount | `/data/911/911_whisper_model:/app/models` | `compose.yml:95-97` |
| Active use of mount | none confirmed | active `model_path` is HF ID |

### Download and Cache Behavior

Confirmed behavior:

Transformers `from_pretrained(model_path)` is called at startup with no explicit `cache_dir`, `revision`, `token`, or `local_files_only` (`transcription.py:60-70`).

Assumptions:

If the model is not present in the default Hugging Face cache path, the worker downloads it at container startup. In a default container with no mounted cache, downloads are stored in the container writable layer. They do not become part of the image, but they do increase disk usage and startup time.

Offline behavior:

The current worker cannot be assumed to start offline because `local_files_only=True` is not used and the active model path is remote. It may start offline only if a complete compatible cache already exists and Transformers resolves it without network.

Access tokens:

No token is explicitly passed. If the model is private/gated, startup depends on standard Hugging Face token configuration in environment or cache login state. This is not documented in the worker.

Revision pinning:

No model revision is pinned. Processor and model will load the latest default revision of `Devion333/whisper-small-dv-syn`, so behavior can drift if the remote repository changes.

Fallback loading logic:

The Auto classes should generally handle Whisper speech-seq2seq models. The fallback may be useful for older or unusual model configs, but it catches all exceptions, including network/auth/cache errors, and then attempts a second load from the same model path. That can obscure the root cause and duplicate network/cache attempts.

Likely disk usage:

A Whisper-small-class model snapshot may be hundreds of MB to over 1 GB depending on included formats and tokenizer files. Duplicate cache entries can occur if revisions change, if both safetensors/bin formats are cached, or if partial failed downloads remain.

### Recommended Canonical Model Loading Strategy

Local development:

Use mock transcription by default. When real transcription is needed locally, use an explicit environment variable such as `WHISPER_MODEL_PATH` with a small/local test model and a mounted `HF_HOME` cache. Avoid automatic downloads during routine dev.

Temporary rented GPU deployment:

Use a pinned model ID plus pinned revision, an explicit mounted cache volume, and a startup check that fails clearly if the model is unavailable. Prefer pre-warming the cache before a demo window or baking the model into a deliberately tagged demo image if disk budget permits.

Offline demonstration reliability:

Use a local model directory mounted read-only and load with `local_files_only=True`. Set model path to the mounted directory, not a remote ID. Verify processor and model load from that directory before the demonstration.

## 5. Audio Processing Efficiency Audit

### Confirmed Per-Job Behavior

For every segment job, the worker:

1. Downloads the entire source audio object (`requests.get(minio_url)`) (`transcription.py:93-95`).
2. Writes the entire object to a temp file (`transcription.py:97-100`).
3. Decodes and resamples the entire file with `librosa.load(..., sr=16000)` (`transcription.py:102-103`).
4. Runs `noisereduce` on the entire decoded waveform (`transcription.py:103-104`).
5. Slices the requested segment from that full waveform (`transcription.py:105-108`).
6. Deletes the temp file only on success (`transcription.py:110-111`).

Most serious inefficiency:

Every segment repeats full-file download, full-file decode/resample, and full-file denoise. For a transcript with N segments, a one-hour audio file can be downloaded and decoded N times.

### Denoising Cost

Confirmed behavior:

Denoising is applied to the full audio before slicing.

Estimate:

`noisereduce` can be CPU-intensive because it analyzes/processes the waveform. Applying it to a full long recording for every segment is likely one of the largest non-model CPU costs. Exact cost requires benchmarking with representative audio.

### Reuse and Caching Opportunities

Safe efficiency improvements likely preserving output:

1. Cache downloaded full audio per `file_id` or `minio_url` during worker process lifetime.
2. Decode and denoise once per parent file, then slice all queued segments for that parent.
3. Use a `finally` block to remove temp files on failure.
4. Add HTTP timeouts and streaming download to avoid hanging and reduce peak memory.
5. Set `with_vector=False` in Qdrant scrolls to reduce payload size.

Potentially behavior-preserving but needing validation:

1. Generate segment audio files earlier in the pipeline and pass segment URLs to transcription.
2. Use ffmpeg or soundfile to decode only the time window instead of the whole file.
3. Use MinIO range requests if source format and indexing make it practical.

Risky changes that may alter transcription accuracy:

1. Removing `noisereduce` entirely.
2. Denoising only segment audio instead of full recording, because noise profile estimation may change.
3. Changing sample rate, mono conversion behavior, normalization, silence trimming, or padding.
4. Batching variable-duration segments without matching current preprocessing exactly.

### Batching Assessment

Inference batching may be practical after grouping segments by parent and similar duration, but it introduces padding, attention mask, memory, ordering, and failure isolation concerns. For an FYP demonstration, caching decoded audio is lower risk and likely higher immediate benefit than batching model inference.

## 6. Inference Configuration Audit

### Processor Usage

The processor is loaded from the same model path as the model using Auto first, then Whisper-specific fallback (`transcription.py:60-70`). It is called with raw NumPy audio and `sampling_rate=sr`, returning `.input_features` (`transcription.py:124-126`).

### Sampling Rate Assumptions

Audio is always loaded at `sr=16000` via librosa (`transcription.py:102-103`). Whisper expects 16 kHz audio, so this is aligned with standard Whisper preprocessing.

### Device Transfer and Dtype

Input features are transferred to the selected device (`transcription.py:125-126`). No dtype conversion is configured. Model and inputs are likely float32 unless the checkpoint or Transformers defaults specify otherwise.

### Language and Task Configuration

The code uses `processor.get_decoder_prompt_ids(language="si")` (`transcription.py:128-130`). Comment says "Force Dhivehi decoding", but ISO/code `si` conventionally refers to Sinhala, not Dhivehi. Dhivehi is commonly `dv` in language codes, while Whisper language support for Dhivehi depends on model/tokenizer training and configuration.

Correctness risk:

The code may not explicitly force Dhivehi as intended. It may force Sinhala or rely on custom model behavior if the fine-tuned model maps language prompts differently. This requires model/tokenizer inspection and runtime validation.

Task configuration:

No `task="transcribe"` is passed to `get_decoder_prompt_ids`; the comment explicitly says not to pass task (`transcription.py:128-129`). The model may rely on default task behavior.

### Generation Options

Confirmed options:

| Option | Value | Assessment |
| --- | --- | --- |
| `forced_decoder_ids` | language prompt IDs | Intended to force language; code may be wrong for Dhivehi. |
| `do_sample` | `False` | Deterministic. |
| `temperature` | `0.0` | Deterministic. |
| `num_beams` | `1` | Greedy, memory efficient. |
| `max_new_tokens` | `444` | Allows long output; may be high for short diarization segments. |

Attention masks:

No attention mask is passed. For standard Whisper feature extraction, this may be acceptable, but runtime warnings or behavior depend on Transformers version/model config.

Timestamps:

No timestamp generation is requested. Segment timing comes from diarization, not Whisper timestamps.

Exception fallback:

Any exception in `transcribe_audio` logs traceback and returns `None`, causing the worker to drop the job after pop.

## 7. Redis Queue Reliability Audit

### Contract

Queue name: `transcription_queue`.

Producer: real diarization `push_transcription_jobs()` (`gradio/diarization/diarization.py:232-238`) and mock diarization (`mock_workers/mock_diarization.py:75-78`).

Consumer: real transcription `worker_loop()` (`transcription.py:297-380`) and mock transcription in dev (`mock_workers/mock_transcription.py:62-98`).

Payload structure:

```json
{
  "segment_id": "{file_id}_seg_000",
  "file_id": "parent-job-id",
  "start_time": 0.0,
  "end_time": 4.8,
  "speaker": "SPEAKER_00",
  "minio_url": "http://minio:9000/uploads/..."
}
```

### Failure Modes

| Event | Current behavior | Consequence |
| --- | --- | --- |
| No job | `BLPOP timeout=10`, continue | safe idle loop. |
| Malformed JSON | outer exception, sleep 5 | job lost. |
| Missing key | outer exception, sleep 5 | job lost. |
| Download failure | returns `(None, None)`, continue | job lost, segment remains pending. |
| Temp/decode/denoise failure | returns `(None, None)`, possible temp leak | job lost. |
| Model failure | returns `None`, continue | job lost. |
| Qdrant segment missing | logs and returns | job lost; parent check still runs. |
| Qdrant update failure | logs and returns | job lost; parent check still runs. |
| Worker killed after pop | no ack/requeue pattern | job lost. |

Retry/dead-letter:

No retry queue, attempt counter, failed-job recording, dead-letter list, or Qdrant failure status is implemented.

Duplicate processing:

Manual requeue or duplicate producer events can process a segment multiple times. Segment update is idempotent in the sense that it overwrites `transcript_text` and `status`, but `transcription_completed_at` changes and parent completion may rerun.

### Recommended FYP-Appropriate Reliability Design

Avoid overengineering, but introduce basic safety:

1. Use `BRPOPLPUSH` or `BLMOVE` from `transcription_queue` to `transcription_processing_queue` so popped jobs are not lost immediately.
2. Include `attempts` in the job payload or a sidecar retry count.
3. On success, remove from processing queue.
4. On retryable failure, push back to `transcription_queue` with incremented attempts and short delay strategy if practical.
5. After max attempts, push to `transcription_failed_queue` and update segment payload with `status=transcription_failed`, `error_message`, and `failed_at`.
6. On worker startup, inspect/recover stale items from `transcription_processing_queue` manually or with a simple timeout timestamp.

This keeps Redis-list simplicity while preventing silent job loss.

## 8. Qdrant Update Audit

### Segment ID Generation

Producer creates `segment_id = f"{file_id}_seg_{idx:03d}"` and hashes it with djb2 for Qdrant point IDs (`gradio/diarization/diarization.py:178-203`). Consumer hashes the same `segment_id` (`transcription.py:83-88`, `152-155`). This is consistent.

### Point Retrieval and Payload Merge

Segment update fetches existing point, merges payload, preserves existing vector, and upserts full point (`transcription.py:158-192`). Parent update does the same for the parent point (`transcription.py:212-243`). This preserves fields when Qdrant returns the vector.

Risk:

The point `GET` response must include vector for `existing_vector = point_data.get("result", {}).get("vector", [0.0] * 512)` to preserve vectors. If Qdrant point GET omits vectors by default in the deployed version, the worker will replace vectors with zero vectors. For current data zero vectors are used by workers, so behavior impact is low today, but this matters if embeddings are later added.

### Segment Status Update

Confirmed payload fields set:

1. `transcript_text` to model output.
2. `status` to `transcribed`.
3. `transcription_completed_at` to current timestamp.

No error status is set on failures.

### Parent Completion Logic

Specific correctness bugs:

1. Empty result bug: `all([])` is true, so parent can be marked `transcribed` when no segments are returned (`transcription.py:278-287`).
2. Limit bug: only `limit=100` points are checked and no pagination occurs (`transcription.py:260-271`). Transcripts with more than 100 segments can be completed incorrectly.
3. Missing type filter: only `parent_job_id` is filtered, not `type=segment` (`transcription.py:263-270`). Future non-segment points with `parent_job_id` could corrupt completion logic.
4. Failure masking: `update_segment_in_qdrant()` does not return success/failure; parent completion check runs even if the just-processed segment update failed (`transcription.py:353-360`).
5. No expected-count check: parent `segment_count` is not used to verify that all expected segments exist.

Concurrency behavior:

If multiple transcription workers run, several final segments may finish close together. Parent update is mostly idempotent, but each worker may independently mark the parent `transcribed`. Without an atomic expected-count/status update, transient races are possible. The worst source-confirmed issue remains the incorrect completion query, not the idempotent parent upsert.

Behavior when segment missing or failed:

If a segment is missing from Qdrant, the worker logs and proceeds. If some segment remains `pending_transcription`, `all(...)` should be false if that segment is included in the first 100 returned points. If the failed/missing segment is beyond the first 100 or not returned, parent can still be marked complete.

## 9. Temporary Deployment Assessment

### Likely Worker Deployment Requirements

| Resource | Minimum practical | Recommended for smoother demo | Notes |
| --- | --- | --- | --- |
| OS | Linux | Ubuntu LTS or similar | Must support NVIDIA driver/container toolkit. |
| Docker | recent Docker Engine | recent Docker Engine with Compose plugin | Required for existing workflow. |
| NVIDIA driver | compatible with selected CUDA/PyTorch | current stable driver | Must be installed on host. |
| NVIDIA Container Toolkit | required for Docker GPU | required | Current repo does not configure it. |
| GPU VRAM | estimated 4 GB | estimated 8 GB or more | Estimate for Whisper-small-class sequential inference. |
| CPU | 2-4 vCPU | 4-8 vCPU | Audio decode/denoise is CPU-heavy. |
| RAM | 8 GB | 16 GB | Model, Python stack, full-audio arrays, cache overhead. |
| Disk | 20-30 GB free | 50 GB free | Image layers plus model/cache/temp files. |
| Model cache | persistent volume recommended | persistent volume strongly recommended | Avoid repeated startup downloads. |
| Network | access to Redis, Qdrant, MinIO, optional HF | stable low-latency access to services | MinIO full-file downloads can be heavy. |
| Exposed ports | none for worker itself | none for worker itself | Worker is outbound to Redis/Qdrant/MinIO. |
| Secrets/env | Redis/Qdrant/MinIO URLs, HF token if needed | same plus pinned model/cache vars | Current MinIO credentials unused by transcription source. |
| Persistent volumes | HF model cache | HF cache and optional audio cache | Prevent repeated downloads and speed restarts. |

### Deployment Pattern Comparison

#### 1. All services on one rented GPU VM

Pros:

1. Simplest networking; Docker service names can work unchanged.
2. MinIO/Qdrant/Redis remain private on one host network.
3. Lowest cross-machine latency for repeated full-audio downloads.

Cons:

1. GPU VM must run all services, increasing cost while idle.
2. Data migration from local volumes may be needed.
3. Still requires frontend deployment or remote access setup.

Fit:

Best for a short demonstration if simplicity matters more than cost. Strong candidate for two-to-four-week test if the VM can be stopped when not needed and volumes preserved.

#### 2. Lightweight services locally or on CPU VM, only transcription on GPU VM

Pros:

1. GPU cost can be limited to the worker.
2. Existing dev stack can remain mostly unchanged.

Cons:

1. Redis, Qdrant, and MinIO must be reachable securely from the GPU VM.
2. Current configs assume Docker service DNS names like `redis`, `qdrant`, and internal MinIO URLs like `http://minio:9000`.
3. Repeated full-file downloads across WAN/VPN will be slow and costly.
4. Exposing Redis/Qdrant/MinIO creates security risk without VPN/tunnel/firewall.

Fit:

Possible, but only if networking is carefully handled with VPN/private tunnel and MinIO URLs are externally usable by the worker.

#### 3. On-demand GPU pod connected to externally reachable Redis/Qdrant/MinIO

Pros:

1. Cost-efficient if worker runs only during jobs/demos.
2. Can use provider-managed GPU runtime.

Cons:

1. Requires robust external endpoints, secrets, and firewalling.
2. Current Redis queue reliability is weak for ephemeral workers.
3. Runtime model download/cache persistence varies by pod provider.
4. Internal MinIO URLs will not work unless rewritten or externally routable.

Fit:

Good later after cache, URL, and queue reliability fixes. Risky as the immediate first deployment.

#### 4. Prebuilt transcription image started only for demonstrations

Pros:

1. Reduces demo startup variability if image and model cache are prepared.
2. Works with pattern 1 or 3.
3. Keeps GPU off outside demo windows.

Cons:

1. Requires GPU-compatible image cleanup first.
2. If model is not baked in or cache mounted, startup can still download model.
3. Large image push/pull can be slow.

Fit:

Recommended as an operational technique after Docker/GPU/model-source cleanup, not as the first source-code change.

### Recommended Temporary Deployment Architecture

Most realistic for this project now: all lightweight services plus the transcription worker on one rented Linux GPU VM for demonstration windows, with persistent Docker volumes for MinIO, Qdrant, and Hugging Face cache. Keep the VM stopped when not in use if the provider preserves disk, or snapshot it before shutdown.

Reasoning:

1. Avoids exposing Redis/Qdrant/MinIO over the public internet.
2. Avoids breaking internal service URLs like `http://minio:9000`.
3. Avoids WAN transfer of full audio for every segment.
4. Minimizes changes required before the FYP demonstration.
5. Lets GPU runtime, model cache, and worker behavior be validated in one environment.

## 10. Prioritized Findings

### Critical Correctness Issues

| Finding | Evidence | Affected file/function | Impact | Risk of changing | Recommended action | Benchmark required? |
| --- | --- | --- | --- | --- | --- | --- |
| Parent can be marked complete when zero segments are returned | `all([])` in completion check | `transcription.py:256-287`, `check_all_segments_transcribed` | Incorrect parent `transcribed` status | low | Return false when no segments; check expected count. | no |
| Parent completion checks only first 100 matching points | `limit: 100`, no pagination | `check_all_segments_transcribed` | Large transcripts can complete incorrectly | low/medium | Paginate all segments or compare against `segment_count`. | no |
| Completion filter omits `type=segment` | filter only `parent_job_id` | `check_all_segments_transcribed` | Non-segment points can affect completion | low | Add `type=segment` filter. | no |
| Jobs are lost after pop on download/model/Qdrant failure | `BLPOP` then `continue`/swallowed errors | `worker_loop`, `download_audio_segment`, `transcribe_audio`, Qdrant update funcs | Lost work, permanently pending segments | medium | Add processing queue, retry/dead-letter, failure status. | no for logic, yes for integration |
| Qdrant update failure does not stop parent completion check | update functions log and return no status | `update_segment_in_qdrant`, `worker_loop` | Parent can be checked after failed segment write | low | Return bool or raise on update failure. | no |
| Intended Dhivehi forcing may use wrong language code | `language="si"` with comment "Dhivehi" | `transcribe_audio` | Possible wrong language prompt | medium/high | Verify tokenizer/model language codes before changing. | yes |

### High-Impact Efficiency Improvements

| Finding | Evidence | Affected file/function | Impact | Risk of changing | Recommended action | Benchmark required? |
| --- | --- | --- | --- | --- | --- | --- |
| Full source audio downloaded per segment | `requests.get(minio_url)` inside per-job function | `download_audio_segment` | Major network/disk/time cost | low if cached exactly | Cache full file per parent/minio URL. | yes |
| Full audio decoded and resampled per segment | `librosa.load(tmp_path, sr=16000)` | `download_audio_segment` | Major CPU cost | low if cached decoded waveform | Decode once per parent and slice multiple segments. | yes |
| Full audio denoised per segment | `nr.reduce_noise` before slicing | `download_audio_segment` | Major CPU cost | medium | Cache denoised full waveform or evaluate segment-only denoise. | yes |
| Unused large dependencies | `pyannote.audio`, `datasets` not imported | `requirements.txt` | Large image and install time | low/medium | Remove after import/runtime validation. | image size validation |
| Model loads float32 by default | no dtype setting | model loading | Higher VRAM/memory than needed | medium | Evaluate float16 on GPU only. | yes, output validation |

### Deployment Blockers

| Finding | Evidence | Affected file/function | Impact | Risk of changing | Recommended action | Benchmark required? |
| --- | --- | --- | --- | --- | --- | --- |
| Compose does not request GPU | no GPU config in `compose.yml` | `compose.yml:76-98` | GPU host may run CPU-only | low | Add documented GPU runtime config later. | runtime check required |
| Base image is not CUDA-specific | `python:3.10-slim` | `Dockerfile:1` | CUDA compatibility uncertain | medium | Use explicit CUDA/PyTorch runtime strategy. | runtime check required |
| Active model mount unused | `model_path` remote, mount `/app/models` | `transcription.py:56-58`, `compose.yml:95-97` | Offline/local model demo unreliable | low | Make model path configurable and use mounted cache/model. | startup validation |
| Model revision/cache not pinned | no `revision`, no cache dir | model loading | Startup drift and downloads | low/medium | Pin revision and mount cache volume. | startup validation |
| Internal MinIO URLs complicate remote worker | jobs contain `http://minio:9000/...` | producer/worker contract | Split deployment may fail DNS/network | medium | Keep one-VM topology first or introduce externally valid URL config. | integration validation |

### Optional Improvements

| Finding | Evidence | Affected file/function | Impact | Risk of changing | Recommended action | Benchmark required? |
| --- | --- | --- | --- | --- | --- | --- |
| Dagster event endpoint likely absent | worker posts `/events`; Dagster definitions do not expose it | `log_dagster_event` | noisy failed posts if enabled | low | Remove or replace with actual Dagster mechanism later. | no |
| No request timeouts for MinIO/Qdrant | `requests.get/post/put` without timeouts | several functions | Worker can hang on network calls | low | Add timeouts. | integration validation |
| Uses `torch.no_grad()` not `inference_mode()` | generation block | `transcribe_audio` | Small performance opportunity | low | Consider `torch.inference_mode()`. | yes |
| No `.dockerignore` | repository search found none | Docker contexts | Future accidental large copies | low | Add `.dockerignore` later. | no |
| No graceful shutdown handling | infinite loop | `worker_loop` | Jobs lost on termination after pop | medium | Pair with processing queue and signal handling. | integration validation |

## 11. Proposed Implementation Stages

Do not implement during this audit. The stages below are recommended sequencing.

### Stage 1: Correctness and Queue-Safety Fixes

Likely files to change:

1. `gradio/transcription/transcription.py`
2. `mock_workers/mock_transcription.py` if keeping mock contract aligned
3. Potentially frontend/status display files if adding failure statuses later

Expected benefit:

Prevent lost jobs, incorrect parent completion, and silent pending segments.

Risk level:

Medium. Queue changes affect operational behavior but should not change transcription text if inference path is untouched.

Validation required:

Unit-style tests or dev-stack tests for malformed job, failed download, failed Qdrant update, empty segment set, more than 100 segments, and successful final completion.

May transcription output change?

No, if inference and audio preprocessing are unchanged.

### Stage 2: Dependency and Docker Image Cleanup

Likely files to change:

1. `gradio/transcription/requirements.txt`
2. `gradio/transcription/Dockerfile`
3. Add `.dockerignore` in appropriate context or root

Expected benefit:

Reduce image size, install time, build time, and disk usage. Removing `pyannote.audio` and `datasets` is likely high impact.

Risk level:

Medium. Some apparently unused packages may be indirect runtime requirements.

Validation required:

Fresh build in a controlled environment, import test, model load test, one known transcription sample comparison.

May transcription output change?

No, if only unused dependencies are removed. Validate to confirm.

### Stage 3: Model Source and Cache Stabilization

Likely files to change:

1. `gradio/transcription/transcription.py`
2. `compose.yml`
3. Environment documentation/config files if project permits later

Expected benefit:

Predictable startup, offline demo reliability, no surprise model downloads, reproducible model version.

Risk level:

Medium.

Validation required:

Start worker with prewarmed cache, start with network disabled if offline mode is desired, verify exact model revision loaded.

May transcription output change?

Potentially yes if changing model revision/path. Pin current revision first before changing model.

### Stage 4: GPU-Compatible Docker and Compose Configuration

Likely files to change:

1. `gradio/transcription/Dockerfile`
2. `gradio/transcription/requirements.txt`
3. `compose.yml` or a GPU-specific override Compose file

Expected benefit:

Reliable GPU use on rented Linux GPU host.

Risk level:

Medium/high because CUDA/PyTorch compatibility can be environment-specific.

Validation required:

Run `torch.cuda.is_available()` inside container on GPU host, confirm model on CUDA, run short transcription job, monitor VRAM.

May transcription output change?

No if dtype remains float32. If switching to float16, output may change slightly and must be validated.

### Stage 5: Audio Download/Decoding Efficiency Improvements

Likely files to change:

1. `gradio/transcription/transcription.py`
2. Possibly `gradio/diarization/diarization.py` if producing segment audio or grouped jobs
3. Possibly MinIO object naming conventions if segment audio files are introduced

Expected benefit:

Large reduction in network transfer, CPU decode time, denoise time, and end-to-end transcription time.

Risk level:

Medium. Caching exact full-audio waveform is lower risk; segment-file generation or denoise changes are higher risk.

Validation required:

Benchmark same audio before/after, compare transcript output, measure wall-clock time and CPU/RAM/disk.

May transcription output change?

No for exact cached full decoded/denoised waveform. Yes possible for decoder, denoise, normalization, segment extraction changes.

### Stage 6: Temporary Deployment Setup

Likely files to change:

1. Deployment-specific Compose override or runbook
2. `compose.yml` if project decides to encode GPU settings directly
3. Environment variable documentation

Expected benefit:

Repeatable two-to-four-week demonstration environment.

Risk level:

Medium.

Validation required:

End-to-end upload to completed transcript on the rented host with representative audio.

May transcription output change?

No, unless model/dtype/device changes affect output.

### Stage 7: Controlled Runtime Validation on GPU Hardware

Likely files to change:

None initially; produce benchmark notes after validation.

Expected benefit:

Evidence-based confidence for demo runtime, VRAM, disk, startup time, and transcript quality.

Risk level:

Low.

Validation required:

Measure image size, model cache size, startup time, `torch.cuda.is_available`, VRAM during generation, per-segment processing time, total transcript time, failed-job behavior, Qdrant parent status correctness.

May transcription output change?

No.

## Final Recommendations

Recommended first implementation stage:

Stage 1, correctness and queue-safety fixes. The current worker can lose jobs and mark parents complete incorrectly. Fixing that preserves transcription behavior while making later deployment tests trustworthy.

Recommended temporary deployment architecture:

For the near-term FYP/demo period, run all services on one rented Linux GPU VM during demonstration windows, with persistent volumes for MinIO, Qdrant, Redis as needed, and a persistent Hugging Face/model cache. This avoids public exposure of Redis/Qdrant/MinIO and avoids cross-network full-audio downloads for every segment.

Recommended later safe behavior-preserving optimizations:

1. Remove clearly unused dependencies after validation, especially `pyannote.audio` and `datasets` from the transcription image.
2. Make model path/cache/revision explicit and configurable.
3. Add a GPU-specific Docker/Compose path.
4. Cache full downloaded/decoded/denoised audio per parent before considering riskier preprocessing changes.

## Confirmation of Non-Actions

No application code, Dockerfile, Compose file, dependency file, configuration file, generated artifact, persistent volume, or runtime data was modified by this audit.

No real transcription worker, diarization worker, conversion worker, analysis worker, Docker Compose stack, Docker build, model load, model download, package download, CUDA image pull, GPU workload, or Docker prune command was run.
