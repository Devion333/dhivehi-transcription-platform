package services

import (
	"context"
	"database/sql"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestFolderValidation(t *testing.T) {
	if _, _, err := validateFolderInput("", ""); err == nil {
		t.Fatal("expected required folder name")
	}
	if _, _, err := validateFolderInput(strings.Repeat("x", maxFolderNameRunes+1), ""); err == nil {
		t.Fatal("expected long folder name rejection")
	}
	if _, _, err := validateFolderInput("Case", "bad\x00description"); err == nil {
		t.Fatal("expected control character rejection")
	}
}

func TestFolderAuditMetadataExcludesNamesDescriptionsAndContent(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("transcript_added_to_folder", map[string]interface{}{"folderId": "folder", "jobId": "job", "folderName": "secret", "description": "private", "transcriptText": "content"})
	if err != nil {
		t.Fatal(err)
	}
	if metadata["folderId"] != "folder" || metadata["jobId"] != "job" {
		t.Fatalf("expected safe metadata, got %#v", metadata)
	}
	for _, key := range []string{"folderName", "description", "transcriptText"} {
		if _, ok := metadata[key]; ok {
			t.Fatalf("sensitive key %q leaked", key)
		}
	}
}

func TestFolderMigrationSchema(t *testing.T) {
	contents, err := os.ReadFile("../../migrations/004_transcript_folders.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(contents)
	for _, required := range []string{"CREATE TABLE IF NOT EXISTS transcript_folders", "CREATE TABLE IF NOT EXISTS transcript_folder_items", "REFERENCES users(id)", "transcript_folders_owner_name_lower_idx", "UNIQUE (transcript_job_id)"} {
		if !strings.Contains(sql, required) {
			t.Fatalf("migration missing %q", required)
		}
	}
}

func TestListFoldersScopesStandardUser(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM transcript_folders f WHERE 1=1 AND f.owner_user_id = $1`)).WithArgs("user-1").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery("SELECT f.id::text").WithArgs("user-1", 20, 0).WillReturnRows(sqlmock.NewRows([]string{"id", "owner_user_id", "name", "name", "description", "count", "created_at", "updated_at"}).AddRow("folder-1", "user-1", "User One", "Case", "", 0, time.Now(), time.Now()))
	result, err := ListFolders(context.Background(), TranscriptAccessScope{UserID: "user-1"}, FolderListFilters{})
	if err != nil || len(result.Items) != 1 || result.Items[0].OwnerUserID != "user-1" {
		t.Fatalf("unexpected result=%+v err=%v", result, err)
	}
}

func TestDeleteNonEmptyFolderFails(t *testing.T) {
	mock := withMockDatabase(t)
	folderID := "11111111-1111-1111-1111-111111111111"
	mock.ExpectQuery("SELECT f.id::text").WithArgs(folderID).WillReturnRows(sqlmock.NewRows([]string{"id", "owner_user_id", "name", "name", "description", "count", "created_at", "updated_at"}).AddRow(folderID, "user-1", "User One", "Case", "", 1, time.Now(), time.Now()))
	if err := DeleteFolder(context.Background(), TranscriptAccessScope{UserID: "user-1"}, folderID); err == nil {
		t.Fatal("expected non-empty folder deletion to fail")
	}
}

func TestRemoveTranscriptFolderMembership(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM transcript_folder_items WHERE transcript_job_id = $1`)).WithArgs("job-1").WillReturnResult(sqlmock.NewResult(0, 1))
	if err := RemoveTranscriptFolderMembership(context.Background(), "job-1"); err != nil {
		t.Fatal(err)
	}
}

func TestFolderMembershipEnrichesTranscriptSummaries(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now()
	mock.ExpectQuery("SELECT i.transcript_job_id").WithArgs("job-1", "user-1").WillReturnRows(sqlmock.NewRows([]string{"job", "id", "owner", "owner_name", "name", "description", "count", "created", "updated"}).AddRow("job-1", "folder-1", "user-1", "User One", "Case", "", 0, now, now))
	items := EnrichTranscriptSummariesWithFolders(context.Background(), TranscriptAccessScope{UserID: "user-1"}, []dtos.TranscriptSummary{{JobID: "job-1"}})
	if items[0].FolderID != "folder-1" || items[0].FolderName != "Case" {
		t.Fatalf("expected folder metadata, got %+v", items[0])
	}
}

func TestFolderJobIDSetForFilterRequiresAccess(t *testing.T) {
	mock := withMockDatabase(t)
	folderID := "11111111-1111-1111-1111-111111111111"
	mock.ExpectQuery("SELECT f.id::text").WithArgs(folderID).WillReturnRows(sqlmock.NewRows([]string{"id", "owner_user_id", "name", "name", "description", "count", "created_at", "updated_at"}).AddRow(folderID, "other-user", "Other", "Case", "", 0, time.Now(), time.Now()))
	_, err := FolderJobIDSetForFilter(context.Background(), TranscriptAccessScope{UserID: "user-1"}, folderID)
	if err == nil {
		t.Fatal("expected inaccessible folder to be hidden")
	}
}

var _ = sql.ErrNoRows
