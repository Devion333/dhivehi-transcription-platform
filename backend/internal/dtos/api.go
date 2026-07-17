package dtos

type APIErrorBody struct {
	Error APIError `json:"error"`
}

type APIError struct {
	Code    string      `json:"code"`
	Message string      `json:"message"`
	Details interface{} `json:"details"`
}

type AuthUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthUserResponse struct {
	User AuthUser `json:"user"`
}

type AuthMessageResponse struct {
	Message string `json:"message"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
	ConfirmPassword string `json:"confirmPassword"`
}

type ChangePasswordResponse struct {
	Message                  string `json:"message"`
	ReauthenticationRequired bool   `json:"reauthenticationRequired"`
}

type AdminUserSummary struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	Role        string  `json:"role"`
	IsActive    bool    `json:"isActive"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	LastLoginAt *string `json:"lastLoginAt"`
}

type AdminUserDetail = AdminUserSummary

type AdminUserListResponse struct {
	Items      []AdminUserSummary `json:"items"`
	Pagination Pagination         `json:"pagination"`
}

type AdminUserResponse struct {
	User AdminUserDetail `json:"user"`
}

type AdminCreateUserRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Password string `json:"password"`
}

type AdminUpdateUserRequest struct {
	Name *string `json:"name"`
	Role *string `json:"role"`
}

type AdminResetPasswordRequest struct {
	NewPassword string `json:"newPassword"`
}

type AuditActor struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

type AuditEventSummary struct {
	ID           string      `json:"id"`
	CreatedAt    string      `json:"createdAt"`
	Actor        *AuditActor `json:"actor"`
	Action       string      `json:"action"`
	Category     string      `json:"category"`
	Outcome      string      `json:"outcome"`
	ResourceType string      `json:"resourceType"`
	ResourceID   string      `json:"resourceId"`
	IPAddress    string      `json:"ipAddress"`
}

type AuditEventDetail struct {
	AuditEventSummary
	UserAgent string                 `json:"userAgent"`
	Metadata  map[string]interface{} `json:"metadata"`
}

type AuditListResponse struct {
	Items      []AuditEventSummary `json:"items"`
	Pagination Pagination          `json:"pagination"`
}

type AuditEventResponse struct {
	Event AuditEventDetail `json:"event"`
}

type PDFExportAuditRequest struct {
	JobID           string `json:"jobId"`
	Format          string `json:"format"`
	IncludeAnalysis bool   `json:"includeAnalysis"`
	Outcome         string `json:"outcome"`
}

