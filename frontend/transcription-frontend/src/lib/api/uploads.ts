import { BACKEND_URL } from "@/config";
import { ApiError } from "./client";
import type { ApiErrorBody, UploadMetadata, UploadResult } from "./types";

export async function uploadTranscript({
  file,
  metadata,
  signal,
}: {
  file: File;
  metadata: UploadMetadata;
  signal?: AbortSignal;
}): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", metadata.category ?? "");
  formData.append("referenceNumber", metadata.referenceNumber ?? "");
  formData.append("notes", metadata.notes ?? "");
  if (metadata.requestedSpeakers !== undefined) {
    formData.append("requestedSpeakers", String(metadata.requestedSpeakers));
  }

  const response = await fetch(`${BACKEND_URL}/api/uploads`, {
    method: "POST",
    body: formData,
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.message ?? uploadFallbackMessage(response.status),
      response.status,
      body?.error?.code,
    );
  }

  const result = await response.json().catch(() => null) as UploadResult | null;
  if (!result?.job?.jobId) {
    throw new ApiError("The upload response was missing a job ID", response.status);
  }
  return result;
}

function uploadFallbackMessage(status: number) {
  if (status === 400) return "The selected file or metadata was not accepted";
  if (status >= 500) return "The backend could not accept the upload right now";
  return `Upload failed with status ${status}`;
}
