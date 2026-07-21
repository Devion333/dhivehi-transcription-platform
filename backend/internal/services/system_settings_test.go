// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: system_settings_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestNormalizeValidateSettingsRejectsUnsupportedAndDuplicateLists(t *testing.T) {
	settings := DefaultSystemSettings()
	settings.AllowedUploadFormats = []string{"mp3", "exe"}
	if err := normalizeValidateSettings(&settings); err == nil {
		t.Fatal("expected unsupported upload format to be rejected")
	}

	settings = DefaultSystemSettings()
	settings.EnabledDownloadFormats = []string{"txt", "txt"}
	if err := normalizeValidateSettings(&settings); err == nil {
		t.Fatal("expected duplicate download format to be rejected")
	}
}

func TestNormalizeValidateSettingsAcceptsRetentionRanges(t *testing.T) {
	settings := DefaultSystemSettings()
	settings.AuditRetentionDays = 0
	settings.NotificationRetentionDays = 3650
	if err := normalizeValidateSettings(&settings); err != nil {
		t.Fatalf("expected retention range to be accepted: %v", err)
	}
	settings.AuditRetentionDays = -1
	if err := normalizeValidateSettings(&settings); err == nil {
		t.Fatal("expected negative retention to be rejected")
	}
}

func TestUploadFormatAllowedRequiresExtension(t *testing.T) {
	settings := DefaultSystemSettings()
	if UploadFormatAllowed("recording", settings) {
		t.Fatal("filename without extension should not be allowed")
	}
	if UploadFormatAllowed("recording.", settings) {
		t.Fatal("filename with empty extension should not be allowed")
	}
	if !UploadFormatAllowed("recording.MP3", settings) {
		t.Fatal("configured extension should be allowed case-insensitively")
	}
}

func TestPublicSettingsRedactsAdminOnlyFieldsAndExpiresAnnouncements(t *testing.T) {
	expires := time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)
	settings := DefaultSystemSettings()
	settings.AutomaticAnalysis = true
	settings.SessionDurationMinutes = 99
	settings.AnnouncementEnabled = true
	settings.AnnouncementMessage = "expired"
	settings.AnnouncementExpiresAt = &expires
	public := publicSystemSettings(settings)
	data, err := json.Marshal(public)
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, forbidden := range []string{"automaticAnalysis", "sessionDurationMinutes", "maximumFailedLoginAttempts", "accountLockoutMinutes", "cleanupEnabled"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("public settings leaked %s: %s", forbidden, text)
		}
	}
	if public.AnnouncementEnabled || public.AnnouncementMessage != "" || public.AnnouncementExpiresAt != nil {
		t.Fatalf("expired announcement should be suppressed: %+v", public)
	}
}

func TestNotificationSwitchesSuppressCreation(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	Database = db
	t.Cleanup(func() { Database = nil; _ = db.Close() })
	settings := DefaultSystemSettings()
	settings.NotifyAnalysisComplete = false
	restore := SetSystemSettingsProviderForTest(func(context.Context) (SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	_, created, err := CreateNotification(context.Background(), NotificationInput{UserID: "user-id", Type: NotificationAnalysisCompleted, Title: "Analysis complete", Message: "Done", ResourceType: "transcript", ResourceID: "job", EventKey: "key"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if created {
		t.Fatal("notification should be suppressed")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

type settingsAuditMetadataMatcher struct{}

func (settingsAuditMetadataMatcher) Match(value driver.Value) bool {
	metadata, ok := value.(string)
	return ok && strings.Contains(metadata, "changedFields") && strings.Contains(metadata, "uploadsEnabled") && !strings.Contains(metadata, "password")
}
