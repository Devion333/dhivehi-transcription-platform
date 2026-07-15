package handlers

import (
	"context"
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
			auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_failed", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: retryAuditMetadata(jobID, stage, before.Status, "", before.RetryCount, before.FailureCode)})
			writeServiceError(c, err)
			return
		}
		auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_succeeded", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: retryAuditMetadata(jobID, stage, before.Status, job.Status, before.RetryCount, before.FailureCode)})
		c.JSON(http.StatusOK, dtos.AdminJobRetryResponse{Job: job.AdminJobSummary})
		return
	}
	job, err := services.RetryAdminJob(c.Request.Context(), jobID, request.Stage)
	if err != nil {
		auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_failed", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: retryAuditMetadata(jobID, stage, before.Status, "", before.RetryCount, before.FailureCode)})
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.job_retry_succeeded", Category: "job_management", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: retryAuditMetadata(jobID, job.CurrentStage, before.Status, job.Status, before.RetryCount, before.FailureCode)})
	c.JSON(http.StatusOK, dtos.AdminJobRetryResponse{Job: job})
}

func retryAnalysisJob(c *gin.Context, jobID string, before dtos.AdminJobDetail) (dtos.AdminJobDetail, error) {
	if before.AnalysisStatus != "failed" && before.Status != "analysis_failed" {
		return dtos.AdminJobDetail{}, services.NewJobNotFailedError()
	}
	if before.QueueState.Queued || before.QueueState.Processing {
		return dtos.AdminJobDetail{}, services.NewJobAlreadyQueuedError()
	}
	result, analysisErr := runTranscriptAnalysis(jobID)
	if analysisErr != nil {
		_ = services.UpdateParentPayload(jobID, map[string]interface{}{"analysis_status": "failed", "analysis_error": services.SafeFailureMessage(analysisErr.message), "updated_at": time.Now().UTC().Format(time.RFC3339)})
		return dtos.AdminJobDetail{}, services.NewJobNotRetryableError(analysisErr)
	}
	if err := services.UpdateParentPayload(jobID, map[string]interface{}{"analysis_keywords": result.Keywords, "analysis_entities": result.Entities, "analysis_summary": result.Summary, "analysis_classification": result.Classification, "analysis_english_translation": result.EnglishTranslation, "analysis_status": "complete", "updated_at": time.Now().UTC().Format(time.RFC3339)}); err != nil {
		return dtos.AdminJobDetail{}, err
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

func parseBoolQuery(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return value == "true" || value == "1" || value == "yes"
}
