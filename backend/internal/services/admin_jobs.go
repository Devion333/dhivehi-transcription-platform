package services

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
)

const (
	JobStageConversion    = "conversion"
	JobStageDiarization   = "diarization"
	JobStageTranscription = "transcription"
	JobStageAnalysis      = "analysis"
	queueScanLimit        = 200
	workerMaxAttempts     = 3
)

var internalPathPattern = regexp.MustCompile(`(?i)([A-Z]:\\[^\s]+|/[\w.\-/]+|https?://[^\s]+|[\w.-]+:\d+)`)

type AdminJobFilters struct {
	Page       int
	PageSize   int
	Search     string
	Status     string
	Stage      string
	FailedOnly bool
	DateFrom   string
	DateTo     string
}

type queuedJob struct {
	JobID     string
	SegmentID string
	Stage     string
	Payload   map[string]interface{}
}

func ListAdminJobs(ctx context.Context, filters AdminJobFilters) (dtos.AdminJobListResponse, error) {
	filters = normalizeAdminJobFilters(filters)
	parents, err := ListParentTranscriptPoints()
	if err != nil {
		return dtos.AdminJobListResponse{}, err
	}
	segments, err := ListAllSegmentPoints()
	if err != nil {
		return dtos.AdminJobListResponse{}, err
	}
	segmentLookup := segmentsByParent(segments)
	items := make([]dtos.AdminJobSummary, 0, len(parents))
	for _, parent := range parents {
		summary := adminJobSummary(parent.Payload, segmentLookup[getString(parent.Payload, "job_id", "")])
		if !adminJobMatchesFilters(parent.Payload, summary, filters) {
			continue
		}
		items = append(items, summary)
	}
	sort.SliceStable(items, func(i, j int) bool {
		leftUpdated := parseTimeOrZero(items[i].UpdatedAt)
		rightUpdated := parseTimeOrZero(items[j].UpdatedAt)
		if !leftUpdated.Equal(rightUpdated) {
			return leftUpdated.After(rightUpdated)
		}
		leftCreated := parseTimeOrZero(items[i].CreatedAt)
		rightCreated := parseTimeOrZero(items[j].CreatedAt)
		if !leftCreated.Equal(rightCreated) {
			return leftCreated.After(rightCreated)
		}
		return items[i].JobID > items[j].JobID
	})
	return paginateAdminJobs(items, filters.Page, filters.PageSize), nil
}

func GetAdminJob(ctx context.Context, jobID string) (dtos.AdminJobDetail, error) {
	parent, err := getAdminParent(jobID)
	if err != nil {
		return dtos.AdminJobDetail{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.AdminJobDetail{}, err
	}
	summary := adminJobSummary(parent.Payload, segments)
	queueState, retryCount := jobQueueState(ctx, summary.CurrentStage, jobID, segments)
	if retryCount > 0 {
		summary.Retryable = summary.Retryable && retryCount < workerMaxAttempts
	}
	return dtos.AdminJobDetail{
		AdminJobSummary:   summary,
		Notes:             getString(parent.Payload, "notes", ""),
		RequestedSpeakers: getInt(parent.Payload, "speakers", 0),
		MediaAvailable:    getString(parent.Payload, "minio_url", "") != "",
		PipelineStages:    pipelineStages(parent.Payload, segments),
		QueueState:        queueState,
		RetryCount:        retryCount,
	}, nil
}

func RetryAdminJob(ctx context.Context, jobID, requestedStage string) (dtos.AdminJobSummary, error) {
	parent, err := getAdminParent(jobID)
	if err != nil {
		return dtos.AdminJobSummary{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.AdminJobSummary{}, err
	}
	summary := adminJobSummary(parent.Payload, segments)
	stage := strings.TrimSpace(requestedStage)
	if stage == "" {
		stage = summary.CurrentStage
	}
	if !recognizedStage(stage) || stage != summary.CurrentStage {
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeJobNotRetryable, errors.New("job stage is not retryable"))
	}
	if !summary.Retryable {
		if !strings.Contains(summary.Status, "failed") && summary.AnalysisStatus != "failed" {
			return dtos.AdminJobSummary{}, newServiceError(ErrCodeJobNotFailed, errors.New("job is not failed"))
		}
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeJobNotRetryable, errors.New("job is not retryable"))
	}
	queueState, retryCount := jobQueueState(ctx, stage, jobID, segments)
	if queueState.Queued || queueState.Processing {
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeJobAlreadyQueued, errors.New("job is already queued or processing"))
	}
	if retryCount >= workerMaxAttempts {
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeJobRetryLimitReached, errors.New("job retry limit reached"))
	}
	if WorkerAvailability(ctx, stage) == WorkerAvailabilityUnavailable {
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeWorkerUnavailable, errors.New("target worker is unavailable"))
	}
	if stage == JobStageAnalysis {
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeJobNotRetryable, errors.New("analysis retry uses the existing analysis endpoint"))
	}
	payloads, err := retryPayloads(stage, parent.Payload, segments, retryCount)
	if err != nil {
		return dtos.AdminJobSummary{}, err
	}
	newStatus := retryStatus(stage)
	if err := UpdateParentPayload(jobID, map[string]interface{}{"status": newStatus, "updated_at": time.Now().UTC().Format(time.RFC3339)}); err != nil {
		return dtos.AdminJobSummary{}, newServiceError(ErrCodeUpstream, err)
	}
	for _, payload := range payloads {
		if err := EnqueueRetry(ctx, stage, payload); err != nil {
			return dtos.AdminJobSummary{}, err
		}
	}
	updated := copyPayload(parent.Payload)
	updated["status"] = newStatus
	updated["updated_at"] = time.Now().UTC().Format(time.RFC3339)
	return adminJobSummary(updated, segments), nil
}

