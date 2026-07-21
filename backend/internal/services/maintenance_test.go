// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: maintenance_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestRunScheduledCleanupUsesSettingsCutoffsAndReportsCounts(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	settings := DefaultSystemSettings()
	settings.AuditRetentionDays = 365
	settings.NotificationRetentionDays = 90
	restore := SetSystemSettingsProviderForTest(func(context.Context) (SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_try_advisory_lock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
	mock.ExpectExec(regexp.QuoteMeta(`WITH doomed AS (SELECT id FROM audit_events WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM audit_events WHERE id IN (SELECT id FROM doomed)`)).WithArgs(now.AddDate(0, 0, -365), DefaultMaintenanceCleanupBatch).WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectExec(regexp.QuoteMeta(`WITH doomed AS (SELECT id FROM notifications WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM notifications WHERE id IN (SELECT id FROM doomed)`)).WithArgs(now.AddDate(0, 0, -90), DefaultMaintenanceCleanupBatch).WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO audit_events (id, actor_user_id, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json) VALUES ($1, NULL, $2, NULL, $3, $4, $5, NULL, NULL, $6, NULL, NULL, $7::jsonb)`)).WithArgs(sqlmock.AnyArg(), "System", "system", "scheduled_cleanup_completed", "system", AuditOutcomeSuccess, sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_advisory_unlock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"released"}).AddRow(true))

	result, err := RunScheduledCleanup(context.Background(), now, CleanupTriggerScheduled)
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}
	if result.AuditEventsDeleted != 2 || result.NotificationsDeleted != 3 {
		t.Fatalf("unexpected delete counts: %+v", result)
	}
	if !result.AuditCutoff.Equal(now.AddDate(0, 0, -365)) || !result.NotificationCutoff.Equal(now.AddDate(0, 0, -90)) {
		t.Fatalf("unexpected cutoffs: %+v", result)
	}
}

func TestRunScheduledCleanupSkipsZeroRetentionIndependently(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Date(2026, 7, 19, 12, 0, 0, 0, time.UTC)
	settings := DefaultSystemSettings()
	settings.AuditRetentionDays = 0
	settings.NotificationRetentionDays = 30
	restore := SetSystemSettingsProviderForTest(func(context.Context) (SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_try_advisory_lock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
	mock.ExpectExec(regexp.QuoteMeta(`WITH doomed AS (SELECT id FROM notifications WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM notifications WHERE id IN (SELECT id FROM doomed)`)).WithArgs(now.AddDate(0, 0, -30), DefaultMaintenanceCleanupBatch).WillReturnResult(sqlmock.NewResult(0, 4))
	mock.ExpectExec("INSERT INTO audit_events").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_advisory_unlock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"released"}).AddRow(true))

	result, err := RunScheduledCleanup(context.Background(), now, CleanupTriggerScheduled)
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}
	if result.AuditEventsDeleted != 0 || result.NotificationsDeleted != 4 {
		t.Fatalf("unexpected delete counts: %+v", result)
	}
}

func TestRunScheduledCleanupZeroRetentionManualAuditsWithoutDeleting(t *testing.T) {
	mock := withMockDatabase(t)
	settings := DefaultSystemSettings()
	settings.AuditRetentionDays = 0
	settings.NotificationRetentionDays = 0
	restore := SetSystemSettingsProviderForTest(func(context.Context) (SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)

	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_try_advisory_lock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
	mock.ExpectExec("INSERT INTO audit_events").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_advisory_unlock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"released"}).AddRow(true))

	result, err := RunScheduledCleanup(context.Background(), time.Now().UTC(), CleanupTriggerManual)
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}
	if result.AuditEventsDeleted != 0 || result.NotificationsDeleted != 0 {
		t.Fatalf("zero retention should skip deletes: %+v", result)
	}
}

func TestRunScheduledCleanupSkipsWhenLockUnavailable(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_try_advisory_lock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(false))
	result, err := RunScheduledCleanup(context.Background(), time.Now().UTC(), CleanupTriggerScheduled)
	if err != nil {
		t.Fatalf("lock skip should not fail: %v", err)
	}
	if result.LockAcquired {
		t.Fatal("expected lock not acquired")
	}
}

func TestRunScheduledCleanupDoesNotOverlap(t *testing.T) {
	cleanupRunning.Store(true)
	t.Cleanup(func() { cleanupRunning.Store(false) })
	result, err := RunScheduledCleanup(context.Background(), time.Now().UTC(), CleanupTriggerScheduled)
	if err != nil {
		t.Fatalf("overlap skip should not fail: %v", err)
	}
	if result.LockAcquired {
		t.Fatal("overlap should not acquire database lock")
	}
}

func TestRunScheduledCleanupFailureReturnsErrorAndReleasesLock(t *testing.T) {
	mock := withMockDatabase(t)
	settings := DefaultSystemSettings()
	settings.AuditRetentionDays = 10
	settings.NotificationRetentionDays = 10
	restore := SetSystemSettingsProviderForTest(func(context.Context) (SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_try_advisory_lock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
	mock.ExpectExec(regexp.QuoteMeta(`WITH doomed AS (SELECT id FROM audit_events WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM audit_events WHERE id IN (SELECT id FROM doomed)`)).WillReturnError(errors.New("delete failed"))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT pg_advisory_unlock($1)`)).WithArgs(maintenanceCleanupLockID).WillReturnRows(sqlmock.NewRows([]string{"released"}).AddRow(true))
	if _, err := RunScheduledCleanup(context.Background(), time.Now().UTC(), CleanupTriggerScheduled); err == nil {
		t.Fatal("expected cleanup error")
	}
}
