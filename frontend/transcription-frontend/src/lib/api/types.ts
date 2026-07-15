export type TranscriptStatus =
  | "uploaded"
  | "processing"
  | "converting"
  | "diarizing"
  | "transcribing"
  | "diarized"
  | "transcribed"
  | "completed"
  | "complete"
  | "conversion_failed"
  | "diarization_failed"
  | "transcription_failed"
  | "failed";

export type AnalysisStatus = "not_started" | "processing" | "analysis_pending" | "complete" | "analysis_complete" | "completed" | "failed";

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface StatsResponse {
  totalTranscripts: number;
  uploaded: number;
  diarized: number;
  transcribed: number;
  failed: number;
  analysisComplete: number;
  totalSegments: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface TranscriptSummary {
  jobId: string;
  filename: string;
  category: string;
  referenceNumber: string;
  notes: string;
  status: TranscriptStatus;
  createdAt: string;
  updatedAt: string;
  segmentCount: number;
  analysisStatus: AnalysisStatus;
}

export interface TranscriptSegment {
  id: string;
  segmentIndex: number;
  speaker: string;
  startTime: number;
  endTime: number;
  transcriptText: string;
  status: string;
  mediaUrl: string;
}

export interface TranscriptDetail {
  jobId: string;
  filename: string;
  category: string;
  referenceNumber: string;
  notes: string;
  status: TranscriptStatus;
  speakers: number;
  segmentCount: number;
  mediaUrl: string;
  createdAt: string;
  updatedAt: string;
  analysisStatus: AnalysisStatus;
  segments: TranscriptSegment[];
}

export interface TranscriptAnalysis {
  status: AnalysisStatus;
  keywords: string[];
  entities: unknown;
  summary: string;
  classification: string;
  englishTranslation: string;
}

export interface SegmentUpdateResponse {
  segment: TranscriptSegment;
}

export interface AnalysisTriggerResponse {
  analysis: TranscriptAnalysis;
  message: string;
}

export interface TranscriptListResponse {
  items: TranscriptSummary[];
  pagination: Pagination;
}

export interface TranscriptSearchResult {
  segmentId: string;
  jobId: string;
  filename: string;
  referenceNumber: string;
  category: string;
  transcriptStatus: string;
  segmentIndex: number;
  speaker: string;
  startTime: number;
  endTime: number;
  transcriptText: string;
  matchExcerpt: string;
}

export interface TranscriptSearchResponse {
  query: string;
  items: TranscriptSearchResult[];
  pagination: Pagination;
}

export interface UploadMetadata {
  category?: string;
  referenceNumber?: string;
  notes?: string;
  requestedSpeakers?: number;
}

export interface UploadJob {
  jobId: string;
  filename: string;
  category: string;
  referenceNumber: string;
  notes: string;
  status: TranscriptStatus;
  createdAt: string;
  speakerCount: number;
  segmentCount: number;
  analysisStatus: AnalysisStatus;
}

export interface UploadResult {
  job: UploadJob;
  message: string;
}