func GetAdminJobHealth(ctx context.Context) dtos.AdminJobHealthResponse {
	response := dtos.AdminJobHealthResponse{Backend: "healthy", Redis: "healthy", Qdrant: "healthy", Minio: "healthy", Queues: map[string]dtos.QueueCounts{}, Workers: GetWorkerAvailabilitySummary(ctx)}
	if err := CheckRedisReady(ctx); err != nil {
		response.Redis = "unavailable"
	}
	if err := CheckQdrantReady(); err != nil {
		response.Qdrant = "unavailable"
	}
	if err := CheckMinIOReady(ctx); err != nil {
		response.Minio = "unavailable"
	}
	for _, stage := range []string{JobStageConversion, JobStageDiarization, JobStageTranscription} {
		response.Queues[stage] = queueCounts(ctx, stage)
	}
	return response
}

func NewJobNotFoundError() error {
	return newServiceError(ErrCodeJobNotFound, errors.New("job not found"))
}

func NewJobNotFailedError() error {
	return newServiceError(ErrCodeJobNotFailed, errors.New("job is not failed"))
}

func NewJobAlreadyQueuedError() error {
	return newServiceError(ErrCodeJobAlreadyQueued, errors.New("job is already queued or processing"))
}

func NewJobNotRetryableError(err error) error {
	return newServiceError(ErrCodeJobNotRetryable, err)
}

func NewWorkerUnavailableError() error {
	return newServiceError(ErrCodeWorkerUnavailable, errors.New("target worker is unavailable"))
}

func IsJobQueued(ctx context.Context, stage, jobID string) bool {
	return listContainsJob(ctx, queueName(stage, "queued"), stage, jobID, nil)
}

func IsJobProcessing(ctx context.Context, stage, jobID string) bool {
	name := queueName(stage, "processing")
	return name != "" && listContainsJob(ctx, name, stage, jobID, nil)
}

func EnqueueRetry(ctx context.Context, stage string, payload map[string]interface{}) error {
	if RedisClient == nil {
		return newServiceError(ErrCodeJobQueueUnavailable, errors.New("redis client is not initialized"))
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return newServiceError(ErrCodeInternal, err)
	}
	if err := RedisClient.LPush(ctx, queueName(stage, "queued"), string(data)).Err(); err != nil {
		return newServiceError(ErrCodeJobQueueUnavailable, err)
	}
	return nil
}

func SafeFailureMessage(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = strings.Join(strings.Fields(value), " ")
	value = internalPathPattern.ReplaceAllString(value, "[redacted]")
	for _, marker := range []string{"Traceback", "panic:", "File \"", "goroutine "} {
		if index := strings.Index(value, marker); index >= 0 {
			value = strings.TrimSpace(value[:index])
		}
	}
	if len([]rune(value)) > 180 {
		value = string([]rune(value)[:177]) + "..."
	}
	return value
}

