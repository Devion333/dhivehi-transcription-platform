package handlers

import (
	"net/http"
	"strings"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func APIAdminTranscriptReassignmentOptions(c *gin.Context) {
	response, err := services.ListAdminUsers(c.Request.Context(), services.AdminUserFilters{Page: 1, PageSize: 100, Status: "active"})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.TranscriptReassignmentOptionsResponse{Users: response.Items})
}

func APIAdminReassignTranscript(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	var request dtos.TranscriptReassignmentRequest
	if !decodeAdminJSON(c, &request) {
		auditTranscriptReassignmentFailure(c, jobID, "", "")
		return
	}
	previousOwner := ""
	if parent, err := services.GetParentTranscriptPoint(jobID); err == nil {
		previousOwner = services.ParentOwnerUserIDForAudit(parent.Payload)
	}
	result, err := services.ReassignTranscriptOwner(c.Request.Context(), jobID, request.NewOwnerUserID)
	if err != nil {
		auditTranscriptReassignmentFailure(c, jobID, previousOwner, strings.TrimSpace(request.NewOwnerUserID))
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript_reassignment_succeeded", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"jobId": jobID, "previousOwnerUserId": result.PreviousOwnerUserID, "newOwnerUserId": strings.TrimSpace(request.NewOwnerUserID)}})
	c.JSON(http.StatusOK, result)
}

func auditTranscriptReassignmentFailure(c *gin.Context, jobID, previousOwnerUserID, newOwnerUserID string) {
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript_reassignment_failed", Category: "transcript", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"jobId": jobID, "previousOwnerUserId": previousOwnerUserID, "newOwnerUserId": strings.TrimSpace(newOwnerUserID)}})
}
