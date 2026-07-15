import type { AdminJobSummary } from "@/lib/api/types";

export const adminJobsPageSize = 20;
export const adminJobStages = ["all", "conversion", "diarization", "transcription", "analysis"] as const;
export const adminJobStatuses = ["all", "uploaded", "converting", "conversion_failed", "diarizing", "diarized", "diarization_failed", "transcribing", "transcribed", "transcription_failed", "analysis_processing", "analysis_complete", "analysis_failed", "failed"] as const;

export type AdminJobStageFilter = (typeof adminJobStages)[number];
export type AdminJobStatusFilter = (typeof adminJobStatuses)[number];

const statusLabels: Record<string, string> = {
  uploaded: "Uploaded",
  converting: "Converting",
  conversion_failed: "Conversion failed",
  diarizing: "Diarizing",
  diarized: "Diarized",
  diarization_failed: "Diarization failed",
  transcribing: "Transcribing",
  transcribed: "Transcribed",
  transcription_failed: "Transcription failed",
  analysis_processing: "Analysis processing",
  analysis_complete: "Analysis complete",
  analysis_failed: "Analysis failed",
  failed: "Failed",
};

export function normalizeAdminJobPage(value: string | null) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function normalizeAdminJobSearch(value: string | null) {
  return (value ?? "").trim().slice(0, 120);
}

export function normalizeAdminJobStage(value: string | null): AdminJobStageFilter {
  return adminJobStages.includes(value as AdminJobStageFilter) ? value as AdminJobStageFilter : "all";
}

export function normalizeAdminJobStatus(value: string | null): AdminJobStatusFilter {
  return adminJobStatuses.includes(value as AdminJobStatusFilter) ? value as AdminJobStatusFilter : "all";
}

export function normalizeAdminJobDate(value: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function toJobRFC3339Date(value: string, endOfDay = false) {
  if (!value) return "";
  return `${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

export function buildAdminJobsPath({ page = 1, search = "", status = "all", stage = "all", failedOnly = false, dateFrom = "", dateTo = "" }: { page?: number; search?: string; status?: AdminJobStatusFilter; stage?: AdminJobStageFilter; failedOnly?: boolean; dateFrom?: string; dateTo?: string }) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (search.trim()) params.set("search", search.trim());
  if (status !== "all") params.set("status", status);
  if (stage !== "all") params.set("stage", stage);
  if (failedOnly) params.set("failedOnly", "true");
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const query = params.toString();
  return `/Admin/Jobs${query ? `?${query}` : ""}`;
}

export function jobStatusLabel(status: string) {
  return statusLabels[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function stageLabel(stage: string) {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatJobDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function canRetryJob(job: AdminJobSummary) {
  return job.retryable;
}

export function retryCopy(job: AdminJobSummary) {
  const stage = stageLabel(job.currentStage);
  return { title: `Retry ${stage.toLowerCase()}?`, body: job.currentStage === "analysis" ? "The analysis will be run again." : `The job will be returned to the ${stage.toLowerCase()} queue.` };
}
