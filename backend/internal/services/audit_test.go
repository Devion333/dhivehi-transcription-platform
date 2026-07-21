// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: audit_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestAuditMigrationSchema(t *testing.T) {
	path := filepath.Join("..", "..", "migrations", "002_audit_events.sql")
	contents, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := string(contents)
	for _, required := range []string{"CREATE TABLE IF NOT EXISTS audit_events", "metadata_json JSONB", "outcome TEXT NOT NULL CHECK", "audit_events_created_at_idx", "audit_events_actor_user_id_idx", "audit_events_resource_idx"} {
		if !strings.Contains(sql, required) {
			t.Fatalf("migration missing %q", required)
		}
	}
}

func TestRecordAuditEventWithActorSnapshot(t *testing.T) {
	mock := withMockDatabase(t)
	actor := dtos.AuthUser{ID: adminID, Name: "Admin", Email: "admin@example.com", Role: "admin"}
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO audit_events (id, actor_user_id, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`)).
		WithArgs(sqlmock.AnyArg(), adminID, "Admin", "admin@example.com", "admin", "admin.user_created", "user_management", "user", userID, "success", "127.0.0.1", "agent", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	if err := RecordAuditEvent(context.Background(), AuditEventInput{Actor: &actor, Action: "admin.user_created", Category: "user_management", ResourceType: "user", ResourceID: userID, Outcome: AuditOutcomeSuccess, IPAddress: "127.0.0.1", UserAgent: "agent", Metadata: map[string]interface{}{"targetUserId": userID, "targetRole": "user"}}); err != nil {
		t.Fatalf("RecordAuditEvent failed: %v", err)
	}
}

func TestRecordAuditEventAllowsNullableActorForFailedLogin(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectExec("INSERT INTO audit_events").
		WithArgs(sqlmock.AnyArg(), nil, nil, nil, nil, "auth.login_failed", "authentication", nil, nil, "failure", "127.0.0.1", "agent", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	if err := RecordAuditEvent(context.Background(), AuditEventInput{Action: "auth.login_failed", Category: "authentication", Outcome: AuditOutcomeFailure, IPAddress: "127.0.0.1", UserAgent: "agent", Metadata: map[string]interface{}{"loginIdentifierHash": HashAuditIdentifier("User@Example.com")}}); err != nil {
		t.Fatalf("RecordAuditEvent failed: %v", err)
	}
}

func TestAuditMetadataAllowlistAndSensitiveKeys(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("admin.password_reset", map[string]interface{}{"targetUserId": userID, "sessionsRevoked": true, "newPassword": "secret", "passwordHash": "hash"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := metadata["newPassword"]; ok {
		t.Fatal("newPassword should be removed")
	}
	if _, ok := metadata["passwordHash"]; ok {
		t.Fatal("passwordHash should be removed")
	}
	if metadata["targetUserId"] != userID || metadata["sessionsRevoked"] != true {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
}

func TestAuditMetadataSizeLimit(t *testing.T) {
	large := strings.Repeat("x", maxAuditMetaBytes+100)
	err := RecordAuditEvent(context.Background(), AuditEventInput{Action: "admin.user_updated", Category: "user_management", Outcome: AuditOutcomeSuccess, Metadata: map[string]interface{}{"changedFields": []string{large}}})
	if err == nil {
		t.Fatal("expected metadata size error")
	}
}

func TestSegmentUpdateMetadataExcludesTranscriptText(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("transcript.segment_updated", map[string]interface{}{"jobId": "job", "segmentId": "seg", "segmentIndex": 4, "changedFields": []string{"transcriptText"}, "transcriptText": "sensitive"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := metadata["transcriptText"]; ok {
		t.Fatal("transcript text leaked")
	}
}

func TestAnalysisReviewMetadataExcludesNoteAndAnalysisContent(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("analysis_review_updated", map[string]interface{}{"jobId": "job", "previousStatus": "unreviewed", "newStatus": "approved", "hasNote": true, "note": "private", "analysisSummary": "generated content"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := metadata["note"]; ok {
		t.Fatal("review note leaked")
	}
	if _, ok := metadata["analysisSummary"]; ok {
		t.Fatal("analysis content leaked")
	}
	if metadata["jobId"] != "job" || metadata["newStatus"] != "approved" || metadata["hasNote"] != true {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
}

func TestSearchMetadataExcludesRawQuery(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("search.executed", map[string]interface{}{"query": "secret", "queryLength": 12, "resultCount": 4})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := metadata["query"]; ok {
		t.Fatal("raw query leaked")
	}
}

func TestListAuditEventsPagination(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now().UTC()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM audit_events WHERE category = $1 AND outcome = $2`)).WithArgs("authentication", "success").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, actor_user_id::text, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json, created_at FROM audit_events WHERE category = $1 AND outcome = $2 ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`)).
		WithArgs("authentication", "success", 50, 0).WillReturnRows(sqlmock.NewRows([]string{"id", "actor_user_id", "actor_name", "actor_email", "actor_role", "action", "category", "resource_type", "resource_id", "outcome", "ip_address", "user_agent", "metadata_json", "created_at"}).AddRow(adminID, adminID, "Admin", "admin@example.com", "admin", "auth.login_succeeded", "authentication", "user", adminID, "success", "127.0.0.1", "agent", []byte(`{}`), now))
	result, err := ListAuditEvents(context.Background(), AuditFilters{Category: "authentication", Outcome: "success"})
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	if len(result.Items) != 1 || result.Items[0].Actor == nil {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestAuditFilterValidation(t *testing.T) {
	_ = withMockDatabase(t)
	if _, err := ListAuditEvents(context.Background(), AuditFilters{Outcome: "maybe"}); err == nil {
		t.Fatal("expected invalid outcome")
	}
}

func TestRenderAuditCSVDoesEscapingUnicodeAndSensitiveMetadata(t *testing.T) {
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	body, err := renderAuditCSV([]AuditEventRecord{{ActorName: sqlNull("Admin, One"), ActorEmail: sqlNull("admin@example.com"), ActorRole: sqlNull("admin"), Action: "profile_updated", Outcome: "success", ResourceType: sqlNull("user"), ResourceID: sqlNull("user-1"), IPAddress: sqlNull("127.0.0.1"), MetadataJSON: []byte(`{"changedFields":["displayName"],"password":"secret","unicode":"Þ‹Þ¨ÞˆÞ¬Þ€Þ¨"}`), CreatedAt: now}})
	if err != nil {
		t.Fatalf("renderAuditCSV failed: %v", err)
	}
	csv := string(body)
	if !strings.Contains(csv, `"Admin, One"`) || !strings.Contains(csv, "Þ‹Þ¨ÞˆÞ¬Þ€Þ¨") || strings.Contains(csv, "secret") || strings.Contains(strings.ToLower(csv), "password") {
		t.Fatalf("unexpected csv output: %q", csv)
	}
}

func TestExportAuditEventsCSVRejectsTooLargeExport(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM audit_events`)).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(maxAuditExportRows + 1))
	result, err := ExportAuditEventsCSV(context.Background(), AuditFilters{})
	if err == nil {
		t.Fatal("expected export too large")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeAuditExportTooLarge || result.RowCount != maxAuditExportRows+1 {
		t.Fatalf("unexpected error/result: %#v %+v", err, result)
	}
}