type AdminJobSummary struct {
	JobID           string `json:"jobId"`
	Filename        string `json:"filename"`
	ReferenceNumber string `json:"referenceNumber"`
	Category        string `json:"category"`
	Status          string `json:"status"`
	CurrentStage    string `json:"currentStage"`
	SegmentCount    int    `json:"segmentCount"`
	AnalysisStatus  string `json:"analysisStatus"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	FailureCode     string `json:"failureCode"`
	FailureMessage  string `json:"failureMessage"`
	Retryable       bool   `json:"retryable"`
}

type PipelineStage struct {
	Name           string `json:"name"`
	Status         string `json:"status"`
	StartedAt      string `json:"startedAt"`
	CompletedAt    string `json:"completedAt"`
	RetryCount     int    `json:"retryCount"`
	FailureMessage string `json:"failureMessage"`
}

type JobQueueState struct {
	Queued     bool `json:"queued"`
	Processing bool `json:"processing"`
	Failed     bool `json:"failed"`
}

type AdminJobDetail struct {
	AdminJobSummary
	Notes             string          `json:"notes"`
	RequestedSpeakers int             `json:"requestedSpeakers"`
	MediaAvailable    bool            `json:"mediaAvailable"`
	PipelineStages    []PipelineStage `json:"pipelineStages"`
	QueueState        JobQueueState   `json:"queueState"`
	RetryCount        int             `json:"retryCount"`
}

type AdminJobListResponse struct {
	Items      []AdminJobSummary `json:"items"`
	Pagination Pagination        `json:"pagination"`
}

type AdminJobResponse struct {
	Job AdminJobDetail `json:"job"`
}

type AdminJobRetryRequest struct {
	Stage string `json:"stage"`
}

type AdminJobRetryResponse struct {
	Job AdminJobSummary `json:"job"`
}

type TranscriptDeletionOwner struct {
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
}

type TranscriptDeletionPreview struct {
	JobID          string                  `json:"jobId"`
	Filename       string                  `json:"filename"`
	Owner          TranscriptDeletionOwner `json:"owner"`
	SegmentCount   int                     `json:"segmentCount"`
	MediaObjects   int                     `json:"mediaObjects"`
	Status         string                  `json:"status"`
	CanDelete      bool                    `json:"canDelete"`
	BlockingReason *string                 `json:"blockingReason"`
}

type TranscriptDeletionRequest struct {
	Confirmation string `json:"confirmation"`
}

type TranscriptDeletionResponse struct {
	JobID                    string   `json:"jobId"`
	Deleted                  bool     `json:"deleted"`
	SegmentCount             int      `json:"segmentCount"`
	MediaObjectCount         int      `json:"mediaObjectCount"`
	CleanupCategories        []string `json:"cleanupCategories"`
	PartialCleanupCategories []string `json:"partialCleanupCategories,omitempty"`
}

type QueueCounts struct {
	Queued     int `json:"queued"`
	Processing int `json:"processing"`
	Failed     int `json:"failed"`
}

type WorkerHealthSummary struct {
	Status          string  `json:"status"`
	Instances       int     `json:"instances"`
	LastHeartbeatAt *string `json:"lastHeartbeatAt"`
}

type AdminJobHealthResponse struct {
	Backend string                         `json:"backend"`
	Redis   string                         `json:"redis"`
	Qdrant  string                         `json:"qdrant"`
	Minio   string                         `json:"minio"`
	Queues  map[string]QueueCounts         `json:"queues"`
	Workers map[string]WorkerHealthSummary `json:"workers"`
}

type Pagination struct {
	Page        int  `json:"page"`
	PageSize    int  `json:"pageSize"`
	Total       int  `json:"total"`
	TotalPages  int  `json:"totalPages"`
	HasNextPage bool `json:"hasNextPage"`
}

type TranscriptSummary struct {
	JobID            string `json:"jobId"`
	Filename         string `json:"filename"`
	Category         string `json:"category"`
	ReferenceNumber  string `json:"referenceNumber"`
	Notes            string `json:"notes"`
	Status           string `json:"status"`
	SegmentCount     int    `json:"segmentCount"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
	AnalysisStatus   string `json:"analysisStatus"`
	OwnerUserID      string `json:"ownerUserId"`
	OwnerDisplayName string `json:"ownerDisplayName"`
	OwnerEmail       string `json:"ownerEmail"`
}

type Segment struct {
	ID             string  `json:"id"`
	SegmentIndex   int     `json:"segmentIndex"`
	Speaker        string  `json:"speaker"`
	StartTime      float64 `json:"startTime"`
	EndTime        float64 `json:"endTime"`
	TranscriptText string  `json:"transcriptText"`
	Status         string  `json:"status"`
	MediaURL       string  `json:"mediaUrl"`
}

type TranscriptDetail struct {
	JobID            string            `json:"jobId"`
	Filename         string            `json:"filename"`
	Category         string            `json:"category"`
	ReferenceNumber  string            `json:"referenceNumber"`
	Notes            string            `json:"notes"`
	Status           string            `json:"status"`
	Speakers         int               `json:"speakers"`
	SegmentCount     int               `json:"segmentCount"`
	MediaURL         string            `json:"mediaUrl"`
	CreatedAt        string            `json:"createdAt"`
	UpdatedAt        string            `json:"updatedAt"`
	AnalysisStatus   string            `json:"analysisStatus"`
	OwnerUserID      string            `json:"ownerUserId"`
	OwnerDisplayName string            `json:"ownerDisplayName"`
	OwnerEmail       string            `json:"ownerEmail"`
	SpeakerNames     map[string]string `json:"speakerNames"`
	Segments         []Segment         `json:"segments"`
}

