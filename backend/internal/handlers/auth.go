// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: auth.go
// Description: HTTP handler for auth
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

const authUserContextKey = "authUser"
const authJSONMaxBytes = 32 << 10

func APILogin(c *gin.Context) {
	var request dtos.LoginRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, authJSONMaxBytes)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Email and password are required", nil)
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Email and password are required", nil)
		return
	}
	user, token, err := services.Login(c.Request.Context(), request.Email, request.Password, c.ClientIP())
	if err != nil {
		auditRequestEventWithActor(c, nil, services.AuditEventInput{Action: "auth.login_failed", Category: "authentication", Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"loginIdentifierHash": services.HashAuditIdentifier(request.Email)}})
		writeAuthServiceError(c, err)
		return
	}
	setSessionCookie(c, token)
	auditRequestEventWithActor(c, &user, services.AuditEventInput{Action: "auth.login_succeeded", Category: "authentication", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess})
	c.JSON(http.StatusOK, dtos.AuthUserResponse{User: user})
}

func APILogout(c *gin.Context) {
	token, _ := c.Cookie(services.SessionCookieConfig().Name)
	if err := services.RevokeSession(c.Request.Context(), token); err != nil {
		writeServiceError(c, err)
		return
	}
	clearSessionCookie(c)
	auditRequestEvent(c, services.AuditEventInput{Action: "auth.logout", Category: "authentication", ResourceType: "session", Outcome: services.AuditOutcomeSuccess})
	c.JSON(http.StatusOK, dtos.AuthMessageResponse{Message: "Signed out"})
}

func APIMe(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	c.JSON(http.StatusOK, dtos.AuthUserResponse{User: user})
}

func APIChangePassword(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	var request dtos.ChangePasswordRequest
	if !decodeAuthJSON(c, &request, "Password change request is invalid") {
		auditPasswordChangeFailure(c, user, services.ErrCodeBadRequest)
		return
	}
	if strings.TrimSpace(request.CurrentPassword) == "" || strings.TrimSpace(request.NewPassword) == "" || strings.TrimSpace(request.ConfirmPassword) == "" {
		auditPasswordChangeFailure(c, user, services.ErrCodeBadRequest)
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "All password fields are required", nil)
		return
	}
	if request.NewPassword != request.ConfirmPassword {
		auditPasswordChangeFailure(c, user, services.ErrCodePasswordMismatch)
		writeAPIError(c, http.StatusBadRequest, services.ErrCodePasswordMismatch, "Password confirmation does not match", nil)
		return
	}
	token, _ := c.Cookie(services.SessionCookieConfig().Name)
	if err := services.ChangeOwnPassword(c.Request.Context(), user.ID, request.CurrentPassword, request.NewPassword, token); err != nil {
		auditPasswordChangeFailure(c, user, passwordChangeFailureCode(err))
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "password_change_succeeded", Category: "authentication", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"otherSessionsRevoked": true, "currentSessionPreserved": true}})
	c.JSON(http.StatusOK, dtos.ChangePasswordResponse{Message: "Password changed successfully", ReauthenticationRequired: false})
}

func APIGetAccountProfile(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	profile, err := services.GetOwnProfile(c.Request.Context(), user.ID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "profile_viewed", Category: "authentication", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess})
	c.JSON(http.StatusOK, dtos.AccountProfileResponse{Profile: profile})
}

func APIUpdateAccountProfile(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	var request dtos.UpdateAccountProfileRequest
	if !decodeAuthJSON(c, &request, "Profile update request is invalid") {
		auditProfileUpdateFailure(c, user)
		return
	}
	profile, err := services.UpdateOwnProfile(c.Request.Context(), user.ID, request.DisplayName)
	if err != nil {
		auditProfileUpdateFailure(c, user)
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "profile_updated", Category: "authentication", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"changedFields": []string{"displayName"}}})
	c.JSON(http.StatusOK, dtos.AccountProfileResponse{Profile: profile})
}

func RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token, err := c.Cookie(services.SessionCookieConfig().Name)
		if err != nil || token == "" {
			writeUnauthenticated(c)
			c.Abort()
			return
		}
		user, err := services.AuthenticateSession(c.Request.Context(), token)
		if err != nil {
			writeUnauthenticated(c)
			c.Abort()
			return
		}
		if !maintenanceModeAllows(c, user) {
			c.Abort()
			return
		}
		c.Set(authUserContextKey, user)
		c.Next()
	}
}

