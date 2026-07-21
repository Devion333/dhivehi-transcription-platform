# Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
# Program Name: validate_minimal_image.py
# Description: Gradio worker for the transcription service
# First Written on: 03/07/2026
# Edited on: 21/07/2026
import argparse
import os
import time
import tracemalloc

import librosa
import noisereduce as nr
import torch
from transformers import WhisperForConditionalGeneration, WhisperProcessor


MODEL_PATH = "Devion333/whisper-small-dv-syn"
SAMPLE_RATE = 16000
LANGUAGE = "si"
MAX_NEW_TOKENS = 444


def read_cached_revision():
    hf_home = os.environ.get("HF_HOME", "/root/.cache/huggingface")
    ref_path = os.path.join(
        hf_home,
        "hub",
        "models--Devion333--whisper-small-dv-syn",
        "refs",
        "main",
    )
    try:
        with open(ref_path, "r", encoding="utf-8") as ref_file:
            return ref_file.read().strip()
    except OSError:
        return "unknown"


def memory_snapshot():
    current, peak = tracemalloc.get_traced_memory()
    cuda_peak = None
    if torch.cuda.is_available():
        cuda_peak = torch.cuda.max_memory_allocated()
    return current, peak, cuda_peak


def load_processor_and_model():
    revision = read_cached_revision()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = WhisperProcessor.from_pretrained(
        MODEL_PATH,
        use_fast=False,
        local_files_only=True,
    )
    model = WhisperForConditionalGeneration.from_pretrained(
        MODEL_PATH,
        local_files_only=True,
    )
    model.eval()
    model = model.to(device)
    return processor, model, device, revision


def run_load():
    tracemalloc.start()
    started = time.perf_counter()
    _, _, device, revision = load_processor_and_model()
    elapsed = time.perf_counter() - started
    _, peak, cuda_peak = memory_snapshot()
    print(f"model_path={MODEL_PATH}")
    print(f"revision={revision}")
    print(f"device={device}")
    print(f"torch_cuda_is_available={torch.cuda.is_available()}")
    print(f"load_elapsed_seconds={elapsed:.3f}")
    print(f"python_peak_memory_bytes={peak}")
    if cuda_peak is not None:
        print(f"cuda_peak_memory_bytes={cuda_peak}")


def run_transcribe(audio_path, start_time, end_time):
    tracemalloc.start()
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()

    processor, model, device, revision = load_processor_and_model()
    audio, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
    audio = nr.reduce_noise(y=audio, sr=sr)

    start_sample = int(start_time * sr)
    end_sample = int(end_time * sr)
    segment_audio = audio[start_sample:end_sample]
    duration = len(segment_audio) / sr if sr else 0.0

    started = time.perf_counter()
    input_features = processor(
        segment_audio,
        sampling_rate=sr,
        return_tensors="pt",
    ).input_features
    input_features = input_features.to(device)
    forced_decoder_ids = processor.get_decoder_prompt_ids(language=LANGUAGE)

    with torch.no_grad():
        predicted_ids = model.generate(
            input_features,
            forced_decoder_ids=forced_decoder_ids,
            do_sample=False,
            temperature=0.0,
            num_beams=1,
            max_new_tokens=MAX_NEW_TOKENS,
        )

    transcription = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0]
    elapsed = time.perf_counter() - started
    _, peak, cuda_peak = memory_snapshot()

    print(f"source_fixture={os.path.basename(audio_path)}")
    print(f"model_path={MODEL_PATH}")
    print(f"revision={revision}")
    print(f"duration_seconds={duration:.3f}")
    print(f"selected_device={device}")
    print(f"language={LANGUAGE}")
    print("generation=do_sample=False,temperature=0.0,num_beams=1,max_new_tokens=444")
    print(f"transcription={transcription}")
    print(f"transcription_length={len(transcription)}")
    print(f"elapsed_inference_seconds={elapsed:.3f}")
    print(f"python_peak_memory_bytes={peak}")
    if cuda_peak is not None:
        print(f"cuda_peak_memory_bytes={cuda_peak}")


def main():
    parser = argparse.ArgumentParser(description="Isolated transcription image validator")
    parser.add_argument("--mode", choices=["load", "transcribe"], required=True)
    parser.add_argument("--audio", help="Audio fixture path for transcribe mode")
    parser.add_argument("--start", type=float, default=0.0)
    parser.add_argument("--end", type=float, default=0.0)
    args = parser.parse_args()

    if args.mode == "load":
        run_load()
        return

    if not args.audio:
        raise SystemExit("--audio is required for transcribe mode")
    if args.end <= args.start:
        raise SystemExit("--end must be greater than --start")
    run_transcribe(args.audio, args.start, args.end)


if __name__ == "__main__":
    main()
