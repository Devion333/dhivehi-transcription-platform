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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
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
  getStats: () => request<StatsResponse>("/api/stats"),
  listTranscripts: (page = 1, pageSize = 10) =>
    request<TranscriptListResponse>(`/api/transcripts?page=${page}&pageSize=${pageSize}`),
};
