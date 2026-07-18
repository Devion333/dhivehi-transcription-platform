package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func APIAdminListJobs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	result, err := services.ListAdminJobs(c.Request.Context(), services.AdminJobFilters{Page: page, PageSize: pageSize, Search: c.Query("search"), Status: c.Query("status"), Stage: c.Query("stage"), FailedOnly: parseBoolQuery(c.Query("failedOnly")), DateFrom: c.Query("dateFrom"), DateTo: c.Query("dateTo")})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func APIAdminGetJob(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	job, err := services.GetAdminJob(c.Request.Context(), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AdminJobResponse{Job: job})
}

func APIAdminRetryJob(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	var request dtos.AdminJobRetryRequest
	if c.Request.Body != nil && c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&request); err != nil {
			writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request body must be valid JSON", nil)
			return
		}
	}
	before, beforeErr := services.GetAdminJob(c.Request.Context(), jobID)
	if beforeErr != nil {
		writeServiceError(c, beforeErr)
		return
	}
	stage := strings.TrimSpace(request.Stage)
	if stage == "" {
		stage = before.CurrentStage
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_requested", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: retryAuditMetadata(jobID, stage, before.Status, "", before.RetryCount, before.FailureCode)})
	if stage == services.JobStageAnalysis {
		job, err := retryAnalysisJob(c, jobID, before)
		if err != nil {
			auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_failed", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: retryAuditMetadata(jobID, stage, before.Status, "", before.RetryCount, retryFailureCode(err, before.FailureCode))})
			writeServiceError(c, err)
			return
		}
		auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_succeeded", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: retryAuditMetadata(jobID, stage, before.Status, job.Status, before.RetryCount, before.FailureCode)})
		c.JSON(http.StatusOK, dtos.AdminJobRetryResponse{Job: job.AdminJobSummary})
		return
	}
	job, err := services.RetryAdminJob(c.Request.Context(), jobID, request.Stage)
	if err != nil {
		auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_failed", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: retryAuditMetadata(jobID, stage, before.Status, "", before.RetryCount, retryFailureCode(err, before.FailureCode))})
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_succeeded", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: retryAuditMetadata(jobID, job.CurrentStage, before.Status, job.Status, before.RetryCount, before.FailureCode)})
	c.JSON(http.StatusOK, dtos.AdminJobRetryResponse{Job: job})
}

func APIAdminTranscriptDeletionPreview(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	preview, err := services.GetTranscriptDeletionPreview(c.Request.Context(), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript_deletion_previewed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"jobId": jobID, "segmentCount": preview.SegmentCount, "mediaObjectCount": preview.MediaObjects}})
	c.JSON(http.StatusOK, preview)
}

func APIAdminDeleteTranscript(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	var request dtos.TranscriptDeletionRequest
	if !decodeDeletionJSON(c, &request) {
		return
	}
	result, err := services.DeleteAdminTranscript(c.Request.Context(), jobID, request.Confirmation)
	if err != nil {
		var partial *services.TranscriptDeletionPartialError
		if errors.As(err, &partial) {
			auditRequestEvent(c, services.AuditEventInput{Action: "transcript_deletion_failed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"jobId": jobID, "segmentCount": partial.Response.SegmentCount, "mediaObjectCount": partial.Response.MediaObjectCount, "failureCode": services.ErrCodeTranscriptDeletionPartial, "partialCleanupCategories": partial.Response.PartialCleanupCategories}})
			writeAPIError(c, http.StatusConflict, services.ErrCodeTranscriptDeletionPartial, "Transcript deletion partially completed", partial.Response)
			return
		}
		failureCode := deletionFailureCode(err)
		auditRequestEvent(c, services.AuditEventInput{Action: "transcript_deletion_failed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"jobId": jobID, "failureCode": failureCode}})
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript_deletion_succeeded", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"jobId": jobID, "segmentCount": result.SegmentCount, "mediaObjectCount": result.MediaObjectCount}})
	c.JSON(http.StatusOK, result)
}

func decodeDeletionJSON(c *gin.Context, target interface{}) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request body must be valid JSON", nil)
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request body must contain a single JSON object", nil)
		return false
	}
	return true
}

func deletionFailureCode(err error) string {
	var serviceErr *services.ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Code
	}
	return services.ErrCodeInternal
}

func retryAnalysisJob(c *gin.Context, jobID string, before dtos.AdminJobDetail) (dtos.AdminJobDetail, error) {
	if before.AnalysisStatus != "failed" && before.Status != "analysis_failed" {
		return dtos.AdminJobDetail{}, services.NewJobNotFailedError()
	}
	if before.QueueState.Queued || before.QueueState.Processing {
		return dtos.AdminJobDetail{}, services.NewJobAlreadyQueuedError()
	}
	if services.WorkerAvailability(c.Request.Context(), services.JobStageAnalysis) == services.WorkerAvailabilityUnavailable {
		return dtos.AdminJobDetail{}, services.NewWorkerUnavailableError()
	}
	parent, err := services.GetParentTranscriptPoint(jobID)
	if err != nil {
		return dtos.AdminJobDetail{}, err
	}
	result, analysisErr := runTranscriptAnalysis(jobID, services.MapSpeakerNames(parent.Payload))
	if analysisErr != nil {
		failedAt := time.Now().UTC().Format(time.RFC3339Nano)
		_ = services.UpdateParentPayload(jobID, map[string]interface{}{"analysis_status": "failed", "analysis_error": services.SafeFailureMessage(analysisErr.message), "updated_at": failedAt})
		services.NotifyAnalysisFailed(c.Request.Context(), parent.Payload, jobID, failedAt)
		return dtos.AdminJobDetail{}, services.NewJobNotRetryableError(analysisErr)
	}
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := services.UpdateParentPayload(jobID, map[string]interface{}{"analysis_keywords": result.Keywords, "analysis_entities": result.Entities, "analysis_summary": result.Summary, "analysis_classification": result.Classification, "analysis_english_translation": result.EnglishTranslation, "analysis_status": "complete", "analysis_completed_at": completedAt, "updated_at": completedAt}); err != nil {
		return dtos.AdminJobDetail{}, err
	}
	if parent, err := services.GetParentTranscriptPoint(jobID); err == nil {
		services.NotifyAnalysisCompleted(c.Request.Context(), parent.Payload, jobID, completedAt)
	}
	return services.GetAdminJob(c.Request.Context(), jobID)
}

func APIAdminJobHealth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	c.JSON(http.StatusOK, services.GetAdminJobHealth(ctx))
}

func retryAuditMetadata(jobID, stage, previousStatus, newStatus string, retryCount int, failureCode string) map[string]interface{} {
	return map[string]interface{}{"jobId": jobID, "stage": stage, "previousStatus": previousStatus, "newStatus": newStatus, "retryCount": retryCount, "failureCode": failureCode}
}

func retryFailureCode(err error, fallback string) string {
	var serviceErr *services.ServiceError
	if errors.As(err, &serviceErr) && serviceErr.Code == services.ErrCodeWorkerUnavailable {
		return services.ErrCodeWorkerUnavailable
	}
	return fallback
}

func parseBoolQuery(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return value == "true" || value == "1" || value == "yes"
}