func TestAuditExportMetadataExcludesRawSearchAndContent(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("audit_export_succeeded", map[string]interface{}{"rowCount": 2, "filterTypes": []string{"search"}, "truncated": false, "search": "secret", "csv": "contents"})
	if err != nil {
		t.Fatalf("sanitize failed: %v", err)
	}
	if metadata["search"] != nil || metadata["csv"] != nil || metadata["rowCount"] != 2 {
		t.Fatalf("unexpected export audit metadata: %+v", metadata)
	}
}

func sqlNull(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
}

func TestParseAuditRetentionDays(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    int
		wantErr bool
	}{
		{name: "default", value: "", want: DefaultAuditRetentionDays},
		{name: "custom", value: "730", want: 730},
		{name: "minimum", value: "30", want: 30},
		{name: "maximum", value: "3650", want: 3650},
		{name: "too low", value: "29", wantErr: true},
		{name: "too high", value: "3651", wantErr: true},
		{name: "not numeric", value: "year", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseAuditRetentionDays(tt.value)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %d want %d", got, tt.want)
			}
		})
	}
}

func TestAuditRetentionCutoffUsesUTC(t *testing.T) {
	now := time.Date(2026, 7, 15, 10, 30, 0, 0, time.FixedZone("offset", 2*60*60))
	cutoff := AuditRetentionCutoff(now, 365)
	if cutoff.Location() != time.UTC {
		t.Fatalf("cutoff should be UTC: %s", cutoff.Location())
	}
	if cutoff.Format(time.RFC3339) != "2025-07-15T08:30:00Z" {
		t.Fatalf("unexpected cutoff %s", cutoff.Format(time.RFC3339))
	}
}

func TestDeleteAuditEventsBeforeDryRunCountsOnly(t *testing.T) {
	mock := withMockDatabase(t)
	cutoff := time.Date(2025, 7, 15, 0, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM audit_events WHERE created_at < $1`)).
		WithArgs(cutoff).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))
	result, err := DeleteAuditEventsBefore(context.Background(), cutoff, 500, true, 365)
	if err != nil {
		t.Fatalf("DeleteAuditEventsBefore failed: %v", err)
	}
	if result.EligibleCount != 12 || result.DeletedCount != 0 || !result.DryRun {
		t.Fatalf("unexpected result: %#v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteAuditEventsBeforeDeletesInBatches(t *testing.T) {
	mock := withMockDatabase(t)
	cutoff := time.Date(2025, 7, 15, 0, 0, 0, 0, time.UTC)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM audit_events WHERE created_at < $1`)).
		WithArgs(cutoff).WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(503))
	deleteSQL := regexp.QuoteMeta(`WITH doomed AS (SELECT id FROM audit_events WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM audit_events WHERE id IN (SELECT id FROM doomed)`)
	mock.ExpectExec(deleteSQL).WithArgs(cutoff, 500).WillReturnResult(sqlmock.NewResult(0, 500))
	mock.ExpectExec(deleteSQL).WithArgs(cutoff, 500).WillReturnResult(sqlmock.NewResult(0, 3))
	result, err := DeleteAuditEventsBefore(context.Background(), cutoff, 500, false, 365)
	if err != nil {
		t.Fatalf("DeleteAuditEventsBefore failed: %v", err)
	}
	if result.EligibleCount != 503 || result.DeletedCount != 503 || result.DryRun {
		t.Fatalf("unexpected result: %#v", result)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
