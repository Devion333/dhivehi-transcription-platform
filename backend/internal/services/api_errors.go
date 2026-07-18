package services

import "errors"

const (
	ErrCodeBadRequest                 = "BAD_REQUEST"
	ErrCodeTranscriptNotFound         = "TRANSCRIPT_NOT_FOUND"
	ErrCodeSegmentNotFound            = "SEGMENT_NOT_FOUND"
	ErrCodeSegmentConflict            = "SEGMENT_PARENT_MISMATCH"
	ErrCodeUpstream                   = "UPSTREAM_UNAVAILABLE"
	ErrCodeInternal                   = "INTERNAL_ERROR"
	ErrCodeUnauthenticated            = "UNAUTHENTICATED"
	ErrCodeForbidden                  = "FORBIDDEN"
	ErrCodeInvalidCredentials         = "INVALID_CREDENTIALS"
	ErrCodeInactiveUser               = "INACTIVE_USER"
	ErrCodeRateLimited                = "TOO_MANY_LOGIN_ATTEMPTS"
	ErrCodeSearchQueryRequired        = "SEARCH_QUERY_REQUIRED"
	ErrCodeSearchUnavailable          = "SEARCH_UNAVAILABLE"
	ErrCodeInvalidSearchFilter        = "INVALID_SEARCH_FILTER"
	ErrCodeUnsupportedDownloadFormat  = "UNSUPPORTED_DOWNLOAD_FORMAT"
	ErrCodeInvalidTranscriptTimestamp = "INVALID_TRANSCRIPT_TIMESTAMP"
	ErrCodeInvalidUserInput           = "INVALID_USER_INPUT"
	ErrCodeEmailExists                = "EMAIL_ALREADY_EXISTS"
	ErrCodeInvalidRole                = "INVALID_ROLE"
	ErrCodeWeakPassword               = "WEAK_PASSWORD"
	ErrCodeInvalidCurrentPassword     = "INVALID_CURRENT_PASSWORD"
	ErrCodePasswordMismatch           = "PASSWORD_CONFIRMATION_MISMATCH"
	ErrCodePasswordPolicyFailed       = "PASSWORD_POLICY_FAILED"
	ErrCodePasswordUnchanged          = "PASSWORD_UNCHANGED"
	ErrCodeInvalidSpeakerKey          = "INVALID_SPEAKER_KEY"
	ErrCodeInvalidSpeakerName         = "INVALID_SPEAKER_NAME"
	ErrCodeDeleteConfirmationMismatch = "DELETE_CONFIRMATION_MISMATCH"
	ErrCodeTranscriptProcessing       = "TRANSCRIPT_PROCESSING"
	ErrCodeTranscriptDeletionPartial  = "TRANSCRIPT_DELETION_PARTIAL"
	ErrCodeUnsafeMediaReference       = "UNSAFE_MEDIA_REFERENCE"
	ErrCodeUserNotFound               = "USER_NOT_FOUND"
	ErrCodeTargetUserNotFound         = "TARGET_USER_NOT_FOUND"
	ErrCodeTargetUserInactive         = "TARGET_USER_INACTIVE"
	ErrCodeTranscriptOwnerUnchanged   = "TRANSCRIPT_OWNER_UNCHANGED"
	ErrCodeCannotDeactivateSelf       = "CANNOT_DEACTIVATE_SELF"
	ErrCodeLastActiveAdmin            = "LAST_ACTIVE_ADMIN"
	ErrCodeAuditNotFound              = "AUDIT_EVENT_NOT_FOUND"
	ErrCodeInvalidAuditFilter         = "INVALID_AUDIT_FILTER"
	ErrCodeInvalidAuditEvent          = "INVALID_AUDIT_EVENT"
	ErrCodeJobNotFound                = "JOB_NOT_FOUND"
	ErrCodeJobNotFailed               = "JOB_NOT_FAILED"
	ErrCodeJobNotRetryable            = "JOB_NOT_RETRYABLE"
	ErrCodeJobAlreadyQueued           = "JOB_ALREADY_QUEUED"
	ErrCodeJobRetryLimitReached       = "JOB_RETRY_LIMIT_REACHED"
	ErrCodeJobQueueUnavailable        = "JOB_QUEUE_UNAVAILABLE"
	ErrCodeWorkerUnavailable          = "WORKER_UNAVAILABLE"
)

var (
	ErrTranscriptNotFound = errors.New("transcript not found")
	ErrSegmentNotFound    = errors.New("segment not found")
	ErrSegmentConflict    = errors.New("segment does not belong to transcript")
	ErrForbidden          = errors.New("forbidden")
)

type ServiceError struct {
	Code string
	Err  error
}

func (e *ServiceError) Error() string {
	if e == nil || e.Err == nil {
		return ""
	}
	return e.Err.Error()
}

func (e *ServiceError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func newServiceError(code string, err error) error {
	return &ServiceError{Code: code, Err: err}
}
