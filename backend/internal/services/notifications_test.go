// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: notifications_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"database/sql"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/DATA-DOG/go-sqlmock"
)

var notificationColumns = []string{"id", "type", "title", "message", "resource_type", "resource_id", "event_key", "is_read", "created_at", "read_at"}

func TestCreateNotificationIdempotentDuplicateEventKey(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery("INSERT INTO notifications").
		WithArgs(sqlmock.AnyArg(), "user-1", NotificationTranscriptCompleted, "Transcript ready", "Your transcript is ready to review.", "transcript", "job-1", "transcript-complete:job-1:transcribed").
		WillReturnRows(sqlmock.NewRows(notificationColumns))

	_, created, err := CreateNotification(context.Background(), NotificationInput{UserID: "user-1", Type: NotificationTranscriptCompleted, Title: "Transcript ready", Message: "Your transcript is ready to review.", ResourceType: "transcript", ResourceID: "job-1", EventKey: "transcript-complete:job-1:transcribed"})
	if err != nil {
		t.Fatal(err)
	}
	if created {
		t.Fatal("expected duplicate event key to be ignored")
	}
}

func TestListNotificationsScopesToUserAndPaginates(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now().UTC()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`)).WithArgs("user-1").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id::text, type, title, message, resource_type, resource_id, event_key, is_read, created_at, read_at FROM notifications WHERE user_id = $1 AND is_read = FALSE ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`)).
		WithArgs("user-1", 1, 1).
		WillReturnRows(sqlmock.NewRows(notificationColumns).AddRow("n-2", NotificationAnalysisCompleted, "Analysis complete", "Analysis is ready to review.", "transcript", "job-2", "analysis-complete:job-2:v1", false, now, sql.NullTime{}))

	result, err := ListNotifications(context.Background(), "user-1", NotificationListOptions{Page: 2, PageSize: 1, UnreadOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	if result.Page != 2 || result.PageSize != 1 || result.Total != 2 || len(result.Items) != 1 || result.Items[0].ResourceID != "job-2" {
		t.Fatalf("unexpected list result: %+v", result)
	}
}

func TestUnreadCount(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`)).WithArgs("user-1").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	count, err := GetUnreadCount(context.Background(), "user-1")
	if err != nil || count != 3 {
		t.Fatalf("expected count 3, got count=%d err=%v", count, err)
	}
}

func TestMarkReadScopesToUser(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now().UTC()
	mock.ExpectQuery("UPDATE notifications SET is_read = TRUE").
		WithArgs("n-1", "user-1").
		WillReturnRows(sqlmock.NewRows(notificationColumns).AddRow("n-1", NotificationTranscriptAssigned, "Transcript assigned to you", "A transcript has been assigned to you.", "transcript", "job-1", "transcript-assigned:job-1:user-1:v1", true, now, sql.NullTime{Time: now, Valid: true}))
	notification, err := MarkRead(context.Background(), "user-1", "n-1")
	if err != nil || !notification.IsRead || notification.ReadAt == nil {
		t.Fatalf("unexpected mark read result: %+v err=%v", notification, err)
	}
}

func TestAnotherUserCannotMarkNotificationRead(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery("UPDATE notifications SET is_read = TRUE").WithArgs("n-1", "user-2").WillReturnRows(sqlmock.NewRows(notificationColumns))
	_, err := MarkRead(context.Background(), "user-2", "n-1")
	if err == nil {
		t.Fatal("expected not found for another user's notification")
	}
}

func TestMarkAllRead(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectExec("UPDATE notifications SET is_read = TRUE").WithArgs("user-1").WillReturnResult(sqlmock.NewResult(0, 4))
	updated, err := MarkAllRead(context.Background(), "user-1")
	if err != nil || updated != 4 {
		t.Fatalf("expected four updates, got updated=%d err=%v", updated, err)
	}
}

func TestWorkflowNotificationHelpers(t *testing.T) {
	tests := []struct {
		name    string
		call    func()
		typeKey string
		title   string
		message string
	}{
		{"transcript completion", func() {
			NotifyTranscriptStatusObserved(context.Background(), map[string]interface{}{"owner_user_id": "user-1"}, dtos.TranscriptStatusResponse{JobID: "job-1", Status: "transcribed"})
		}, NotificationTranscriptCompleted, "Transcript ready", "Your transcript is ready to review."},
		{"transcript failure", func() {
			NotifyTranscriptStatusObserved(context.Background(), map[string]interface{}{"owner_user_id": "user-1"}, dtos.TranscriptStatusResponse{JobID: "job-1", Status: "failed", UpdatedAt: "v1"})
		}, NotificationTranscriptFailed, "Transcript processing failed", "Transcript processing could not be completed."},
		{"analysis completion", func() {
			NotifyAnalysisCompleted(context.Background(), map[string]interface{}{"owner_user_id": "user-1"}, "job-1", "v1")
		}, NotificationAnalysisCompleted, "Analysis complete", "Analysis is ready to review."},
		{"analysis failure", func() {
			NotifyAnalysisFailed(context.Background(), map[string]interface{}{"owner_user_id": "user-1"}, "job-1", "v1")
		}, NotificationAnalysisFailed, "Analysis failed", "Analysis could not be completed."},
		{"assignment", func() { NotifyTranscriptAssigned(context.Background(), "job-1", "user-1", "v1") }, NotificationTranscriptAssigned, "Transcript assigned to you", "A transcript has been assigned to you."},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			mock := withMockDatabase(t)
			mock.ExpectQuery("INSERT INTO notifications").WithArgs(sqlmock.AnyArg(), "user-1", test.typeKey, test.title, test.message, "transcript", "job-1", sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows(notificationColumns).AddRow("n-1", test.typeKey, test.title, test.message, "transcript", "job-1", "event", false, time.Now().UTC(), sql.NullTime{}))
			test.call()
			if strings.Contains(test.message, "error") || strings.Contains(test.message, "provider") || strings.Contains(test.message, "worker") {
				t.Fatalf("message is not safe: %q", test.message)
			}
		})
	}
}

func TestOwnerlessTranscriptProducesNoNotification(t *testing.T) {
	_ = withMockDatabase(t)
	NotifyTranscriptStatusObserved(context.Background(), map[string]interface{}{}, dtos.TranscriptStatusResponse{JobID: "job-1", Status: "transcribed"})
}

func TestDeletedResourceNotificationRemainsSafe(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now().UTC()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM notifications WHERE user_id = $1`)).WithArgs("user-1").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id::text, type, title, message, resource_type, resource_id, event_key, is_read, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`)).WithArgs("user-1", 20, 0).WillReturnRows(sqlmock.NewRows(notificationColumns).AddRow("n-1", NotificationTranscriptCompleted, "Transcript ready", "Your transcript is ready to review.", "transcript", "deleted-job", "event", false, now, sql.NullTime{}))
	result, err := ListNotifications(context.Background(), "user-1", NotificationListOptions{})
	if err != nil || result.Items[0].ResourceID != "deleted-job" || strings.Contains(result.Items[0].Message, "not found") {
		t.Fatalf("unexpected deleted resource notification: %+v err=%v", result, err)
	}
}

func TestRetentionDeletesOldReadAndUnreadNotifications(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	settings := DefaultSystemSettings()
	settings.NotificationRetentionDays = 45
	restore := SetSystemSettingsProviderForTest(func(context.Context) (SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	mock.ExpectExec(regexp.QuoteMeta(`WITH doomed AS (SELECT id FROM notifications WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM notifications WHERE id IN (SELECT id FROM doomed)`)).WithArgs(now.AddDate(0, 0, -45), DefaultMaintenanceCleanupBatch).WillReturnResult(sqlmock.NewResult(0, 2))
	deleted, err := DeleteExpiredNotifications(context.Background(), now)
	if err != nil || deleted != 2 {
		t.Fatalf("expected two deleted, got deleted=%d err=%v", deleted, err)
	}
}

func TestNotificationMigrationSchema(t *testing.T) {
	path := "../../migrations/003_notifications.sql"
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := string(contents)
	for _, required := range []string{"CREATE TABLE IF NOT EXISTS notifications", "REFERENCES users(id)", "UNIQUE (user_id, event_key)", "notifications_user_created_at_idx", "notifications_user_unread_idx"} {
		if !strings.Contains(sql, required) {
			t.Fatalf("migration missing %q", required)
		}
	}
}
