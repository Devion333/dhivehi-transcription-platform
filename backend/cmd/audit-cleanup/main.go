package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"transcript_app/backend/internal/services"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "count expired audit events without deleting them")
	batchSize := flag.Int("batch-size", services.DefaultAuditCleanupBatch, "maximum audit events to delete per statement")
	flag.Parse()

	log.SetOutput(os.Stderr)
	ctx := context.Background()
	retentionDays, err := services.AuditRetentionDaysFromEnv()
	if err != nil {
		log.Fatalf("invalid audit retention configuration: %v", err)
	}
	if *batchSize < 1 {
		log.Fatalf("batch-size must be at least 1")
	}
	if err := services.OpenDatabase(ctx); err != nil {
		log.Fatalf("connect database: %v", err)
	}
	defer services.Database.Close()
	if err := services.RunMigrations(ctx, services.Database); err != nil {
		log.Fatalf("run migrations: %v", err)
	}

	cutoff := services.AuditRetentionCutoff(time.Now(), retentionDays)
	result, err := services.DeleteAuditEventsBefore(ctx, cutoff, *batchSize, *dryRun, retentionDays)
	if err != nil {
		log.Fatalf("cleanup audit events: %v", err)
	}
	fmt.Printf("audit_retention_days=%d cutoff=%s eligible=%d deleted=%d dry_run=%t batch_size=%d\n", result.RetentionDays, result.Cutoff.Format(time.RFC3339), result.EligibleCount, result.DeletedCount, result.DryRun, result.BatchSize)
}