type TranscriptStatusResponse struct {
	JobID          string  `json:"jobId"`
	Status         string  `json:"status"`
	Stage          string  `json:"stage"`
	IsTerminal     bool    `json:"isTerminal"`
	UpdatedAt      string  `json:"updatedAt"`
	FailureCode    *string `json:"failureCode"`
	FailureMessage *string `json:"failureMessage"`
}

type SpeakerRenameRequest struct {
	SpeakerKey  string `json:"speakerKey"`
	DisplayName string `json:"displayName"`
}

type SpeakerRenameResponse struct {
	SpeakerKey   string            `json:"speakerKey"`
	DisplayName  string            `json:"displayName"`
	SpeakerNames map[string]string `json:"speakerNames"`
	Reset        bool              `json:"reset"`
}

type Analysis struct {
	Status             string      `json:"status"`
	Keywords           []string    `json:"keywords"`
	Entities           interface{} `json:"entities"`
	Summary            string      `json:"summary"`
	Classification     string      `json:"classification"`
	EnglishTranslation string      `json:"englishTranslation"`
}

type AnalysisTriggerResponse struct {
	Analysis Analysis `json:"analysis"`
	Message  string   `json:"message"`
}

type TranscriptListResponse struct {
	Items      []TranscriptSummary `json:"items"`
	Pagination Pagination          `json:"pagination"`
}

type TranscriptSearchResult struct {
	SegmentID        string  `json:"segmentId"`
	JobID            string  `json:"jobId"`
	Filename         string  `json:"filename"`
	ReferenceNumber  string  `json:"referenceNumber"`
	Category         string  `json:"category"`
	TranscriptStatus string  `json:"transcriptStatus"`
	SegmentIndex     int     `json:"segmentIndex"`
	Speaker          string  `json:"speaker"`
	StartTime        float64 `json:"startTime"`
	EndTime          float64 `json:"endTime"`
	TranscriptText   string  `json:"transcriptText"`
	MatchExcerpt     string  `json:"matchExcerpt"`
}

type TranscriptSearchResponse struct {
	Query      string                   `json:"query"`
	Items      []TranscriptSearchResult `json:"items"`
	Pagination Pagination               `json:"pagination"`
}

type StatsResponse struct {
	TotalTranscripts int `json:"totalTranscripts"`
	Uploaded         int `json:"uploaded"`
	Diarized         int `json:"diarized"`
	Transcribed      int `json:"transcribed"`
	Failed           int `json:"failed"`
	AnalysisComplete int `json:"analysisComplete"`
	TotalSegments    int `json:"totalSegments"`
}

type SegmentUpdateRequest struct {
	TranscriptText string `json:"transcriptText"`
}

type UploadJob struct {
	JobID            string `json:"jobId"`
	Filename         string `json:"filename"`
	Category         string `json:"category"`
	ReferenceNumber  string `json:"referenceNumber"`
	Notes            string `json:"notes"`
	Status           string `json:"status"`
	CreatedAt        string `json:"createdAt"`
	SpeakerCount     int    `json:"speakerCount"`
	SegmentCount     int    `json:"segmentCount"`
	AnalysisStatus   string `json:"analysisStatus"`
	OwnerUserID      string `json:"ownerUserId"`
	OwnerDisplayName string `json:"ownerDisplayName"`
	OwnerEmail       string `json:"ownerEmail"`
}

type UploadResponse struct {
	Job     UploadJob `json:"job"`
	Message string    `json:"message"`
}
