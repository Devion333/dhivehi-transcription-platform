// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: main.go
// Description: Entrypoint for the audit cleanup tool
// First Written on: 03/07/2026
// Edited on: 21/07/2026

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