func adminJobSummary(parent map[string]interface{}, segments []QdrantPoint) dtos.AdminJobSummary {
	status := getString(parent, "status", "uploaded")
	stage := currentStage(status, getString(parent, "analysis_status", "not_started"), segments)
	failureMessage := failureMessage(parent, segments)
	createdAt := getString(parent, "timestamp", "")
	updatedAt := firstString(parent, "updated_at", "analysis_completed_at", "transcription_completed_at", "diarization_completed_at", "timestamp")
	return dtos.AdminJobSummary{JobID: getString(parent, "job_id", ""), Filename: getString(parent, "filename", "Unknown"), ReferenceNumber: getString(parent, "reference_number", "N/A"), Category: getString(parent, "category", "Uncategorized"), Status: canonicalJobStatus(status, getString(parent, "analysis_status", "not_started"), segments), CurrentStage: stage, SegmentCount: segmentCount(parent, segments), AnalysisStatus: canonicalAnalysisStatus(getString(parent, "analysis_status", "not_started")), CreatedAt: createdAt, UpdatedAt: updatedAt, FailureCode: failureCode(stage, failureMessage), FailureMessage: failureMessage, Retryable: retryableStage(stage, status, parent, segments)}
}

func currentStage(status, analysisStatus string, segments []QdrantPoint) string {
	switch status {
	case "conversion_failed", "converting", "uploaded":
		return JobStageConversion
	case "diarization_failed", "diarizing":
		return JobStageDiarization
	case "transcription_failed", "transcribing", "diarized":
		return JobStageTranscription
	}
	for _, segment := range segments {
		if getString(segment.Payload, "status", "") == "transcription_failed" {
			return JobStageTranscription
		}
	}
	if analysisStatus == "failed" || analysisStatus == "analysis_failed" || analysisStatus == "processing" {
		return JobStageAnalysis
	}
	return "complete"
}

func canonicalJobStatus(status, analysisStatus string, segments []QdrantPoint) string {
	for _, segment := range segments {
		if getString(segment.Payload, "status", "") == "transcription_failed" {
			return "transcription_failed"
		}
	}
	if analysisStatus == "processing" || analysisStatus == "analysis_pending" {
		return "analysis_processing"
	}
	if analysisStatus == "complete" || analysisStatus == "analysis_complete" || analysisStatus == "completed" {
		return "analysis_complete"
	}
	if analysisStatus == "failed" || analysisStatus == "analysis_failed" {
		return "analysis_failed"
	}
	return status
}

func canonicalAnalysisStatus(status string) string {
	if status == "" {
		return "not_started"
	}
	return publicAnalysisStatus(status)
}

func retryableStage(stage, status string, parent map[string]interface{}, segments []QdrantPoint) bool {
	switch stage {
	case JobStageConversion:
		return status == "conversion_failed" && getString(parent, "minio_url", "") != ""
	case JobStageDiarization:
		return status == "diarization_failed" && getString(parent, "minio_url", "") != ""
	case JobStageTranscription:
		for _, segment := range segments {
			if getString(segment.Payload, "status", "") == "transcription_failed" {
				return true
			}
		}
		return status == "transcription_failed"
	case JobStageAnalysis:
		return getString(parent, "analysis_status", "") == "failed"
	default:
		return false
	}
}

func failureMessage(parent map[string]interface{}, segments []QdrantPoint) string {
	for _, key := range []string{"conversion_error", "diarization_error", "transcription_error", "analysis_error", "failure_message", "error"} {
		if message := SafeFailureMessage(getString(parent, key, "")); message != "" {
			return message
		}
	}
	for _, segment := range segments {
		if message := SafeFailureMessage(getString(segment.Payload, "transcription_error", "")); message != "" {
			return message
		}
	}
	return ""
}

func failureCode(stage, message string) string {
	if message == "" {
		return ""
	}
	return strings.ToUpper(stage) + "_FAILED"
}

func pipelineStages(parent map[string]interface{}, segments []QdrantPoint) []dtos.PipelineStage {
	status := getString(parent, "status", "uploaded")
	return []dtos.PipelineStage{
		{Name: JobStageConversion, Status: stageStatus(JobStageConversion, status, parent, segments), CompletedAt: firstString(parent, "conversion_completed_at")},
		{Name: JobStageDiarization, Status: stageStatus(JobStageDiarization, status, parent, segments), CompletedAt: firstString(parent, "diarization_completed_at"), FailureMessage: SafeFailureMessage(getString(parent, "diarization_error", ""))},
		{Name: JobStageTranscription, Status: stageStatus(JobStageTranscription, status, parent, segments), CompletedAt: firstString(parent, "transcription_completed_at"), FailureMessage: failureMessage(map[string]interface{}{}, segments)},
		{Name: JobStageAnalysis, Status: canonicalAnalysisStatus(getString(parent, "analysis_status", "not_started")), CompletedAt: firstString(parent, "analysis_completed_at"), FailureMessage: SafeFailureMessage(getString(parent, "analysis_error", ""))},
	}
}

