package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
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
		c.Set(authUserContextKey, user)
		c.Next()
	}
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
