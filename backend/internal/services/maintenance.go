package services

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultMaintenanceCleanupBatch = 5000
	maintenanceCleanupLockID       = int64(91120260719)
	maintenanceCleanupInterval     = 24 * time.Hour
	maintenanceFirstRunDelay       = 2 * time.Minute
)

type CleanupTrigger string

const (
	CleanupTriggerScheduled CleanupTrigger = "scheduled"
	CleanupTriggerManual    CleanupTrigger = "manual"
)

type CleanupResult struct {
	AuditRetentionDays        int       `json:"auditRetentionDays"`
	NotificationRetentionDays int       `json:"notificationRetentionDays"`
	AuditCutoff               time.Time `json:"auditCutoff"`
	NotificationCutoff        time.Time `json:"notificationCutoff"`
	AuditEventsDeleted        int       `json:"auditEventsDeleted"`
	NotificationsDeleted      int       `json:"notificationsDeleted"`
	LockAcquired              bool      `json:"lockAcquired"`
	Trigger                   string    `json:"trigger"`
}

var cleanupRunning atomic.Bool

func RunScheduledCleanup(ctx context.Context, now time.Time, trigger CleanupTrigger) (CleanupResult, error) {
	if !cleanupRunning.CompareAndSwap(false, true) {
		log.Printf("maintenance cleanup skipped: previous run still active")
		return CleanupResult{Trigger: string(trigger)}, nil
	}
	defer cleanupRunning.Store(false)
	if Database == nil {
		return CleanupResult{}, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}

	locked, err := tryMaintenanceLock(ctx)
	if err != nil {
		return CleanupResult{}, err
	}
	if !locked {
		log.Printf("maintenance cleanup skipped: advisory lock is held by another backend")
		return CleanupResult{Trigger: string(trigger), LockAcquired: false}, nil
	}
	defer releaseMaintenanceLock(context.Background())

	settings, err := GetSystemSettings(ctx)
	if err != nil {
		return CleanupResult{}, err
	}
	result := CleanupResult{AuditRetentionDays: settings.AuditRetentionDays, NotificationRetentionDays: settings.NotificationRetentionDays, LockAcquired: true, Trigger: string(trigger)}
	now = now.UTC()

	if settings.AuditRetentionDays > 0 {
		result.AuditCutoff = retentionCutoff(now, settings.AuditRetentionDays)
		deleted, err := CleanupExpiredAuditEvents(ctx, result.AuditCutoff, DefaultMaintenanceCleanupBatch)
		if err != nil {
			log.Printf("maintenance cleanup failed for audit events: %v", err)
			return result, err
		}
		result.AuditEventsDeleted = deleted
	}
	if settings.NotificationRetentionDays > 0 {
		result.NotificationCutoff = retentionCutoff(now, settings.NotificationRetentionDays)
		deleted, err := CleanupExpiredNotifications(ctx, result.NotificationCutoff, DefaultMaintenanceCleanupBatch)
		if err != nil {
			log.Printf("maintenance cleanup failed for notifications: %v", err)
			return result, err
		}
		result.NotificationsDeleted = deleted
	}

	if result.AuditEventsDeleted > 0 || result.NotificationsDeleted > 0 || trigger == CleanupTriggerManual {
		if err := recordCleanupAuditEvent(ctx, result); err != nil {
			log.Printf("maintenance cleanup audit event failed: %v", err)
		}
	}
	log.Printf("maintenance cleanup completed trigger=%s audit_deleted=%d notifications_deleted=%d audit_retention_days=%d notification_retention_days=%d", trigger, result.AuditEventsDeleted, result.NotificationsDeleted, result.AuditRetentionDays, result.NotificationRetentionDays)
	return result, nil
}

func CleanupExpiredAuditEvents(ctx context.Context, cutoff time.Time, batchSize int) (int, error) {
	return deleteBatched(ctx, `WITH doomed AS (SELECT id FROM audit_events WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM audit_events WHERE id IN (SELECT id FROM doomed)`, cutoff.UTC(), batchSize)
}

func CleanupExpiredNotifications(ctx context.Context, cutoff time.Time, batchSize int) (int, error) {
	return deleteBatched(ctx, `WITH doomed AS (SELECT id FROM notifications WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM notifications WHERE id IN (SELECT id FROM doomed)`, cutoff.UTC(), batchSize)
}

func StartMaintenanceScheduler(ctx context.Context) {
	go func() {
		timer := time.NewTimer(maintenanceFirstRunDelay)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				if _, err := RunScheduledCleanup(ctx, time.Now().UTC(), CleanupTriggerScheduled); err != nil {
					log.Printf("scheduled maintenance cleanup failed: %v", err)
				}
				timer.Reset(maintenanceCleanupInterval)
			}
		}
	}()
}

func retentionCutoff(now time.Time, retentionDays int) time.Time {
	return now.UTC().AddDate(0, 0, -retentionDays)
}

func deleteBatched(ctx context.Context, query string, cutoff time.Time, batchSize int) (int, error) {
	if batchSize < 1 {
		batchSize = DefaultMaintenanceCleanupBatch
	}
	total := 0
	for {
		result, err := Database.ExecContext(ctx, query, cutoff, batchSize)
		if err != nil {
			return total, err
		}
		rows, err := result.RowsAffected()
		if err != nil {
			return total, err
		}
		total += int(rows)
		if rows < int64(batchSize) {
			return total, nil
		}
	}
}

func tryMaintenanceLock(ctx context.Context) (bool, error) {
	var locked bool
	if err := Database.QueryRowContext(ctx, `SELECT pg_try_advisory_lock($1)`, maintenanceCleanupLockID).Scan(&locked); err != nil {
		return false, err
	}
	return locked, nil
}

func releaseMaintenanceLock(ctx context.Context) {
	var released bool
	if err := Database.QueryRowContext(ctx, `SELECT pg_advisory_unlock($1)`, maintenanceCleanupLockID).Scan(&released); err != nil {
		log.Printf("maintenance cleanup advisory unlock failed: %v", err)
	}
}

func recordCleanupAuditEvent(ctx context.Context, result CleanupResult) error {
	metadata := map[string]interface{}{
		"auditEventsDeleted":        result.AuditEventsDeleted,
		"notificationsDeleted":      result.NotificationsDeleted,
		"auditRetentionDays":        result.AuditRetentionDays,
		"notificationRetentionDays": result.NotificationRetentionDays,
		"trigger":                   result.Trigger,
	}
	metadataJSON, err := safeMetadataJSON(metadata)
	if err != nil {
		return err
	}
	_, err = Database.ExecContext(ctx, `INSERT INTO audit_events (id, actor_user_id, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json) VALUES ($1, NULL, $2, NULL, $3, $4, $5, NULL, NULL, $6, NULL, NULL, $7::jsonb)`, uuid.NewString(), "System", "system", "scheduled_cleanup_completed", "system", AuditOutcomeSuccess, string(metadataJSON))
	return err
}

func safeMetadataJSON(metadata map[string]interface{}) ([]byte, error) {
	return jsonMarshal(metadata)
}

var jsonMarshal = func(value interface{}) ([]byte, error) { return json.Marshal(value) }
