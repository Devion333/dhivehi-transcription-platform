export const transcriptPageSize = 20;

export const transcriptStatusFilters = [
  { value: "all", label: "All statuses" },
  { value: "uploaded", label: "Uploaded" },
  { value: "processing", label: "Processing" },
  { value: "diarized", label: "Speaker separated" },
  { value: "transcribed", label: "Transcribed" },
  { value: "failed", label: "Failed" },
] as const;

export function normalizePageParam(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeSearchParam(value: string | null | undefined) {
  return (value ?? "").trim();
}

export function normalizeStatusParam(value: string | null | undefined) {
  const status = (value ?? "all").trim();
  return transcriptStatusFilters.some((option) => option.value === status) ? status : "all";
}

export const transcriptReviewProgressFilters = [
  { value: "all", label: "All reviews" },
  { value: "not_reviewed", label: "Not reviewed" },
  { value: "in_progress", label: "In progress" },
  { value: "fully_reviewed", label: "Fully reviewed" },
] as const;

export function normalizeReviewProgressParam(value: string | null | undefined) {
  const rp = (value ?? "all").trim();
  return transcriptReviewProgressFilters.some((option) => option.value === rp) ? rp : "all";
}

export function buildTranscriptListPath({
  page = 1,
  search = "",
  status = "all",
  folderId = "",
  reviewProgress = "all",
}: {
  page?: number;
  search?: string;
  status?: string;
  folderId?: string;
  reviewProgress?: string;
}) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (search.trim()) params.set("search", search.trim());
  if (status && status !== "all") params.set("status", status);
  if (folderId.trim()) params.set("folderId", folderId.trim());
  if (reviewProgress && reviewProgress !== "all") params.set("reviewProgress", reviewProgress);
  const query = params.toString();
  return `/Transcripts${query ? `?${query}` : ""}`;
}

export function transcriptDetailPath(jobId: string) {
  return `/Transcripts/Details?job_id=${encodeURIComponent(jobId)}`;
}

export function formatTranscriptDate(value: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

export function fallbackText(value: string | null | undefined, fallback: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "Uncategorized") return fallback;
  return trimmed;
}

export function segmentCountLabel(count: number) {
  return `${count} ${count === 1 ? "segment" : "segments"}`;
}

export function resultSummary(total: number, search: string, status: string) {
  const base = `${total} ${total === 1 ? "transcript" : "transcripts"}`;
  const filters = [];
  if (search) filters.push(`matching "${search}"`);
  if (status !== "all") filters.push(`with status ${status.replace(/_/g, " ")}`);
  return filters.length ? `${base} ${filters.join(" and ")}` : base;
}
