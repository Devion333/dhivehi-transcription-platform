import { request } from "./client";
import type { TranscriptSearchResponse } from "./types";

export type TranscriptSearchParams = {
  q?: string;
  filename?: string;
  reference?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
  ownerUserId?: string;
  folderId?: string;
  createdFrom?: string;
  createdTo?: string;
  speaker?: string;
};

export function transcriptSearchQuery(params: TranscriptSearchParams) {
  const searchParams = new URLSearchParams();
  if (params.q?.trim()) searchParams.set("q", params.q.trim());
  if (params.filename?.trim()) searchParams.set("filename", params.filename.trim());
  if (params.reference?.trim()) searchParams.set("reference", params.reference.trim());
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.status?.trim() && params.status !== "all") searchParams.set("status", params.status.trim());
  if (params.category?.trim()) searchParams.set("category", params.category.trim());
  if (params.ownerUserId?.trim()) searchParams.set("ownerUserId", params.ownerUserId.trim());
  if (params.folderId?.trim()) searchParams.set("folderId", params.folderId.trim());
  if (params.createdFrom?.trim()) searchParams.set("createdFrom", params.createdFrom.trim());
  if (params.createdTo?.trim()) searchParams.set("createdTo", params.createdTo.trim());
  if (params.speaker?.trim()) searchParams.set("speaker", params.speaker.trim());
  return searchParams.toString();
}

export function searchTranscripts(params: TranscriptSearchParams, signal?: AbortSignal) {
  return request<TranscriptSearchResponse>(`/api/search/transcripts?${transcriptSearchQuery(params)}`, { signal });
}
