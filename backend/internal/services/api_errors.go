package services

import "errors"

const (
	ErrCodeBadRequest          = "BAD_REQUEST"
	ErrCodeTranscriptNotFound  = "TRANSCRIPT_NOT_FOUND"
	ErrCodeSegmentNotFound     = "SEGMENT_NOT_FOUND"
	ErrCodeSegmentConflict     = "SEGMENT_PARENT_MISMATCH"
	ErrCodeUpstream            = "UPSTREAM_UNAVAILABLE"
	ErrCodeInternal            = "INTERNAL_ERROR"
	ErrCodeSearchQueryRequired = "SEARCH_QUERY_REQUIRED"
	ErrCodeSearchUnavailable   = "SEARCH_UNAVAILABLE"
)

var (
	ErrTranscriptNotFound = errors.New("transcript not found")
	ErrSegmentNotFound    = errors.New("segment not found")
	ErrSegmentConflict    = errors.New("segment does not belong to transcript")
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
