package services

import (
	"context"
	"regexp"
	"os"
	"path/filepath"
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
