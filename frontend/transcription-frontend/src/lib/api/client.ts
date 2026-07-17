import { BACKEND_URL } from "@/config";
import type { ApiErrorBody, StatsResponse, TranscriptListResponse } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Accept": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(
      body?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.error?.code,
    );
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getStats: (signal?: AbortSignal) => request<StatsResponse>("/api/stats", { signal }),
  listTranscripts: (page = 1, pageSize = 10, signal?: AbortSignal) =>
    request<TranscriptListResponse>(`/api/transcripts?page=${page}&pageSize=${pageSize}`, { signal }),
};
