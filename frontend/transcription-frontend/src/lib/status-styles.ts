// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: status-styles.ts
// Description: Utility module: status-styles
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { sectionToneClasses, type SectionTone } from "@/lib/section-styles";

const transcriptStatusTones: Record<string, SectionTone> = {
  queued_conversion: "transcript",
  uploaded: "transcript",
  queued: "transcript",
  processing: "warning",
  converting: "warning",
  diarizing: "notification",
  diarized: "notification",
  transcribing: "transcript",
  transcribed: "success",
  analysing: "analysis",
  analyzing: "analysis",
  complete: "success",
  completed: "success",
  analysis_complete: "success",
  not_started: "neutral",
  analysis_pending: "warning",
  failed: "danger",
  conversion_failed: "danger",
  diarization_failed: "danger",
  transcription_failed: "danger",
  unavailable: "danger",
};

const reviewStatusTones: Record<string, SectionTone> = {
  unreviewed: "neutral",
  reviewed: "transcript",
  approved: "success",
  rejected: "danger",
};

export function statusTone(status: string): SectionTone {
  const normalized = status.toLowerCase();
  if (normalized.includes("failed") || normalized === "failure") return "danger";
  if (normalized.includes("analys")) return normalized.includes("complete") ? "success" : "analysis";
  if (normalized.endsWith("ing")) return normalized === "diarizing" ? "notification" : normalized === "transcribing" ? "transcript" : "warning";
  return transcriptStatusTones[normalized] ?? "neutral";
}

export function statusBadgeClass(status: string) {
  return sectionToneClasses[statusTone(status)].panel;
}

export function reviewStatusBadgeClass(status: string) {
  return sectionToneClasses[reviewStatusTones[status.toLowerCase()] ?? "neutral"].panel;
}
