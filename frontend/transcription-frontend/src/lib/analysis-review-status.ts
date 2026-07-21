// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: analysis-review-status.ts
// Description: Utility module: analysis-review-status
// First Written on: 03/07/2026
// Edited on: 21/07/2026
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

function roundPct(v: number | undefined | null): number {
  if (v == null) return 0;
  return Math.round(v);
}

export function reviewProgressLabel(reviewed: number | undefined | null, total: number | undefined | null, percentage: number | undefined | null): string {
  if (total == null || total === 0) return "â€”";
  const pct = percentage != null ? percentage : (total > 0 ? Math.round(((reviewed ?? 0) / total) * 100) : 0);
  if (pct >= 100) return `Fully Reviewed (${reviewed ?? 0}/${total})`;
  if (pct > 0) return `${pct}% Reviewed (${reviewed ?? 0}/${total})`;
  return "Not Reviewed";
}

export function reviewProgressBadgeClass(percentage: number | undefined | null): string {
  const pct = roundPct(percentage);
  if (pct >= 100) return sectionToneClasses.success.panel;
  if (pct > 0) return sectionToneClasses.transcript.panel;
  return sectionToneClasses.neutral.panel;
}

export function reviewProgressTextClass(percentage: number | undefined | null): string {
  const pct = roundPct(percentage);
  if (pct >= 100) return sectionToneClasses.success.text;
  if (pct > 0) return sectionToneClasses.transcript.text;
  return sectionToneClasses.neutral.text;
}