func stageStatus(stage, status string, parent map[string]interface{}, segments []QdrantPoint) string {
	switch stage {
	case JobStageConversion:
		if status == "conversion_failed" {
			return "failed"
		}
		if status == "uploaded" || status == "converting" {
			return "processing"
		}
		return "complete"
	case JobStageDiarization:
		if status == "diarization_failed" {
			return "failed"
		}
		if status == "diarizing" {
			return "processing"
		}
		if getString(parent, "diarization_completed_at", "") != "" || status == "diarized" || status == "transcribed" {
			return "complete"
		}
		return "pending"
	case JobStageTranscription:
		for _, segment := range segments {
			if getString(segment.Payload, "status", "") == "transcription_failed" {
				return "failed"
			}
		}
		if status == "transcription_failed" {
			return "failed"
		}
		if status == "transcribing" || status == "diarized" {
			return "processing"
		}
		if status == "transcribed" || status == "completed" || status == "complete" {
			return "complete"
		}
	}
	return "pending"
}

func retryPayloads(stage string, parent map[string]interface{}, segments []QdrantPoint, retryCount int) ([]map[string]interface{}, error) {
	jobID := getString(parent, "job_id", "")
	minioURL := getString(parent, "minio_url", "")
	switch stage {
	case JobStageConversion:
		return []map[string]interface{}{{"file_id": jobID, "minio_url": minioURL, "filename": getString(parent, "filename", "unknown"), "attempts": retryCount}}, nil
	case JobStageDiarization:
		return []map[string]interface{}{{"file_id": jobID, "minio_url": minioURL, "attempts": retryCount}}, nil
	case JobStageTranscription:
		payloads := []map[string]interface{}{}
		for _, segment := range segments {
			if getString(segment.Payload, "status", "") != "transcription_failed" {
				continue
			}
			payloads = append(payloads, map[string]interface{}{"segment_id": SegmentIDFromPayload(jobID, segment.Payload), "file_id": jobID, "start_time": getFloat(segment.Payload, "start_time", 0), "end_time": getFloat(segment.Payload, "end_time", 0), "speaker": getString(segment.Payload, "speaker", "Unknown"), "minio_url": firstString(segment.Payload, "minio_url"), "attempts": retryCount})
		}
		if len(payloads) == 0 {
			return nil, newServiceError(ErrCodeJobNotRetryable, errors.New("no failed segments found"))
		}
		return payloads, nil
	default:
		return nil, newServiceError(ErrCodeJobNotRetryable, errors.New("stage is not retryable"))
	}
}

func retryStatus(stage string) string {
	switch stage {
	case JobStageConversion:
		return "uploaded"
	case JobStageDiarization:
		return "diarizing"
	case JobStageTranscription:
		return "transcribing"
	default:
		return "processing"
	}
}

func jobQueueState(ctx context.Context, stage, jobID string, segments []QdrantPoint) (dtos.JobQueueState, int) {
	state := dtos.JobQueueState{Queued: IsJobQueued(ctx, stage, jobID), Processing: IsJobProcessing(ctx, stage, jobID)}
	retryCount := maxAttemptsInList(ctx, queueName(stage, "failed"), stage, jobID, segments)
	state.Failed = retryCount > 0
	return state, retryCount
}

func queueCounts(ctx context.Context, stage string) dtos.QueueCounts {
	return dtos.QueueCounts{Queued: queueLen(ctx, queueName(stage, "queued")), Processing: queueLen(ctx, queueName(stage, "processing")), Failed: queueLen(ctx, queueName(stage, "failed"))}
}

func queueName(stage, kind string) string {
	switch stage {
	case JobStageConversion:
		if kind == "queued" {
			return "conversion_queue"
		}
	case JobStageDiarization:
		return map[string]string{"queued": "diarization_queue", "processing": "diarization_processing_queue", "failed": "diarization_failed_queue"}[kind]
	case JobStageTranscription:
		return map[string]string{"queued": "transcription_queue", "processing": "transcription_processing_queue", "failed": "transcription_failed_queue"}[kind]
	}
	return ""
}

func queueLen(ctx context.Context, name string) int {
	if RedisClient == nil || name == "" {
		return 0
	}
	return int(RedisClient.LLen(ctx, name).Val())
}

func listContainsJob(ctx context.Context, name, stage, jobID string, segments []QdrantPoint) bool {
	if RedisClient == nil || name == "" {
		return false
	}
	entries, err := RedisClient.LRange(ctx, name, 0, queueScanLimit-1).Result()
	if err != nil {
		return false
	}
	segmentIDs := failedSegmentIDs(jobID, segments)
	for _, entry := range entries {
		job, ok := decodeQueueEntry(entry, stage)
		if !ok {
			continue
		}
		if job.JobID == jobID || segmentIDs[job.SegmentID] {
			return true
		}
	}
	return false
}