func maintenanceModeAllows(c *gin.Context, user dtos.AuthUser) bool {
	if user.Role == services.UserRoleAdmin {
		return true
	}
	if maintenanceRouteAllowed(c.Request.Method, c.Request.URL.Path) {
		return true
	}
	settings, err := services.GetSystemSettings(c.Request.Context())
	if err != nil || !settings.MaintenanceMode {
		return true
	}
	writeMaintenanceModeError(c)
	return false
}

func maintenanceRouteAllowed(method, path string) bool {
	if method == http.MethodOptions || method == http.MethodHead {
		return true
	}
	if method == http.MethodGet {
		return true
	}
	if method == http.MethodPost && (path == "/api/auth/login" || path == "/api/auth/logout") {
		return true
	}
	return false
}

func writeMaintenanceModeError(c *gin.Context) {
	c.JSON(http.StatusServiceUnavailable, gin.H{
		"error":   "maintenance_mode",
		"message": "The system is currently in maintenance mode. Viewing existing content is available, but changes are temporarily disabled.",
	})
}

func RequireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := CurrentUser(c)
		if !ok {
			writeUnauthenticated(c)
			c.Abort()
			return
		}
		if user.Role != role {
			writeAPIError(c, http.StatusForbidden, services.ErrCodeForbidden, "You do not have permission to perform this action", nil)
			c.Abort()
			return
		}
		c.Next()
	}
}

func CurrentUser(c *gin.Context) (dtos.AuthUser, bool) {
	value, ok := c.Get(authUserContextKey)
	if !ok {
		return dtos.AuthUser{}, false
	}
	user, ok := value.(dtos.AuthUser)
	return user, ok
}

func decodeAuthJSON(c *gin.Context, target interface{}, message string) bool {
	mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeAPIError(c, http.StatusUnsupportedMediaType, services.ErrCodeBadRequest, "Content-Type must be application/json", nil)
		return false
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, authJSONMaxBytes)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, message, nil)
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, message, nil)
		return false
	}
	return true
}

func passwordChangeFailureCode(err error) string {
	var serviceErr *services.ServiceError
	if errors.As(err, &serviceErr) {
		return serviceErr.Code
	}
	return services.ErrCodeInternal
}

func auditPasswordChangeFailure(c *gin.Context, user dtos.AuthUser, reason string) {
	auditRequestEventWithActor(c, &user, services.AuditEventInput{Action: "password_change_failed", Category: "authentication", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"reasonCode": reason}})
}

func auditProfileUpdateFailure(c *gin.Context, user dtos.AuthUser) {
	auditRequestEvent(c, services.AuditEventInput{Action: "profile_update_failed", Category: "authentication", ResourceType: "user", ResourceID: user.ID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"changedFields": []string{"displayName"}}})
}

func setSessionCookie(c *gin.Context, token string) {
	config := services.SessionCookieConfig()
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     config.Name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   config.Secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().UTC().Add(config.Lifetime),
		MaxAge:   int(config.Lifetime.Seconds()),
	})
}

func clearSessionCookie(c *gin.Context) {
	config := services.SessionCookieConfig()
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     config.Name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   config.Secure,
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
	})
}

func writeUnauthenticated(c *gin.Context) {
	writeAPIError(c, http.StatusUnauthorized, services.ErrCodeUnauthenticated, "Authentication is required", nil)
}

func writeAuthServiceError(c *gin.Context, err error) {
	var serviceErr *services.ServiceError
	if errors.As(err, &serviceErr) {
		switch serviceErr.Code {
		case services.ErrCodeInvalidCredentials, services.ErrCodeInactiveUser:
			writeAPIError(c, http.StatusUnauthorized, services.ErrCodeUnauthenticated, "Invalid email or password", nil)
			return
		case services.ErrCodeRateLimited:
			writeAPIError(c, http.StatusTooManyRequests, services.ErrCodeRateLimited, "Too many sign-in attempts. Try again later.", nil)
			return
		}
	}
	writeServiceError(c, err)
}
