package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func RunMigrations(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	migrationsDir, err := findMigrationsDir()
	if err != nil {
		return err
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}

	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		version := strings.TrimSuffix(name, filepath.Ext(name))
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`, version).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", version, err)
		}
		if exists {
			continue
		}

		sqlBytes, err := os.ReadFile(filepath.Join(migrationsDir, name))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", version, err)
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", version, err)
		}
		if _, err = tx.ExecContext(ctx, string(sqlBytes)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", version, err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", version, err)
		}
		if err = tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", version, err)
		}
		log.Printf("✅ Applied database migration: %s", version)
	}

	return nil
}

func findMigrationsDir() (string, error) {
	candidates := []string{"migrations", filepath.Join("..", "migrations"), filepath.Join("backend", "migrations")}
	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err == nil && info.IsDir() {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("migrations directory not found")
}

func RunDataMigrations(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS data_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); err != nil {
		return fmt.Errorf("create data_migrations: %w", err)
	}

	migrations := []struct {
		version string
		fn      func() error
	}{
		{"001_mark_old_approved_segments_reviewed", migrateOldApprovedSegments},
	}

	for _, m := range migrations {
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM data_migrations WHERE version = $1)`, m.version).Scan(&exists); err != nil {
			return fmt.Errorf("check data migration %s: %w", m.version, err)
		}
		if exists {
			continue
		}
		log.Printf("Running data migration: %s", m.version)
		if err := m.fn(); err != nil {
			return fmt.Errorf("data migration %s: %w", m.version, err)
		}
		if _, err := db.ExecContext(ctx, `INSERT INTO data_migrations (version) VALUES ($1)`, m.version); err != nil {
			return fmt.Errorf("record data migration %s: %w", m.version, err)
		}
		log.Printf("✅ Applied data migration: %s", m.version)
	}
	return nil
}

func migrateOldApprovedSegments() error {
	parents, err := scrollAll(map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "type", "match": map[string]string{"value": "parent"}},
			{"key": "analysis_review_status", "match": map[string]string{"value": "approved"}},
		},
	})
	if err != nil {
		return fmt.Errorf("scroll approved parents: %w", err)
	}
	if len(parents) == 0 {
		return nil
	}
	log.Printf("Found %d parent(s) with analysis_review_status=approved", len(parents))
	for _, parent := range parents {
		jobID := getString(parent.Payload, "job_id", "")
		if jobID == "" {
			continue
		}
		segments, err := ListSegmentPointsByParent(jobID)
		if err != nil {
			log.Printf("⚠️  Could not load segments for %s: %v", jobID, err)
			continue
		}
		updated := 0
		for _, seg := range segments {
			if getBool(seg.Payload, "is_reviewed", false) {
				continue
			}
			idx := getInt(seg.Payload, "segment_index", -1)
			if idx < 0 {
				continue
			}
			if err := updateSegmentPayloadByIndex(jobID, idx, map[string]interface{}{
				"is_reviewed": true,
				"reviewed_by": "",
				"reviewed_at": "",
			}); err != nil {
				log.Printf("⚠️  Could not update segment %s seg_idx=%d: %v", jobID, idx, err)
				continue
			}
			updated++
		}
		if updated > 0 {
			if err := cacheReviewProgressOnParent(jobID, len(segments), len(segments)); err != nil {
				log.Printf("⚠️  Could not cache review progress for %s: %v", jobID, err)
			}
		}
		log.Printf("  %s: marked %d of %d segments as reviewed (was Approved)", jobID, updated, len(segments))
	}
	return nil
}
