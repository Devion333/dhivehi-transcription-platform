import { BACKEND_URL } from "@/config";
import { ApiError } from "./client";
import type { ApiErrorBody, UploadMetadata, UploadResult } from "./types";

export async function uploadTranscript({
  file,
  metadata,
  signal,
  onProgress,
}: {
  file: File;
  metadata: UploadMetadata;
  signal?: AbortSignal;
  onProgress?: (percentage: number | null) => void;
}): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", metadata.category ?? "");
  formData.append("referenceNumber", metadata.referenceNumber ?? "");
  formData.append("notes", metadata.notes ?? "");
  if (metadata.requestedSpeakers !== undefined) {
    formData.append("requestedSpeakers", String(metadata.requestedSpeakers));
  }

  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    function finishError(error: unknown) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function finishSuccess(result: UploadResult) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    xhr.open("POST", `${BACKEND_URL}/api/uploads`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        onProgress?.(null);
        return;
      }
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };

    xhr.onload = () => {
      const body = parseUploadResponse(xhr.responseText);
      if (xhr.status < 200 || xhr.status >= 300) {
        const errorBody = isApiErrorBody(body) ? body : null;
        finishError(new ApiError(errorBody?.error?.message ?? uploadFallbackMessage(xhr.status), xhr.status, errorBody?.error?.code));
        return;
      }
      const result = body as UploadResult | null;
      if (!result?.job?.jobId) {
        finishError(new ApiError("The upload response was missing a job ID", xhr.status));
        return;
      }
      finishSuccess(result);
    };

    xhr.onerror = () => finishError(new ApiError("The backend could not accept the upload right now", xhr.status || 0));
    xhr.onabort = () => finishError(new DOMException("Upload was cancelled", "AbortError"));
    xhr.ontimeout = () => finishError(new ApiError("Upload timed out", xhr.status || 0));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(formData);
  });
}

function parseUploadResponse(value: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as UploadResult | ApiErrorBody;
  } catch {
    return null;
  }
}

function isApiErrorBody(value: UploadResult | ApiErrorBody | null): value is ApiErrorBody {
  return Boolean(value && "error" in value);
}

function uploadFallbackMessage(status: number) {
  if (status === 400) return "The selected file or metadata was not accepted";
  if (status >= 500) return "The backend could not accept the upload right now";
  return `Upload failed with status ${status}`;
}
