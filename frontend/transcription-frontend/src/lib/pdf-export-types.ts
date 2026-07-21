// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: pdf-export-types.ts
// Description: Utility module: pdf-export-types
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { AnalysisStatus, TranscriptAnalysis, TranscriptDetail, TranscriptSegment, TranscriptStatus } from "./api/types";

export type PdfExportFormat = "segmented" | "paragraph";

export type PdfExportSegment = Pick<TranscriptSegment, "id" | "segmentIndex" | "speaker" | "startTime" | "endTime" | "transcriptText">;

export type PdfExportTranscript = Pick<
  TranscriptDetail,
  "jobId" | "filename" | "category" | "referenceNumber" | "notes" | "createdAt" | "speakers" | "segmentCount"
> & {
  status: TranscriptStatus | string;
  segments: PdfExportSegment[];
};

export type PdfExportAnalysis = Pick<TranscriptAnalysis, "status" | "keywords" | "summary" | "classification" | "englishTranslation" | "review"> & {
  status: AnalysisStatus | string;
  entities: string[];
};

export type PdfExportPayload = {
  transcript: PdfExportTranscript;
  format: PdfExportFormat;
  includeAnalysis: boolean;
  analysis?: PdfExportAnalysis;
};
