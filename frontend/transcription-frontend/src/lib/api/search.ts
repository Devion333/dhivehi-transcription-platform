import { request } from "./client";
import type { TranscriptSearchResponse } from "./types";

export type TranscriptSearchParams = {
  q: string;
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
};

export function transcriptSearchQuery(params: TranscriptSearchParams) {
  const query = params.q.trim();
  if (!query) throw new Error("Search query is required");
  const searchParams = new URLSearchParams({ q: query });
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.status?.trim() && params.status !== "all") searchParams.set("status", params.status.trim());
  if (params.category?.trim()) searchParams.set("category", params.category.trim());
  return searchParams.toString();
}

export function searchTranscripts(params: TranscriptSearchParams, signal?: AbortSignal) {
  return request<TranscriptSearchResponse>(`/api/search/transcripts?${transcriptSearchQuery(params)}`, { signal });
}
