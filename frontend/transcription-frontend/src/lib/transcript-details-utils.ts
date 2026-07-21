// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcript-details-utils.ts
// Description: Utility module: transcript-details-utils
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { TranscriptSegment } from "./api/types";
import { isProcessingTranscriptStatus } from "./transcript-status";

export function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatDuration(start: number, end: number) {
  const totalSecs = Math.round(Math.max(0, end - start));
  const min = Math.floor(totalSecs / 60);
  const sec = totalSecs % 60;
  if (min > 0) return `${min} min ${sec} sec`;
  return `${sec} sec`;
}

export function sortSegments(segments: TranscriptSegment[]) {
  return [...segments].sort((left, right) => left.segmentIndex - right.segmentIndex);
}

export function speakerLabel(speaker: string) {
  const match = speaker.match(/(\d+)$/);
  if (!match) return speaker || "Unknown speaker";
  return `Speaker ${Number(match[1])}`;
}

export function getSpeakerDisplayName(speakerKey: string, speakerNames?: Record<string, string> | null) {
  const mapped = speakerNames?.[speakerKey]?.trim();
  if (mapped) return mapped;
  return speakerKey.trim() || "Unknown speaker";
}

export function isProbablyDhivehi(text: string) {
  return /[\u0780-\u07BF]/.test(text);
}

export function transcriptTextProps(text: string) {
  return {
    dir: isProbablyDhivehi(text) ? "rtl" : "auto",
    className: isProbablyDhivehi(text) ? "transcript-text text-right" : "whitespace-pre-wrap",
  } as const;
}

export function formatDetailDate(value: string) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

export function safeValue(value: string | number | null | undefined, fallback: string) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text && text !== "N/A" ? text : fallback;
}

export function isProcessingStatus(status: string) {
  return isProcessingTranscriptStatus(status);
}

export function findTargetSegment(segments: TranscriptSegment[], segmentId: string) {
  const target = segmentId.trim();
  if (!target) return null;
  return segments.find((segment) => segment.id === target) ?? null;
}
