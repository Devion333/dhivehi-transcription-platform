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
		log.Fatalf("cleanup audit events: %v", err)
	}
	fmt.Printf("audit_retention_days=%d audit_events_deleted=%d\n", result.AuditRetentionDays, result.AuditEventsDeleted)
}
