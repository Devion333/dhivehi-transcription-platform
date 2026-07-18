export type TranscriptStatus =
  | "uploaded"
  | "queued_conversion"
  | "processing"
  | "converting"
  | "diarizing"
  | "transcribing"
  | "diarized"
  | "transcribed"
  | "analysing"
  | "completed"
  | "complete"
  | "conversion_failed"
  | "diarization_failed"
  | "transcription_failed"
  | "failed";

export type AnalysisStatus = "not_started" | "processing" | "analysis_pending" | "complete" | "analysis_complete" | "completed" | "failed";

export type AdminJobStage = "conversion" | "diarization" | "transcription" | "analysis" | "complete" | string;

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export type AuthRole = "user" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordResponse {
  message: string;
  reauthenticationRequired: boolean;
}

export interface AccountProfile {
  id: string;
  displayName: string;
  email: string;
  role: AuthRole;
  status: "active" | "inactive";
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AccountProfileResponse {
  profile: AccountProfile;
}

export interface UpdateAccountProfileInput {
  displayName: string;
}

export interface CurrentUserResponse {
  user: AuthUser;
}

export type NotificationType =
  | "transcript_processing_completed"
  | "transcript_processing_failed"
  | "analysis_completed"
  | "analysis_failed"
  | "transcript_assigned";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  eventKey: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NotificationUnreadCountResponse {
  count: number;
}

export interface NotificationReadResponse {
  notification: NotificationItem;
}

export interface NotificationReadAllResponse {
  updated: number;
}

export interface AccountActivityItem {
  id: string;
  action: string;
  title: string;
  description: string;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
}

export interface AccountActivityResponse {
  items: AccountActivityItem[];
  pagination: Pagination;
}

export interface HealthResponse {
  status: string;
  service: string;
  dependencies: Record<string, string>;
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export type AdminUserDetail = AdminUserSummary;

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  pagination: Pagination;
}

export interface AdminUserResponse {
  user: AdminUserDetail;
}

export interface AdminUserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "all" | AuthRole;
  status?: "all" | "active" | "inactive";
}

export interface CreateAdminUserInput {
  name: string;
  email: string;
  role: AuthRole;
  password: string;
}

export interface UpdateAdminUserInput {
  name?: string;
  role?: AuthRole;
}

export interface ResetAdminUserPasswordInput {
  newPassword: string;
}

export type AuditOutcome = "success" | "failure";
export type AuditCategory = "authentication" | "user_management" | "job_management" | "transcript" | "analysis" | "search" | "export";

export interface AuditActor {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
}

export interface AuditEventSummary {
  id: string;
  createdAt: string;
  actor: AuditActor | null;
  action: string;
  category: AuditCategory;
  outcome: AuditOutcome;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
}

export interface AuditEventDetail extends AuditEventSummary {
  userAgent: string;
  metadata: Record<string, unknown>;
}

export interface AuditListResponse {
  items: AuditEventSummary[];
  pagination: Pagination;
}

export interface AuditEventResponse {
  event: AuditEventDetail;
}

export interface AuditListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: "all" | AuditCategory;
  outcome?: "all" | AuditOutcome;
  action?: string;
  actorUserId?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminJobSummary {
  jobId: string;
  filename: string;
  referenceNumber: string;
  category: string;
  status: string;
  currentStage: AdminJobStage;
  segmentCount: number;
  analysisStatus: string;
  createdAt: string;
  updatedAt: string;
  failureCode: string;
  failureMessage: string;
  retryable: boolean;
}

export interface PipelineStage {
  name: string;
  status: string;
  startedAt: string;
  completedAt: string;
  retryCount: number;
  failureMessage: string;
}

export interface JobQueueState {
  queued: boolean;
  processing: boolean;
  failed: boolean;
}

export interface AdminJobDetail extends AdminJobSummary {
  notes: string;
  requestedSpeakers: number;
  mediaAvailable: boolean;
  pipelineStages: PipelineStage[];
  queueState: JobQueueState;
  retryCount: number;
}

export interface AdminJobListResponse {
  items: AdminJobSummary[];
  pagination: Pagination;
}

export interface AdminJobResponse {
  job: AdminJobDetail;
}

export interface AdminJobRetryResponse {
  job: AdminJobSummary;
}

export interface AdminJobListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  stage?: string;
  failedOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminJobRetryInput {
  stage?: string;
}

export interface QueueCounts {
  queued: number;
  processing: number;
  failed: number;
}

export interface WorkerHealthSummary {
  status: "available" | "unavailable" | "unknown";
  instances: number;
  lastHeartbeatAt?: string | null;
}

export interface AdminJobHealthResponse {
  backend: string;
  redis: string;
  qdrant: string;
  minio: string;
  queues: Record<string, QueueCounts>;
  workers: Record<string, WorkerHealthSummary>;
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
  analysisReviewStatus: AnalysisReviewStatus;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerEmail: string;
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
  analysisReviewStatus: AnalysisReviewStatus;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerEmail: string;
  speakerNames: Record<string, string>;
  segments: TranscriptSegment[];
}

export interface TranscriptStatusResponse {
  jobId: string;
  status: TranscriptStatus;
  stage: string;
  isTerminal: boolean;
  updatedAt: string;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface SpeakerRenameResponse {
	speakerKey: string;
	displayName: string;
	speakerNames: Record<string, string>;
	reset: boolean;
}

export interface TranscriptDeletionPreview {
  jobId: string;
  filename: string;
  owner: { displayName: string; email: string };
  segmentCount: number;
  mediaObjects: number;
  status: string;
  canDelete: boolean;
  blockingReason: string | null;
}

export interface TranscriptDeletionResponse {
  jobId: string;
  deleted: boolean;
  segmentCount: number;
  mediaObjectCount: number;
  cleanupCategories: string[];
  partialCleanupCategories?: string[];
}

export interface TranscriptReassignmentOptionsResponse {
  users: AdminUserSummary[];
}

export interface TranscriptReassignmentResponse {
  jobId: string;
  previousOwnerUserId: string;
  newOwner: { displayName: string; email: string };
}

export interface TranscriptAnalysis {
  status: AnalysisStatus;
  keywords: string[];
  entities: unknown;
  summary: string;
  classification: string;
  englishTranslation: string;
  review: AnalysisReview;
}

export type AnalysisReviewStatus = "unreviewed" | "reviewed" | "approved" | "rejected";

export interface AnalysisReview {
  status: AnalysisReviewStatus;
  reviewedByUserId: string | null;
  reviewedByDisplayName: string | null;
  reviewedAt: string | null;
  note: string | null;
}

export interface AnalysisReviewResponse {
  review: AnalysisReview;
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
  segmentId?: string;
  jobId: string;
  filename: string;
  referenceNumber: string;
  category: string;
  transcriptStatus: string;
  createdAt: string;
  ownerUserId?: string;
  ownerDisplayName?: string;
  ownerEmail?: string;
  segmentIndex: number;
  speaker: string;
  speakerDisplayName: string;
  startTime: number;
  endTime: number;
  transcriptText?: string;
  matchedText: string;
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
