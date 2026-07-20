package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"transcript_app/backend/internal/services"
)

func main() {
	log.SetOutput(os.Stderr)
	if len(os.Args) != 2 || os.Args[1] != "cleanup" {
		fmt.Fprintln(os.Stderr, "usage: go run ./cmd/maintenance cleanup")
		os.Exit(2)
	}
	ctx := context.Background()
	if err := services.OpenDatabase(ctx); err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer services.Database.Close()
	if err := services.RunMigrations(ctx, services.Database); err != nil {
		log.Fatalf("run migrations: %v", err)
	}
	result, err := services.RunScheduledCleanup(ctx, time.Now().UTC(), services.CleanupTriggerManual)
	if err != nil {
		log.Fatalf("run cleanup: %v", err)
	}
	if !result.LockAcquired {
		fmt.Println("cleanup_skipped=lock_not_acquired")
		return
	}
	fmt.Printf("audit_retention_days=%d notification_retention_days=%d audit_events_deleted=%d notifications_deleted=%d trigger=%s\n", result.AuditRetentionDays, result.NotificationRetentionDays, result.AuditEventsDeleted, result.NotificationsDeleted, result.Trigger)
}
