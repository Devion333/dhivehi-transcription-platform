// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcripts.ts
// Description: API client for transcripts
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { request } from "./client";
import { BACKEND_URL } from "@/config";
import type { AnalysisReviewResponse, AnalysisReviewStatus, AnalysisTriggerResponse, BulkReviewResponse, SegmentReviewResponse, SegmentUpdateResponse, SpeakerRenameResponse, TranscriptAnalysis, TranscriptDeletionPreview, TranscriptDeletionResponse, TranscriptDetail, TranscriptListResponse, TranscriptReassignmentOptionsResponse, TranscriptReassignmentResponse, TranscriptSegment, TranscriptStatusResponse } from "./types";

export type TranscriptListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  folderId?: string;
  reviewProgress?: string;
};

export function transcriptListQuery(params: TranscriptListParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.search?.trim()) searchParams.set("search", params.search.trim());
  if (params.status?.trim() && params.status !== "all") searchParams.set("status", params.status.trim());
  if (params.folderId?.trim()) searchParams.set("folderId", params.folderId.trim());
  if (params.reviewProgress?.trim()) searchParams.set("reviewProgress", params.reviewProgress.trim());
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

export function getTranscriptStatus(jobId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptStatusResponse>(`/api/transcripts/${encodeURIComponent(trimmed)}/status`, { signal });
}

export async function downloadTranscript(jobId: string, format: "txt" | "json" | "srt" | "vtt", signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  const response = await fetch(`${BACKEND_URL}/api/transcripts/${encodeURIComponent(trimmed)}/download?format=${encodeURIComponent(format)}`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob();
  return { blob, filename: filenameFromContentDisposition(response.headers.get("Content-Disposition")) ?? `transcript.${format}` };
}

function filenameFromContentDisposition(value: string | null) {
  const match = value?.match(/filename="?([^";]+)"?/i);
  return match?.[1];
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

export function updateAnalysisReview(jobId: string, input: { status: AnalysisReviewStatus; note?: string }, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<AnalysisReviewResponse>(`/api/transcripts/${encodeURIComponent(trimmed)}/analysis/review`, {
    method: "PATCH",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: input.status, note: input.note ?? "" }),
  });
}

export function updateSegmentReview(
  jobId: string,
  segmentId: string,
  isReviewed: boolean,
  signal?: AbortSignal,
): Promise<SegmentReviewResponse> {
  const trimmedJobId = jobId.trim();
  const trimmedSegmentId = segmentId.trim();
  if (!trimmedJobId) throw new Error("A transcript job ID is required");
  if (!trimmedSegmentId) throw new Error("A segment ID is required");

  return request<SegmentReviewResponse>(
    `/api/transcripts/${encodeURIComponent(trimmedJobId)}/segments/${encodeURIComponent(trimmedSegmentId)}/review`,
    {
      method: "PATCH",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isReviewed }),
    },
  );
}

export function bulkUpdateSegmentReview(
  jobId: string,
  isReviewed: boolean,
  signal?: AbortSignal,
): Promise<BulkReviewResponse> {
  const trimmedJobId = jobId.trim();
  if (!trimmedJobId) throw new Error("A transcript job ID is required");

  return request<BulkReviewResponse>(
    `/api/transcripts/${encodeURIComponent(trimmedJobId)}/segments/review`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isReviewed }),
    },
  );
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

export function getTranscriptDeletionPreview(jobId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptDeletionPreview>(`/api/admin/transcripts/${encodeURIComponent(trimmed)}/deletion-preview`, { signal });
}

export function deleteTranscript(jobId: string, confirmation: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptDeletionResponse>(`/api/admin/transcripts/${encodeURIComponent(trimmed)}`, {
    method: "DELETE",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
}

export function getTranscriptReassignmentOptions(jobId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptReassignmentOptionsResponse>(`/api/admin/transcripts/${encodeURIComponent(trimmed)}/reassignment-options`, { signal });
}

export function reassignTranscript(jobId: string, newOwnerUserId: string, signal?: AbortSignal) {
  const trimmed = jobId.trim();
  if (!trimmed) throw new Error("A transcript job ID is required");
  return request<TranscriptReassignmentResponse>(`/api/admin/transcripts/${encodeURIComponent(trimmed)}/reassign`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newOwnerUserId }),
  });
}
