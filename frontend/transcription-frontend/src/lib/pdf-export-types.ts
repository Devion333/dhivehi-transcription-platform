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

export type PdfExportAnalysis = Pick<TranscriptAnalysis, "status" | "keywords" | "summary" | "classification" | "englishTranslation"> & {
  status: AnalysisStatus | string;
  entities: string[];
};

export type PdfExportPayload = {
  transcript: PdfExportTranscript;
  format: PdfExportFormat;
  includeAnalysis: boolean;
  analysis?: PdfExportAnalysis;
};
