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

type Pagination struct {
	Page        int  `json:"page"`
	PageSize    int  `json:"pageSize"`
	Total       int  `json:"total"`
	TotalPages  int  `json:"totalPages"`
	HasNextPage bool `json:"hasNextPage"`
}

type TranscriptSummary struct {
	JobID           string `json:"jobId"`
	Filename        string `json:"filename"`
	Category        string `json:"category"`
	ReferenceNumber string `json:"referenceNumber"`
	Notes           string `json:"notes"`
	Status          string `json:"status"`
	SegmentCount    int    `json:"segmentCount"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
	AnalysisStatus  string `json:"analysisStatus"`
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
	JobID           string    `json:"jobId"`
	Filename        string    `json:"filename"`
	Category        string    `json:"category"`
	ReferenceNumber string    `json:"referenceNumber"`
	Notes           string    `json:"notes"`
	Status          string    `json:"status"`
	Speakers        int       `json:"speakers"`
	SegmentCount    int       `json:"segmentCount"`
	MediaURL        string    `json:"mediaUrl"`
	CreatedAt       string    `json:"createdAt"`
	UpdatedAt       string    `json:"updatedAt"`
	AnalysisStatus  string    `json:"analysisStatus"`
	Segments        []Segment `json:"segments"`
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
	JobID           string `json:"jobId"`
	Filename        string `json:"filename"`
	Category        string `json:"category"`
	ReferenceNumber string `json:"referenceNumber"`
	Notes           string `json:"notes"`
	Status          string `json:"status"`
	CreatedAt       string `json:"createdAt"`
	SpeakerCount    int    `json:"speakerCount"`
	SegmentCount    int    `json:"segmentCount"`
	AnalysisStatus  string `json:"analysisStatus"`
}

type UploadResponse struct {
	Job     UploadJob `json:"job"`
	Message string    `json:"message"`
}
