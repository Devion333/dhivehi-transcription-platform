import type { TranscriptStatus } from "./api/types";

export const transcriptStatusLabels: Record<string, string> = {
  queued_conversion: "Queued for conversion",
  uploaded: "Queued for conversion",
  processing: "Processing",
  converting: "Converting audio",
  diarizing: "Identifying speakers",
  transcribing: "Transcribing audio",
  diarized: "Transcribing audio",
  transcribed: "Transcript ready",
  analysing: "Analysing transcript",
  analysis_processing: "Analysing transcript",
  complete: "Complete",
  completed: "Complete",
  analysis_complete: "Analysis complete",
  not_started: "Not started",
  analysis_pending: "Analysis pending",
  failed: "Processing failed",
  conversion_failed: "Processing failed",
  diarization_failed: "Processing failed",
  transcription_failed: "Processing failed",
};

export function transcriptStatusLabel(status: string) {
  return transcriptStatusLabels[status] ?? status.replace(/_/g, " ");
}

export function isTerminalTranscriptStatus(status: string) {
  return ["complete", "completed", "transcribed", "failed", "conversion_failed", "diarization_failed", "transcription_failed"].includes(status);
}

export function isProcessingTranscriptStatus(status: string) {
  return !isTerminalTranscriptStatus(status) && ["queued_conversion", "uploaded", "processing", "converting", "diarizing", "diarized", "transcribing", "analysing", "analysis_processing", "analysis_pending"].includes(status);
}

export function withTranscriptStatus<T extends { status: TranscriptStatus; updatedAt?: string }>(item: T, status: { status: TranscriptStatus; updatedAt: string }): T {
  return { ...item, status: status.status, updatedAt: status.updatedAt || item.updatedAt };
}
