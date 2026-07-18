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
	deleted, err := services.DeleteExpiredNotifications(ctx, time.Now())
	if err != nil {
		log.Fatalf("cleanup notifications: %v", err)
	}
	fmt.Printf("notification_retention_days=%d deleted=%d\n", services.NotificationRetentionDays(), deleted)
}
