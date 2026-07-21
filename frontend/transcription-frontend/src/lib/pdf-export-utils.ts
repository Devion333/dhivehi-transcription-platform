// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: pdf-export-utils.ts
// Description: Utility module: pdf-export-utils
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { TranscriptAnalysis, TranscriptDetail } from "./api/types";
import type { PdfExportAnalysis, PdfExportPayload, PdfExportSegment } from "./pdf-export-types";
import { getSpeakerDisplayName } from "./transcript-details-utils";

const MAX_FILENAME_LENGTH = 80;

export function sortPdfSegments(segments: PdfExportSegment[]) {
  return [...segments].sort((left, right) => left.segmentIndex - right.segmentIndex);
}

export function groupSegmentsBySpeaker(segments: PdfExportSegment[]) {
  return sortPdfSegments(segments).reduce<Array<{ speaker: string; text: string }>>((groups, segment) => {
    const text = segment.transcriptText.trim();
    if (!text) return groups;
    const speaker = segment.speaker.trim() || "Unknown speaker";
    const last = groups[groups.length - 1];
    if (last?.speaker === speaker) last.text = `${last.text} ${text}`.trim();
    else groups.push({ speaker, text });
    return groups;
  }, []);
}

export function formatPdfTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizePdfFilename(value: string | undefined | null) {
  const sanitized = (value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();
  return sanitized || "transcript-export";
}

export function pdfDownloadFilename(transcript: { filename?: string; referenceNumber?: string }) {
  return `${sanitizePdfFilename(transcript.referenceNumber || transcript.filename)}-transcript.pdf`;
}

export function hasUsableAnalysis(analysis: TranscriptAnalysis | PdfExportAnalysis | null | undefined) {
  if (!analysis || analysis.status !== "complete") return false;
  const keywords = Array.isArray(analysis.keywords) ? analysis.keywords : [];
  const summary = typeof analysis.summary === "string" ? analysis.summary : "";
  const classification = typeof analysis.classification === "string" ? analysis.classification : "";
  const englishTranslation = typeof analysis.englishTranslation === "string" ? analysis.englishTranslation : "";
  return Boolean(
    summary.trim() ||
      classification.trim() ||
      englishTranslation.trim() ||
      keywords.length > 0 ||
      flattenAnalysisEntities(analysis.entities).length > 0,
  );
}

export function flattenAnalysisEntities(entities: unknown): string[] {
  if (!entities) return [];
  if (Array.isArray(entities)) return entities.map((item) => String(item).trim()).filter(Boolean);
  if (typeof entities === "string") return entities.trim() ? [entities.trim()] : [];
  if (typeof entities !== "object") return [String(entities)];
  return Object.entries(entities).flatMap(([key, value]) => flattenAnalysisEntities(value).map((item) => `${labelFromKey(key)}: ${item}`));
}

export function buildPdfExportPayload(transcript: TranscriptDetail, format: PdfExportPayload["format"], includeAnalysis: boolean, analysis?: TranscriptAnalysis | null): PdfExportPayload {
  return {
    transcript: {
      jobId: transcript.jobId,
      filename: transcript.filename,
      category: transcript.category,
      referenceNumber: transcript.referenceNumber,
      notes: transcript.notes,
      createdAt: transcript.createdAt,
      status: transcript.status,
      speakers: transcript.speakers,
      segmentCount: transcript.segmentCount,
      segments: transcript.segments.map((segment) => ({
        id: segment.id,
        segmentIndex: segment.segmentIndex,
        speaker: getSpeakerDisplayName(segment.speaker, transcript.speakerNames),
        startTime: segment.startTime,
        endTime: segment.endTime,
        transcriptText: segment.transcriptText,
      })),
    },
    format,
    includeAnalysis,
    analysis: includeAnalysis && analysis ? toPdfAnalysis(analysis) : undefined,
  };
}

export function toPdfAnalysis(analysis: TranscriptAnalysis): PdfExportAnalysis {
  return {
    status: analysis.status,
    keywords: Array.isArray(analysis.keywords) ? analysis.keywords : [],
    entities: flattenAnalysisEntities(analysis.entities),
    summary: analysis.summary,
    classification: analysis.classification,
    englishTranslation: analysis.englishTranslation,
    review: analysis.review ?? { status: "unreviewed", reviewedByUserId: null, reviewedByDisplayName: null, reviewedAt: null, note: null },
  };
}

function labelFromKey(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
