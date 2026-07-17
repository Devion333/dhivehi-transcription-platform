package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func APIAdminListAuditEvents(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "50"))
	response, err := services.ListAuditEvents(c.Request.Context(), services.AuditFilters{
		Page: page, PageSize: pageSize, Search: c.Query("search"), Category: c.Query("category"), Action: c.Query("action"), Outcome: c.Query("outcome"), ActorUserID: c.Query("actorUserId"), ResourceType: c.Query("resourceType"), ResourceID: c.Query("resourceId"), DateFrom: c.Query("dateFrom"), DateTo: c.Query("dateTo"),
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func APIAdminGetAuditEvent(c *gin.Context) {
	event, err := services.GetAuditEvent(c.Request.Context(), c.Param("eventId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AuditEventResponse{Event: event})
}

func APIAuditPDFExport(c *gin.Context) {
	var request dtos.PDFExportAuditRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	outcome := strings.TrimSpace(request.Outcome)
	action := "export.pdf_generated"
	if outcome == services.AuditOutcomeFailure {
		action = "export.pdf_failed"
	} else if outcome != services.AuditOutcomeSuccess {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeInvalidAuditEvent, "Audit event is invalid", nil)
		return
	}
	jobID := strings.TrimSpace(request.JobID)
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	format := strings.TrimSpace(request.Format)
	if format != "segmented" && format != "paragraph" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "format is invalid", nil)
		return
	}
	if _, err := services.GetAuthorizedParentTranscriptPoint(transcriptAccessScope(c), jobID); err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: action, Category: "export", ResourceType: "transcript", ResourceID: jobID, Outcome: outcome, Metadata: map[string]interface{}{"jobId": jobID, "format": format, "includeAnalysis": request.IncludeAnalysis}})
	c.JSON(http.StatusOK, dtos.AuthMessageResponse{Message: "Audit recorded"})
}