func maxAttemptsInList(ctx context.Context, name, stage, jobID string, segments []QdrantPoint) int {
	if RedisClient == nil || name == "" {
		return 0
	}
	entries, err := RedisClient.LRange(ctx, name, 0, queueScanLimit-1).Result()
	if err != nil {
		return 0
	}
	maxAttempts := 0
	segmentIDs := failedSegmentIDs(jobID, segments)
	for _, entry := range entries {
		job, ok := decodeQueueEntry(entry, stage)
		if !ok || (job.JobID != jobID && !segmentIDs[job.SegmentID]) {
			continue
		}
		if attempts := getInt(job.Payload, "attempts", 0); attempts > maxAttempts {
			maxAttempts = attempts
		}
	}
	return maxAttempts
}

func decodeQueueEntry(entry, stage string) (queuedJob, bool) {
	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(entry), &payload); err != nil {
		return queuedJob{}, false
	}
	job := queuedJob{Stage: stage, Payload: payload, JobID: getString(payload, "file_id", ""), SegmentID: getString(payload, "segment_id", "")}
	return job, job.JobID != "" || job.SegmentID != ""
}

func failedSegmentIDs(jobID string, segments []QdrantPoint) map[string]bool {
	result := map[string]bool{}
	for _, segment := range segments {
		if getString(segment.Payload, "status", "") == "transcription_failed" {
			result[SegmentIDFromPayload(jobID, segment.Payload)] = true
		}
	}
	return result
}

func getAdminParent(jobID string) (QdrantPoint, error) {
	parent, err := GetParentTranscriptPoint(jobID)
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) && serviceErr.Code == ErrCodeTranscriptNotFound {
			return QdrantPoint{}, newServiceError(ErrCodeJobNotFound, errors.New("job not found"))
		}
		return QdrantPoint{}, err
	}
	return parent, nil
}

func normalizeAdminJobFilters(filters AdminJobFilters) AdminJobFilters {
	filters.Page, filters.PageSize = NormalizePagination(filters.Page, filters.PageSize)
	filters.Search = strings.ToLower(strings.TrimSpace(filters.Search))
	filters.Status = strings.TrimSpace(filters.Status)
	filters.Stage = strings.TrimSpace(filters.Stage)
	filters.DateFrom = strings.TrimSpace(filters.DateFrom)
	filters.DateTo = strings.TrimSpace(filters.DateTo)
	return filters
}

func adminJobMatchesFilters(parent map[string]interface{}, summary dtos.AdminJobSummary, filters AdminJobFilters) bool {
	if filters.Search != "" && !strings.Contains(strings.ToLower(strings.Join([]string{summary.Filename, summary.ReferenceNumber, summary.Category, summary.JobID}, " ")), filters.Search) {
		return false
	}
	if filters.Status != "" && filters.Status != "all" && summary.Status != filters.Status {
		return false
	}
	if filters.Stage != "" && filters.Stage != "all" && summary.CurrentStage != filters.Stage {
		return false
	}
	if filters.FailedOnly && !strings.Contains(summary.Status, "failed") {
		return false
	}
	created := parseTimeOrZero(getString(parent, "timestamp", ""))
	if filters.DateFrom != "" {
		from, err := time.Parse(time.RFC3339, filters.DateFrom)
		if err == nil && created.Before(from) {
			return false
		}
	}
	if filters.DateTo != "" {
		to, err := time.Parse(time.RFC3339, filters.DateTo)
		if err == nil && created.After(to) {
			return false
		}
	}
	return true
}

func paginateAdminJobs(items []dtos.AdminJobSummary, page, pageSize int) dtos.AdminJobListResponse {
	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	return dtos.AdminJobListResponse{Items: items[start:end], Pagination: dtos.Pagination{Page: page, PageSize: pageSize, Total: total, TotalPages: totalPages, HasNextPage: page < totalPages}}
}

func segmentsByParent(segments []QdrantPoint) map[string][]QdrantPoint {
	result := map[string][]QdrantPoint{}
	for _, segment := range segments {
		jobID := getString(segment.Payload, "parent_job_id", "")
		if jobID != "" {
			result[jobID] = append(result[jobID], segment)
		}
	}
	return result
}

func segmentCount(parent map[string]interface{}, segments []QdrantPoint) int {
	if count := parentSegmentCount(parent); count > 0 {
		return count
	}
	return len(segments)
}

func recognizedStage(stage string) bool {
	return stage == JobStageConversion || stage == JobStageDiarization || stage == JobStageTranscription || stage == JobStageAnalysis
}
