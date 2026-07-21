// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: client.ts
// Description: API client for client
// First Written on: 03/07/2026
// Edited on: 21/07/2026
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
    const flatBody = body as { error?: string; message?: string } | null;
    throw new ApiError(
      body?.error && typeof body.error === "object" ? body.error.message ?? `Request failed with status ${response.status}` : flatBody?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.error && typeof body.error === "object" ? body.error.code : flatBody?.error,
    );
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getStats: (signal?: AbortSignal) => request<StatsResponse>("/api/stats", { signal }),
  listTranscripts: (page = 1, pageSize = 10, signal?: AbortSignal) =>
    request<TranscriptListResponse>(`/api/transcripts?page=${page}&pageSize=${pageSize}`, { signal }),
};
