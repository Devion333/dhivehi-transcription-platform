import type { AnalysisReviewStatus } from "@/lib/api/types";
import { sectionToneClasses } from "@/lib/section-styles";

const labels: Record<AnalysisReviewStatus, string> = {
  unreviewed: "Unreviewed",
  reviewed: "Reviewed",
  approved: "Approved",
  rejected: "Rejected",
};

const tones: Record<AnalysisReviewStatus, keyof typeof sectionToneClasses> = {
  unreviewed: "neutral",
  reviewed: "transcript",
  approved: "success",
  rejected: "danger",
};

export function normalizeAnalysisReviewStatus(status?: string | null): AnalysisReviewStatus {
  if (status === "reviewed" || status === "approved" || status === "rejected" || status === "unreviewed") return status;
  return "unreviewed";
}

export function analysisReviewStatusLabel(status?: string | null) {
  return labels[normalizeAnalysisReviewStatus(status)];
}

export function analysisReviewStatusBadgeClass(status?: string | null) {
  return sectionToneClasses[tones[normalizeAnalysisReviewStatus(status)]].panel;
}
