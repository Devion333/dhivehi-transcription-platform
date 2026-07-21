// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: settings.go
// Description: HTTP handler for settings
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"net/http"

	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

type restoreSettingsRequest struct {
	Confirm bool `json:"confirm"`
}

func APIGetPublicSettings(c *gin.Context) {
	settings, err := services.GetPublicSystemSettings(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func APIAdminGetSettings(c *gin.Context) {
	settings, err := services.GetSystemSettings(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, settings)
}

func APIAdminUpdateSettings(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	var request services.SystemSettings
	if !decodeStrictAPIJSON(c, &request) {
		return
	}
	settings, changes, err := services.UpdateSystemSettings(c.Request.Context(), request, user.ID)
	if err != nil {
		auditRequestEvent(c, services.AuditEventInput{Action: "system_settings_update_failed", Category: "system", Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"changedFields": []string{}}})
		writeServiceError(c, err)
		return
	}
	fields := make([]string, 0, len(changes))
	for _, change := range changes {
		fields = append(fields, change.Field)
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "system_settings_updated", Category: "system", Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"changedFields": fields, "changes": changes}})
	c.JSON(http.StatusOK, gin.H{"settings": settings, "changedFields": fields})
}

func APIAdminRestoreDefaultSettings(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	var request restoreSettingsRequest
	if !decodeStrictAPIJSON(c, &request) {
		return
	}
	if !request.Confirm {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Confirmation is required", nil)
		return
	}
	settings, err := services.RestoreDefaultSystemSettings(c.Request.Context(), user.ID)
	if err != nil {
		auditRequestEvent(c, services.AuditEventInput{Action: "system_settings_restore_failed", Category: "system", Outcome: services.AuditOutcomeFailure})
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "system_settings_restored", Category: "system", Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"changedFields": []string{"all"}}})
	c.JSON(http.StatusOK, gin.H{"settings": settings})
}
