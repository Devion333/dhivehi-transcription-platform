package handlers

import (
	"errors"
	"log"
	"net/http"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func writeAPIError(c *gin.Context, status int, code, message string, details interface{}) {
	c.JSON(status, dtos.APIErrorBody{Error: dtos.APIError{Code: code, Message: message, Details: details}})
}

func writeServiceError(c *gin.Context, err error) {
	var serviceErr *services.ServiceError
	if errors.As(err, &serviceErr) {
		switch serviceErr.Code {
		case services.ErrCodeTranscriptNotFound:
			writeAPIError(c, http.StatusNotFound, serviceErr.Code, "Transcript was not found", nil)
		case services.ErrCodeSegmentNotFound:
			writeAPIError(c, http.StatusNotFound, serviceErr.Code, "Segment was not found", nil)
		case services.ErrCodeSegmentConflict:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Segment does not belong to transcript", nil)
		case services.ErrCodeBadRequest:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Request is invalid", nil)
		case services.ErrCodeForbidden:
			writeAPIError(c, http.StatusForbidden, serviceErr.Code, "You do not have permission to access this transcript", nil)
		case services.ErrCodeInactiveUser:
			writeAPIError(c, http.StatusUnauthorized, services.ErrCodeUnauthenticated, "Authentication is required", nil)
		case services.ErrCodeSearchQueryRequired:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Search query is required", nil)
		case services.ErrCodeSearchUnavailable:
			log.Printf("search service error: %v", err)
			writeAPIError(c, http.StatusInternalServerError, serviceErr.Code, "Search is unavailable", nil)
		case services.ErrCodeInvalidSearchFilter:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Search filter is invalid", nil)
		case services.ErrCodeUnsupportedDownloadFormat:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Download format is not supported", nil)
		case services.ErrCodeInvalidTranscriptTimestamp:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Transcript contains invalid timestamps", nil)
		case services.ErrCodeInvalidUserInput:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "User input is invalid", nil)
		case services.ErrCodeEmailExists:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Email already exists", nil)
		case services.ErrCodeInvalidRole:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Role is invalid", nil)
		case services.ErrCodeWeakPassword:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Password does not meet policy", nil)
		case services.ErrCodeInvalidCurrentPassword:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Current password is incorrect", nil)
		case services.ErrCodePasswordMismatch:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Password confirmation does not match", nil)
		case services.ErrCodePasswordPolicyFailed:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Password does not meet policy", nil)
		case services.ErrCodePasswordUnchanged:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "New password must be different from current password", nil)
		case services.ErrCodeInvalidSpeakerKey:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Speaker key is invalid", nil)
		case services.ErrCodeInvalidSpeakerName:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Speaker name is invalid", nil)
		case services.ErrCodeDeleteConfirmationMismatch:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Delete confirmation does not match", nil)
		case services.ErrCodeTranscriptProcessing:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Transcript is currently processing", nil)
		case services.ErrCodeUnsafeMediaReference:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Transcript has unsafe media references", nil)
		case services.ErrCodeRateLimited:
			writeAPIError(c, http.StatusTooManyRequests, serviceErr.Code, "Too many password change attempts. Try again later.", nil)
		case services.ErrCodeUserNotFound:
			writeAPIError(c, http.StatusNotFound, serviceErr.Code, "User was not found", nil)
		case services.ErrCodeCannotDeactivateSelf:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "You cannot deactivate your own account", nil)
		case services.ErrCodeLastActiveAdmin:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "At least one active administrator is required", nil)
		case services.ErrCodeAuditNotFound:
			writeAPIError(c, http.StatusNotFound, serviceErr.Code, "Audit event was not found", nil)
		case services.ErrCodeInvalidAuditFilter:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Audit filter is invalid", nil)
		case services.ErrCodeInvalidAuditEvent:
			writeAPIError(c, http.StatusBadRequest, serviceErr.Code, "Audit event is invalid", nil)
		case services.ErrCodeJobNotFound:
			writeAPIError(c, http.StatusNotFound, serviceErr.Code, "Job was not found", nil)
		case services.ErrCodeJobNotFailed:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Job is not failed", nil)
		case services.ErrCodeJobNotRetryable:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Job cannot be retried", nil)
		case services.ErrCodeJobAlreadyQueued:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Job is already queued or processing", nil)
		case services.ErrCodeJobRetryLimitReached:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Job retry limit has been reached", nil)
		case services.ErrCodeJobQueueUnavailable:
			writeAPIError(c, http.StatusServiceUnavailable, serviceErr.Code, "Job queue is unavailable", nil)
		case services.ErrCodeWorkerUnavailable:
			writeAPIError(c, http.StatusConflict, serviceErr.Code, "Worker is unavailable", nil)
		case services.ErrCodeUpstream:
			log.Printf("upstream service error: %v", err)
			writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "A backend dependency failed", nil)
		default:
			log.Printf("service error: %v", err)
			writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "Internal server error", nil)
		}
		return
	}

	log.Printf("internal error: %v", err)
	writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "Internal server error", nil)
}
