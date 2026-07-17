import { request } from "./client";
import type { AnalysisTriggerResponse, SegmentUpdateResponse, SpeakerRenameResponse, TranscriptAnalysis, TranscriptDetail, TranscriptListResponse, TranscriptSegment } from "./types";

export type TranscriptListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
};

export function transcriptListQuery(params: TranscriptListParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search?.trim()) searchParams.set("search", params.search.trim());
  if (params.status?.trim() && params.status !== "all") searchParams.set("status", params.status.trim());
  return searchParams.toString();
}

export function getTranscripts(params: TranscriptListParams = {}, signal?: AbortSignal) {
  const query = transcriptListQuery(params);
  return request<TranscriptListResponse>(`/api/transcripts${query ? `?${query}` : ""}`, { signal });
}

export function getTranscript(jobId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptDetail>(`/api/transcripts/${encodeURIComponent(trimmed)}`, { signal });
}

export function getTranscriptAnalysis(jobId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptAnalysis>(`/api/transcripts/${encodeURIComponent(trimmed)}/analysis`, { signal });
}

export function analyseTranscript(jobId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<AnalysisTriggerResponse>(`/api/transcripts/${encodeURIComponent(trimmed)}/analyse`, { method: "POST", signal });
}

export function updateSegment(
  jobId: string,
  segmentId: string,
  input: { transcriptText: string },
  signal?: AbortSignal,
): Promise<TranscriptSegment> {
  const trimmedJobId = jobId.trim();
  const trimmedSegmentId = segmentId.trim();
  if (!trimmedJobId) throw new Error("A transcript job ID is required");
  if (!trimmedSegmentId) throw new Error("A segment ID is required");

  return request<SegmentUpdateResponse>(
    `/api/transcripts/${encodeURIComponent(trimmedJobId)}/segments/${encodeURIComponent(trimmedSegmentId)}`,
    {
      method: "PATCH",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText: input.transcriptText }),
    },
  ).then((response) => response.segment);
}

export function updateSpeakerName(jobId: string, speakerKey: string, displayName: string, signal?: AbortSignal) {
  const trimmedJobId = jobId.trim();
  if (!trimmedJobId) throw new Error("A transcript job ID is required");
  return request<SpeakerRenameResponse>(`/api/transcripts/${encodeURIComponent(trimmedJobId)}/speakers`, {
    method: "PATCH",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ speakerKey, displayName }),
  });
}
