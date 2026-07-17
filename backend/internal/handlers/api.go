package handlers

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func APIHealth(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()

	dependencies := map[string]string{
		"database": "ok",
		"qdrant":   "ok",
		"redis":    "ok",
		"minio":    "ok",
	}
	ready := true
	if err := services.CheckDatabaseReady(ctx); err != nil {
		dependencies["database"] = "unavailable"
		ready = false
	}
	if err := services.CheckQdrantReady(); err != nil {
		dependencies["qdrant"] = "unavailable"
		ready = false
	}
	if err := services.CheckRedisReady(ctx); err != nil {
		dependencies["redis"] = "unavailable"
		ready = false
	}
	if err := services.CheckMinIOReady(ctx); err != nil {
		dependencies["minio"] = "unavailable"
		ready = false
	}

	status := http.StatusOK
	state := "ok"
	if !ready {
		status = http.StatusServiceUnavailable
		state = "degraded"
	}
	c.JSON(status, gin.H{
		"status":       state,
		"service":      "transcript-backend",
		"dependencies": dependencies,
	})
}

func APIStats(c *gin.Context) {
	stats, err := services.GetAPIStats(transcriptAccessScope(c))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, stats)
}

func APIListTranscripts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	page, pageSize = services.NormalizePagination(page, pageSize)

	result, err := services.GetAPITranscripts(transcriptAccessScope(c), page, pageSize, c.Query("search"), c.Query("status"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func APISearchTranscripts(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeSearchQueryRequired, "Search query is required", nil)
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	page, pageSize = services.NormalizePagination(page, pageSize)

	result, err := services.SearchTranscriptText(transcriptAccessScope(c), query, page, pageSize, c.Query("status"), c.Query("category"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "search.executed", Category: "search", Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"queryLength": len([]rune(query)), "page": page, "pageSize": pageSize, "statusFilter": c.Query("status"), "categoryFilter": c.Query("category"), "resultCount": len(result.Items)}})
	c.JSON(http.StatusOK, result)
}

func APIGetTranscript(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}

	detail, err := services.GetAPITranscriptDetail(transcriptAccessScope(c), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript.viewed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"jobId": jobID}})
	c.JSON(http.StatusOK, detail)
}

func APIGetTranscriptStatus(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}

	status, err := services.GetAPITranscriptStatus(transcriptAccessScope(c), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, status)
}

func APIUpdateSegment(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	segmentID := strings.TrimSpace(c.Param("segmentId"))
	if jobID == "" || segmentID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId and segmentId are required", nil)
		return
	}

	var raw map[string]json.RawMessage
	if err := c.ShouldBindJSON(&raw); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request body must be valid JSON", nil)
		return
	}
	if len(raw) != 1 {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Only transcriptText can be updated", nil)
		return
	}
	value, ok := raw["transcriptText"]
	if !ok {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "transcriptText is required", nil)
		return
	}
	var transcriptText string
	if err := json.Unmarshal(value, &transcriptText); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "transcriptText must be a string", nil)
		return
	}

	segment, err := services.UpdateSegmentTranscript(transcriptAccessScope(c), jobID, segmentID, transcriptText)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript.segment_updated", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"jobId": jobID, "segmentId": segmentID, "segmentIndex": segment.SegmentIndex, "changedFields": []string{"transcriptText"}}})
	c.JSON(http.StatusOK, gin.H{"segment": segment})
}

func APIUpdateSpeakerName(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	var request dtos.SpeakerRenameRequest
	if !decodeStrictAPIJSON(c, &request) {
		auditRequestEvent(c, services.AuditEventInput{Action: "speaker_rename_failed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"jobId": jobID, "speakerKey": strings.TrimSpace(request.SpeakerKey)}})
		return
	}
	result, err := services.UpdateSpeakerName(transcriptAccessScope(c), jobID, request.SpeakerKey, request.DisplayName)
	if err != nil {
		auditRequestEvent(c, services.AuditEventInput{Action: "speaker_rename_failed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"jobId": jobID, "speakerKey": strings.TrimSpace(request.SpeakerKey)}})
		writeServiceError(c, err)
		return
	}
	action := "speaker_rename_succeeded"
	if result.Reset {
		action = "speaker_name_reset"
	}
	auditRequestEvent(c, services.AuditEventInput{Action: action, Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"jobId": jobID, "speakerKey": result.SpeakerKey}})
	c.JSON(http.StatusOK, result)
}

func APIGetAnalysis(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}

	analysis, err := services.GetStoredAnalysis(transcriptAccessScope(c), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, analysis)
}

func LegacyListTranscripts(c *gin.Context) {
	status := c.Query("status")
	var transcripts []services.TranscriptListItem
	var err error
	if status != "" {
		transcripts, err = services.GetTranscriptsByStatus(transcriptAccessScope(c), status)
	} else {
		transcripts, err = services.GetAllTranscripts(transcriptAccessScope(c))
	}
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "Failed to fetch transcripts", nil)
		return
	}
	c.JSON(http.StatusOK, transcripts)
}

func LegacyTranscriptStats(c *gin.Context) {
	stats, err := services.GetTranscriptStats(transcriptAccessScope(c))
	if err != nil {
		writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "Failed to fetch stats", nil)
		return
	}
	c.JSON(http.StatusOK, stats)
}

var _ = dtos.APIError{}

func decodeStrictAPIJSON(c *gin.Context, target interface{}) bool {
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

func transcriptAccessScope(c *gin.Context) services.TranscriptAccessScope {
	user, ok := CurrentUser(c)
	if !ok {
		return services.TranscriptAccessScope{}
	}
	return services.TranscriptAccessScope{UserID: user.ID, IsAdmin: user.Role == services.UserRoleAdmin}
}
