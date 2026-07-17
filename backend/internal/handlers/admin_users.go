package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

const adminJSONMaxBytes = 1 << 20

func APIAdminListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	response, err := services.ListAdminUsers(c.Request.Context(), services.AdminUserFilters{
		Page: page, PageSize: pageSize, Search: c.Query("search"), Role: c.Query("role"), Status: c.Query("status"),
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func APIAdminCreateUser(c *gin.Context) {
	var request dtos.AdminCreateUserRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	user, err := services.CreateAdminUser(c.Request.Context(), services.AdminCreateUserInput{Name: request.Name, Email: request.Email, Role: request.Role, Password: request.Password})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.user_created", Category: "user_management", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"targetUserId": user.ID, "targetRole": user.Role}})
	c.JSON(http.StatusCreated, dtos.AdminUserResponse{User: user})
}

func APIAdminGetUser(c *gin.Context) {
	user, err := services.GetAdminUser(c.Request.Context(), c.Param("userId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminUpdateUser(c *gin.Context) {
	var request dtos.AdminUpdateUserRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	actor, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	previous, _ := services.GetAdminUser(c.Request.Context(), c.Param("userId"))
	user, err := services.UpdateAdminUser(c.Request.Context(), actor.ID, c.Param("userId"), services.AdminUpdateUserInput{Name: request.Name, Role: request.Role})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	changed := []string{}
	if request.Name != nil {
		changed = append(changed, "name")
	}
	if request.Role != nil {
		changed = append(changed, "role")
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.user_updated", Category: "user_management", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"targetUserId": user.ID, "changedFields": changed, "previousRole": previous.Role, "newRole": user.Role}})
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminActivateUser(c *gin.Context) {
	previous, _ := services.GetAdminUser(c.Request.Context(), c.Param("userId"))
	user, err := services.ActivateAdminUser(c.Request.Context(), c.Param("userId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.user_activated", Category: "user_management", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"targetUserId": user.ID, "previousActiveState": previous.IsActive, "newActiveState": user.IsActive}})
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminDeactivateUser(c *gin.Context) {
	actor, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	previous, _ := services.GetAdminUser(c.Request.Context(), c.Param("userId"))
	user, err := services.DeactivateAdminUser(c.Request.Context(), actor.ID, c.Param("userId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.user_deactivated", Category: "user_management", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"targetUserId": user.ID, "previousActiveState": previous.IsActive, "newActiveState": user.IsActive, "sessionsRevoked": true}})
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminResetUserPassword(c *gin.Context) {
	var request dtos.AdminResetPasswordRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	userID := c.Param("userId")
	if err := services.ResetAdminUserPassword(c.Request.Context(), userID, request.NewPassword); err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "admin.password_reset", Category: "user_management", ResourceType: "user", ResourceID: userID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"targetUserId": userID, "sessionsRevoked": true}})
	c.JSON(http.StatusOK, dtos.AuthMessageResponse{Message: "Password updated"})
}

func decodeAdminJSON(c *gin.Context, target interface{}) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, adminJSONMaxBytes)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request is invalid", nil)
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request is invalid", nil)
		return false
	}
	return true
}
