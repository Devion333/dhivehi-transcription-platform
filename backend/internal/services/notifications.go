package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/google/uuid"
)

const (
	NotificationTranscriptCompleted = "transcript_processing_completed"
	NotificationTranscriptFailed    = "transcript_processing_failed"
	NotificationAnalysisCompleted   = "analysis_completed"
	NotificationAnalysisFailed      = "analysis_failed"
	NotificationTranscriptAssigned  = "transcript_assigned"

	defaultNotificationPageSize      = 20
	maxNotificationPageSize          = 100
	defaultNotificationRetentionDays = 90
)

type NotificationInput struct {
	UserID       string
	Type         string
	Title        string
	Message      string
	ResourceType string
	ResourceID   string
	EventKey     string
}

type NotificationListOptions struct {
	Page       int
	PageSize   int
	UnreadOnly bool
}

func CreateNotification(ctx context.Context, input NotificationInput) (dtos.Notification, bool, error) {
	if Database == nil {
		return dtos.Notification{}, false, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	input.UserID = strings.TrimSpace(input.UserID)
	input.Type = strings.TrimSpace(input.Type)
	input.Title = strings.TrimSpace(input.Title)
	input.Message = strings.TrimSpace(input.Message)
	input.ResourceType = strings.TrimSpace(input.ResourceType)
	input.ResourceID = strings.TrimSpace(input.ResourceID)
	input.EventKey = strings.TrimSpace(input.EventKey)
	if input.UserID == "" || input.Type == "" || input.Title == "" || input.Message == "" || input.ResourceType == "" || input.ResourceID == "" || input.EventKey == "" {
		return dtos.Notification{}, false, newServiceError(ErrCodeBadRequest, errors.New("notification fields are required"))
	}

	row := Database.QueryRowContext(ctx, `INSERT INTO notifications (id, user_id, type, title, message, resource_type, resource_id, event_key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (user_id, event_key) DO NOTHING RETURNING id::text, type, title, message, resource_type, resource_id, event_key, is_read, created_at, read_at`, uuid.NewString(), input.UserID, input.Type, input.Title, input.Message, input.ResourceType, input.ResourceID, input.EventKey)
	notification, err := scanNotification(row)
	if errors.Is(err, sql.ErrNoRows) {
		return dtos.Notification{}, false, nil
	}
	if err != nil {
		return dtos.Notification{}, false, err
	}
	return notification, true, nil
}

func ListNotifications(ctx context.Context, userID string, options NotificationListOptions) (dtos.NotificationListResponse, error) {
	if Database == nil {
		return dtos.NotificationListResponse{}, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	page, pageSize := NormalizeNotificationPagination(options.Page, options.PageSize)
	where := "user_id = $1"
	args := []interface{}{strings.TrimSpace(userID)}
	if options.UnreadOnly {
		where += " AND is_read = FALSE"
	}
	var total int
	if err := Database.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE `+where, args...).Scan(&total); err != nil {
		return dtos.NotificationListResponse{}, err
	}
	args = append(args, pageSize, (page-1)*pageSize)
	rows, err := Database.QueryContext(ctx, `SELECT id::text, type, title, message, resource_type, resource_id, event_key, is_read, created_at, read_at FROM notifications WHERE `+where+` ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, args...)
	if err != nil {
		return dtos.NotificationListResponse{}, err
	}
	defer rows.Close()
	items := []dtos.Notification{}
	for rows.Next() {
		notification, err := scanNotification(rows)
		if err != nil {
			return dtos.NotificationListResponse{}, err
		}
		items = append(items, notification)
	}
	if err := rows.Err(); err != nil {
		return dtos.NotificationListResponse{}, err
	}
	return dtos.NotificationListResponse{Items: items, Page: page, PageSize: pageSize, Total: total}, nil
}

func GetUnreadCount(ctx context.Context, userID string) (int, error) {
	if Database == nil {
		return 0, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	var count int
	if err := Database.QueryRowContext(ctx, `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`, strings.TrimSpace(userID)).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func MarkRead(ctx context.Context, userID, notificationID string) (dtos.Notification, error) {
	if Database == nil {
		return dtos.Notification{}, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	row := Database.QueryRowContext(ctx, `UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id::text, type, title, message, resource_type, resource_id, event_key, is_read, created_at, read_at`, strings.TrimSpace(notificationID), strings.TrimSpace(userID))
	notification, err := scanNotification(row)
	if errors.Is(err, sql.ErrNoRows) {
		return dtos.Notification{}, newServiceError(ErrCodeNotificationNotFound, errors.New("notification not found"))
	}
	return notification, err
}

func MarkAllRead(ctx context.Context, userID string) (int, error) {
	if Database == nil {
		return 0, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	result, err := Database.ExecContext(ctx, `UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, NOW()) WHERE user_id = $1 AND is_read = FALSE`, strings.TrimSpace(userID))
	if err != nil {
		return 0, err
	}
	rows, _ := result.RowsAffected()
	return int(rows), nil
}

func DeleteExpiredNotifications(ctx context.Context, now time.Time) (int, error) {
	if Database == nil {
		return 0, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	days := NotificationRetentionDays()
	cutoff := now.UTC().AddDate(0, 0, -days)
	result, err := Database.ExecContext(ctx, `DELETE FROM notifications WHERE created_at < $1 AND is_read = TRUE`, cutoff)
	if err != nil {
		return 0, err
	}
	rows, _ := result.RowsAffected()
	return int(rows), nil
}

func NotificationRetentionDays() int {
	value := strings.TrimSpace(os.Getenv("NOTIFICATION_RETENTION_DAYS"))
	if value == "" {
		return defaultNotificationRetentionDays
	}
	days, err := strconv.Atoi(value)
	if err != nil || days < 1 {
		return defaultNotificationRetentionDays
	}
	return days
}

func NormalizeNotificationPagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = defaultNotificationPageSize
	}
	if pageSize > maxNotificationPageSize {
		pageSize = maxNotificationPageSize
	}
	return page, pageSize
}

func NotifyTranscriptStatusObserved(ctx context.Context, parent map[string]interface{}, status dtos.TranscriptStatusResponse) {
	ownerID := parentOwnerUserID(parent)
	if ownerID == "" {
		return
	}
	switch status.Status {
	case "transcribed":
		_, _, _ = CreateNotification(ctx, NotificationInput{UserID: ownerID, Type: NotificationTranscriptCompleted, Title: "Transcript ready", Message: "Your transcript is ready to review.", ResourceType: "transcript", ResourceID: status.JobID, EventKey: fmt.Sprintf("transcript-complete:%s:%s", status.JobID, status.Status)})
	case "failed":
		version := status.UpdatedAt
		if version == "" && status.FailureCode != nil {
			version = *status.FailureCode
		}
		if version == "" {
			version = "unknown"
		}
		_, _, _ = CreateNotification(ctx, NotificationInput{UserID: ownerID, Type: NotificationTranscriptFailed, Title: "Transcript processing failed", Message: "Transcript processing could not be completed.", ResourceType: "transcript", ResourceID: status.JobID, EventKey: fmt.Sprintf("transcript-failed:%s:%s", status.JobID, version)})
	}
}

func NotifyAnalysisCompleted(ctx context.Context, parent map[string]interface{}, jobID, version string) {
	ownerID := parentOwnerUserID(parent)
	if ownerID == "" {
		return
	}
	if strings.TrimSpace(version) == "" {
		version = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, _, _ = CreateNotification(ctx, NotificationInput{UserID: ownerID, Type: NotificationAnalysisCompleted, Title: "Analysis complete", Message: "Analysis is ready to review.", ResourceType: "transcript", ResourceID: jobID, EventKey: fmt.Sprintf("analysis-complete:%s:%s", jobID, version)})
}

func NotifyAnalysisFailed(ctx context.Context, parent map[string]interface{}, jobID, version string) {
	ownerID := parentOwnerUserID(parent)
	if ownerID == "" {
		return
	}
	if strings.TrimSpace(version) == "" {
		version = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, _, _ = CreateNotification(ctx, NotificationInput{UserID: ownerID, Type: NotificationAnalysisFailed, Title: "Analysis failed", Message: "Analysis could not be completed.", ResourceType: "transcript", ResourceID: jobID, EventKey: fmt.Sprintf("analysis-failed:%s:%s", jobID, version)})
}

func NotifyTranscriptAssigned(ctx context.Context, jobID, newOwnerUserID, updatedAt string) {
	if strings.TrimSpace(newOwnerUserID) == "" {
		return
	}
	if strings.TrimSpace(updatedAt) == "" {
		updatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	_, _, _ = CreateNotification(ctx, NotificationInput{UserID: newOwnerUserID, Type: NotificationTranscriptAssigned, Title: "Transcript assigned to you", Message: "A transcript has been assigned to you.", ResourceType: "transcript", ResourceID: jobID, EventKey: fmt.Sprintf("transcript-assigned:%s:%s:%s", jobID, newOwnerUserID, updatedAt)})
}

type notificationScanner interface {
	Scan(dest ...interface{}) error
}

func scanNotification(row notificationScanner) (dtos.Notification, error) {
	var n dtos.Notification
	var createdAt time.Time
	var readAt sql.NullTime
	if err := row.Scan(&n.ID, &n.Type, &n.Title, &n.Message, &n.ResourceType, &n.ResourceID, &n.EventKey, &n.IsRead, &createdAt, &readAt); err != nil {
		return dtos.Notification{}, err
	}
	n.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	if readAt.Valid {
		value := readAt.Time.UTC().Format(time.RFC3339)
		n.ReadAt = &value
	}
	return n, nil
}
