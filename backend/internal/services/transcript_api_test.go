package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestNormalizePagination(t *testing.T) {
	tests := []struct {
		name         string
		page         int
		pageSize     int
		expectedPage int
		expectedSize int
	}{
		{"defaults invalid values", 0, -1, 1, 20},
		{"keeps valid values", 3, 50, 3, 50},
		{"clamps max page size", 2, 500, 2, 100},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			page, size := NormalizePagination(test.page, test.pageSize)
			if page != test.expectedPage || size != test.expectedSize {
				t.Fatalf("expected page=%d size=%d, got page=%d size=%d", test.expectedPage, test.expectedSize, page, size)
			}
		})
	}
}

func TestMapParentSummaryDefaultsAndStatus(t *testing.T) {
	payload := map[string]interface{}{
		"job_id":        "job-1",
		"filename":      "sample.wav",
		"status":        "completed",
		"segment_count": float64(4),
		"timestamp":     "2026-07-15T00:00:00Z",
	}

	summary := MapParentSummary(payload)
	if summary.JobID != "job-1" {
		t.Fatalf("expected job id job-1, got %q", summary.JobID)
	}
	if summary.Status != "transcribed" {
		t.Fatalf("expected completed to map to transcribed, got %q", summary.Status)
	}
	if summary.Category != "Uncategorized" || summary.ReferenceNumber != "N/A" || summary.AnalysisStatus != "not_started" {
		t.Fatalf("defaults not applied: %+v", summary)
	}
	if summary.SegmentCount != 4 {
		t.Fatalf("expected segment count 4, got %d", summary.SegmentCount)
	}
}

func TestMapAnalysisDefaults(t *testing.T) {
	analysis := MapAnalysis(map[string]interface{}{})
	if analysis.Status != "not_started" {
		t.Fatalf("expected not_started, got %q", analysis.Status)
	}
	if len(analysis.Keywords) != 0 {
		t.Fatalf("expected empty keywords, got %+v", analysis.Keywords)
	}
	entities, ok := analysis.Entities.(map[string][]string)
	if !ok {
		t.Fatalf("expected default entity map, got %T", analysis.Entities)
	}
	for _, key := range []string{"persons", "locations", "organizations", "events"} {
		if _, ok := entities[key]; !ok {
			t.Fatalf("missing default entity key %q", key)
		}
	}
}

func TestPublicMediaURLUsesConfiguredBase(t *testing.T) {
	t.Setenv("MINIO_PUBLIC_URL", "https://media.example.test")
	got := PublicMediaURL("http://minio:9000/uploads/object.wav")
	expected := "https://media.example.test/uploads/object.wav"
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestFindSegmentForUpdateValidatesOwnership(t *testing.T) {
	segments := []QdrantPoint{
		{Payload: map[string]interface{}{
			"parent_job_id":   "other-job",
			"segment_index":   float64(0),
			"transcript_text": "text",
		}},
	}

	_, err := findSegmentForUpdate("job-1", "job-1_seg_000", segments)
	if err == nil {
		t.Fatal("expected ownership conflict")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeSegmentConflict {
		t.Fatalf("expected segment conflict service error, got %#v", err)
	}
}

func TestFindSegmentForUpdateSupportsDeterministicID(t *testing.T) {
	segments := []QdrantPoint{
		{Payload: map[string]interface{}{
			"parent_job_id": "job-1",
			"segment_index": float64(2),
		}},
	}

	segment, err := findSegmentForUpdate("job-1", "job-1_seg_002", segments)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if segment == nil || getInt(segment.Payload, "segment_index", -1) != 2 {
		t.Fatalf("expected segment index 2, got %+v", segment)
	}
}

func TestSearchTranscriptsRejectsInvalidStatus(t *testing.T) {
	_, err := SearchTranscripts(TranscriptAccessScope{UserID: "user-1"}, TranscriptSearchFilters{Status: "unsupported"})
	if err == nil {
		t.Fatal("expected invalid status error")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeInvalidSearchFilter {
		t.Fatalf("expected invalid search filter error, got %#v", err)
	}
}

func TestListParentTranscriptPointsForScopeFiltersStandardUser(t *testing.T) {
	parents := []QdrantPoint{
		{Payload: map[string]interface{}{"job_id": "owned", "owner_user_id": "user-1"}},
		{Payload: map[string]interface{}{"job_id": "other", "owner_user_id": "user-2"}},
		{Payload: map[string]interface{}{"job_id": "legacy"}},
	}

	filtered := filterParentTranscriptPointsForScope(TranscriptAccessScope{UserID: "user-1"}, parents)
	if len(filtered) != 1 || getString(filtered[0].Payload, "job_id", "") != "owned" {
		t.Fatalf("expected only owned transcript, got %+v", filtered)
	}
}

func TestListParentTranscriptPointsForScopeAllowsAdminLegacy(t *testing.T) {
	parents := []QdrantPoint{
		{Payload: map[string]interface{}{"job_id": "owned", "owner_user_id": "user-1"}},
		{Payload: map[string]interface{}{"job_id": "legacy"}},
	}

	filtered := filterParentTranscriptPointsForScope(TranscriptAccessScope{IsAdmin: true}, parents)
	if len(filtered) != 2 {
		t.Fatalf("expected admin to see all transcripts, got %+v", filtered)
	}
}

func TestMatchExcerptPreservesDhivehi(t *testing.T) {
	text := "މިއީ ދިވެހި ޓެކްސްޓް ސެގްމަންޓެއް"
	excerpt := MatchExcerpt(text, "ދިވެހި", 3)
	if !literalContains(excerpt, "ދިވެހި") {
		t.Fatalf("expected excerpt to contain query, got %q", excerpt)
	}
}

func TestBuildTranscriptSearchResponseEnrichesParentsAndOrdersResults(t *testing.T) {
	segments := []QdrantPoint{
		{Payload: map[string]interface{}{"parent_job_id": "old", "segment_index": float64(2), "speaker": "SPEAKER_01", "start_time": float64(8), "end_time": float64(9), "transcript_text": "meeting alpha"}},
		{Payload: map[string]interface{}{"parent_job_id": "new", "segment_index": float64(1), "speaker": "SPEAKER_00", "start_time": float64(1), "end_time": float64(2), "transcript_text": "Alpha latest"}},
		{Payload: map[string]interface{}{"parent_job_id": "new", "segment_index": float64(0), "speaker": "SPEAKER_00", "start_time": float64(0), "end_time": float64(1), "transcript_text": "alpha first"}},
	}
	parents := []QdrantPoint{
		{Payload: map[string]interface{}{"job_id": "old", "filename": "old.wav", "reference_number": "OLD", "category": "meeting", "status": "transcribed", "timestamp": "2026-07-14T00:00:00Z"}},
		{Payload: map[string]interface{}{"job_id": "new", "filename": "new.wav", "reference_number": "NEW", "category": "meeting", "status": "transcribed", "timestamp": "2026-07-15T00:00:00Z"}},
	}

	result := BuildTranscriptSearchResponse(TranscriptSearchFilters{Query: "ALPHA", Page: 1, PageSize: 20, Status: "transcribed", Category: "meeting"}, segments, parents)
	if result.Query != "ALPHA" || result.Pagination.Total != 3 {
		t.Fatalf("unexpected response: %+v", result)
	}
	if got := result.Items[0]; got.JobID != "new" || got.SegmentIndex != 0 || got.Filename != "new.wav" {
		t.Fatalf("expected newest parent then segment index ordering, got %+v", got)
	}
	if got := result.Items[1]; got.JobID != "new" || got.SegmentIndex != 1 {
		t.Fatalf("expected second new segment, got %+v", got)
	}
}

func TestBuildTranscriptSearchResponseMissingParentFallback(t *testing.T) {
	segments := []QdrantPoint{{Payload: map[string]interface{}{"parent_job_id": "missing", "segment_index": float64(3), "transcript_text": "ދިވެހި text"}}}
	result := BuildTranscriptSearchResponse(TranscriptSearchFilters{Query: "ދިވެހި", Page: 1, PageSize: 20}, segments, nil)
	if len(result.Items) != 0 {
		t.Fatalf("expected orphaned segment to be excluded, got %+v", result)
	}
}

func TestBuildTranscriptSearchResponsePaginates(t *testing.T) {
	segments := []QdrantPoint{
		{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(0), "transcript_text": "alpha zero"}},
		{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(1), "transcript_text": "alpha one"}},
		{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(2), "transcript_text": "alpha two"}},
	}
	parents := []QdrantPoint{{Payload: map[string]interface{}{"job_id": "job", "timestamp": "2026-07-15T00:00:00Z"}}}
	result := BuildTranscriptSearchResponse(TranscriptSearchFilters{Query: "alpha", Page: 2, PageSize: 2}, segments, parents)
	if result.Pagination.Total != 3 || result.Pagination.TotalPages != 2 || len(result.Items) != 1 || result.Pagination.HasNextPage {
		t.Fatalf("unexpected pagination: %+v", result.Pagination)
	}
	if result.Items[0].SegmentIndex != 2 {
		t.Fatalf("expected page two item index 2, got %+v", result.Items[0])
	}
}

func TestBuildTranscriptSearchResponseMetadataOnlyResultOmitsSegment(t *testing.T) {
	parents := []QdrantPoint{{Payload: map[string]interface{}{"job_id": "job", "filename": "case-file.wav", "reference_number": "REF-1", "status": "transcribed", "timestamp": "2026-07-15T00:00:00Z"}}}
	result := BuildTranscriptSearchResponse(TranscriptSearchFilters{Query: "case-file", Page: 1, PageSize: 20}, nil, parents)
	if len(result.Items) != 1 || result.Items[0].SegmentID != "" || result.Items[0].JobID != "job" {
		t.Fatalf("expected metadata-only result without segment id, got %+v", result.Items)
	}
}

func TestBuildTranscriptSearchResponseAdminOwnerFilter(t *testing.T) {
	parents := []QdrantPoint{
		{Payload: map[string]interface{}{"job_id": "owned", "filename": "one.wav", "owner_user_id": "user-1", "timestamp": "2026-07-15T00:00:00Z"}},
		{Payload: map[string]interface{}{"job_id": "other", "filename": "two.wav", "owner_user_id": "user-2", "timestamp": "2026-07-15T00:00:00Z"}},
	}
	result := BuildTranscriptSearchResponse(TranscriptSearchFilters{OwnerUserID: "user-1", Page: 1, PageSize: 20}, nil, parents)
	if len(result.Items) != 1 || result.Items[0].JobID != "owned" {
		t.Fatalf("expected owner-filtered result, got %+v", result.Items)
	}
}

func TestValidateTranscriptSearchFiltersRejectsInvalidDate(t *testing.T) {
	err := validateTranscriptSearchFilters(TranscriptSearchFilters{CreatedFrom: "not-a-date"})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeInvalidSearchFilter {
		t.Fatalf("expected invalid search filter, got %#v", err)
	}
}

func TestBuildTranscriptSearchResponseTranscriptTextIncludesSegmentID(t *testing.T) {
	parents := []QdrantPoint{{Payload: map[string]interface{}{"job_id": "job", "filename": "case.wav", "status": "transcribed", "timestamp": "2026-07-15T00:00:00Z", "speaker_names": map[string]interface{}{"SPEAKER_00": "Officer Ahmed"}}}}
	segments := []QdrantPoint{{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(0), "speaker": "SPEAKER_00", "start_time": float64(12.5), "end_time": float64(18.2), "transcript_text": "ދިވެހި text"}}}
	result := BuildTranscriptSearchResponse(TranscriptSearchFilters{Query: "ދިވެހި", Page: 1, PageSize: 20}, segments, parents)
	if len(result.Items) != 1 || result.Items[0].SegmentID != "job_seg_000" || result.Items[0].SpeakerDisplayName != "Officer Ahmed" {
		t.Fatalf("expected segment result with speaker display name, got %+v", result.Items)
	}
}

func TestTranscriptDownloadRenderers(t *testing.T) {
	detail := dtos.TranscriptDetail{JobID: "job", Filename: "case.wav", ReferenceNumber: "REF/Unsafe", Category: "Call", SpeakerNames: map[string]string{"SPEAKER_00": "Officer Ahmed"}, Segments: []dtos.Segment{{ID: "seg", SegmentIndex: 0, Speaker: "SPEAKER_00", StartTime: 12.5, EndTime: 18.2, TranscriptText: "ދިވެހި text", Status: "transcribed"}}}
	if txt := renderTranscriptTXT(detail); !strings.Contains(txt, "ދިވެހި") || !strings.Contains(txt, "Officer Ahmed") {
		t.Fatalf("txt did not preserve unicode/speaker: %q", txt)
	}
	if srt := renderTranscriptSubtitles(detail, "srt"); !strings.Contains(srt, "1\n00:00:12,500 --> 00:00:18,200") || !strings.Contains(srt, "Officer Ahmed") {
		t.Fatalf("unexpected srt: %q", srt)
	}
	if vtt := renderTranscriptSubtitles(detail, "vtt"); !strings.HasPrefix(vtt, "WEBVTT\n\n00:00:12.500 --> 00:00:18.200") {
		t.Fatalf("unexpected vtt: %q", vtt)
	}
	if safeDownloadBaseName(detail.ReferenceNumber) != "REFUnsafe" {
		t.Fatalf("unsafe filename was not cleaned: %q", safeDownloadBaseName(detail.ReferenceNumber))
	}
	jsonDoc := MapTranscriptDownloadDocument(TranscriptAccessScope{}, detail)
	if jsonDoc.Segments[0].SpeakerDisplayName != "Officer Ahmed" || jsonDoc.OwnerUserID != "" {
		t.Fatalf("unexpected json document: %+v", jsonDoc)
	}
}

func TestTranscriptDownloadValidationAndAuditSafety(t *testing.T) {
	if supportedTranscriptDownloadFormat("exe") {
		t.Fatal("unsupported format should be rejected")
	}
	if err := validateDownloadSegments([]dtos.Segment{{StartTime: 10, EndTime: 1}}); err == nil {
		t.Fatal("expected invalid timestamp error")
	}
	metadata, err := SanitizeAuditMetadata("transcript_download_succeeded", map[string]interface{}{"jobId": "job", "format": "txt", "content": "secret transcript"})
	if err != nil {
		t.Fatalf("sanitize failed: %v", err)
	}
	if metadata["jobId"] != "job" || metadata["format"] != "txt" || metadata["content"] != nil {
		t.Fatalf("unexpected audit metadata: %+v", metadata)
	}
}

func TestMapTranscriptDetailIncludesSpeakerNames(t *testing.T) {
	detail := MapTranscriptDetail(map[string]interface{}{"job_id": "job", "speaker_names": map[string]interface{}{"SPEAKER_00": "Officer Ahmed"}}, nil)
	if detail.SpeakerNames["SPEAKER_00"] != "Officer Ahmed" {
		t.Fatalf("expected speaker mapping in detail, got %+v", detail.SpeakerNames)
	}
}

func TestMapTranscriptStatusNormalizesProcessingStages(t *testing.T) {
	tests := []struct {
		name           string
		parent         map[string]interface{}
		segments       []QdrantPoint
		expectedStatus string
		expectedStage  string
		terminal       bool
	}{
		{"queued conversion", map[string]interface{}{"job_id": "job", "status": "uploaded"}, nil, "queued_conversion", JobStageConversion, false},
		{"diarizing", map[string]interface{}{"job_id": "job", "status": "diarizing"}, nil, "diarizing", JobStageDiarization, false},
		{"transcribing", map[string]interface{}{"job_id": "job", "status": "diarized"}, nil, "transcribing", JobStageTranscription, false},
		{"ready", map[string]interface{}{"job_id": "job", "status": "transcribed"}, nil, "transcribed", "complete", true},
		{"analysis", map[string]interface{}{"job_id": "job", "status": "transcribed", "analysis_status": "processing"}, nil, "analysing", JobStageAnalysis, false},
		{"complete", map[string]interface{}{"job_id": "job", "status": "transcribed", "analysis_status": "complete"}, nil, "complete", "complete", true},
		{"segment failure", map[string]interface{}{"job_id": "job", "status": "transcribed"}, []QdrantPoint{{Payload: map[string]interface{}{"status": "transcription_failed"}}}, "failed", JobStageTranscription, true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			status := MapTranscriptStatus(test.parent, test.segments, false)
			if status.Status != test.expectedStatus || status.Stage != test.expectedStage || status.IsTerminal != test.terminal {
				t.Fatalf("unexpected status: %+v", status)
			}
		})
	}
}

func TestMapTranscriptStatusRedactsFailureForStandardUsers(t *testing.T) {
	parent := map[string]interface{}{"job_id": "job", "status": "conversion_failed", "conversion_error": "open /srv/secret/file.wav: denied"}
	standard := MapTranscriptStatus(parent, nil, false)
	admin := MapTranscriptStatus(parent, nil, true)
	if standard.FailureCode == nil || *standard.FailureCode != "CONVERSION_FAILED" {
		t.Fatalf("expected conversion failure code, got %+v", standard.FailureCode)
	}
	if standard.FailureMessage == nil || strings.Contains(*standard.FailureMessage, "secret") {
		t.Fatalf("expected redacted standard message, got %+v", standard.FailureMessage)
	}
	if admin.FailureMessage == nil || !strings.Contains(*admin.FailureMessage, "[redacted]") {
		t.Fatalf("expected safe admin failure detail, got %+v", admin.FailureMessage)
	}
}

func TestUpdateSpeakerNameOwnerPersistsMapping(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job", "owner_user_id": "owner", "speaker_names": map[string]interface{}{}}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)

	result, err := UpdateSpeakerName(TranscriptAccessScope{UserID: "owner"}, "job", "SPEAKER_00", " Officer Ahmed ")
	if err != nil {
		t.Fatalf("UpdateSpeakerName failed: %v", err)
	}
	if result.DisplayName != "Officer Ahmed" || result.SpeakerNames["SPEAKER_00"] != "Officer Ahmed" {
		t.Fatalf("unexpected response: %+v", result)
	}
	stored, ok := payload["speaker_names"].(map[string]interface{})
	if !ok || stored["SPEAKER_00"] != "Officer Ahmed" {
		t.Fatalf("expected persisted mapping, got %+v", payload)
	}
}

func TestUpdateSpeakerNameAdminCanRenameLegacyTranscript(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)

	if _, err := UpdateSpeakerName(TranscriptAccessScope{IsAdmin: true}, "job", "SPEAKER_01", "Interviewee"); err != nil {
		t.Fatalf("admin should rename legacy transcript: %v", err)
	}
}

func TestUpdateSpeakerNameRejectsOtherUserAndLegacyForStandardUser(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job", "owner_user_id": "owner"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)

	_, err := UpdateSpeakerName(TranscriptAccessScope{UserID: "other"}, "job", "SPEAKER_00", "Name")
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeForbidden {
		t.Fatalf("expected forbidden for other user, got %#v", err)
	}

	server = speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)
	_, err = UpdateSpeakerName(TranscriptAccessScope{UserID: "owner"}, "job", "SPEAKER_00", "Name")
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeForbidden {
		t.Fatalf("expected forbidden for ownerless legacy standard user, got %#v", err)
	}
}

func TestUpdateSpeakerNameRejectsInvalidInputs(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job", "owner_user_id": "owner"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)

	tests := []struct {
		name        string
		speakerKey  string
		displayName string
		code        string
	}{
		{"unknown speaker", "SPEAKER_99", "Name", ErrCodeInvalidSpeakerKey},
		{"empty name", "SPEAKER_00", " ", ErrCodeInvalidSpeakerName},
		{"overlong name", "SPEAKER_00", strings.Repeat("A", maxSpeakerNameRunes+1), ErrCodeInvalidSpeakerName},
		{"control char", "SPEAKER_00", "Bad\nName", ErrCodeInvalidSpeakerName},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := UpdateSpeakerName(TranscriptAccessScope{UserID: "owner"}, "job", test.speakerKey, test.displayName)
			var serviceErr *ServiceError
			if !errors.As(err, &serviceErr) || serviceErr.Code != test.code {
				t.Fatalf("expected %s, got %#v", test.code, err)
			}
		})
	}
}

func TestUpdateSpeakerNameResetRemovesMappingAndSegmentsRemainUnchanged(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job", "owner_user_id": "owner", "speaker_names": map[string]interface{}{"SPEAKER_00": "Officer Ahmed"}}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)

	result, err := UpdateSpeakerName(TranscriptAccessScope{UserID: "owner"}, "job", "SPEAKER_00", "SPEAKER_00")
	if err != nil {
		t.Fatalf("reset failed: %v", err)
	}
	if !result.Reset || result.DisplayName != "SPEAKER_00" {
		t.Fatalf("expected reset response, got %+v", result)
	}
	stored, ok := payload["speaker_names"].(map[string]interface{})
	if !ok || stored["SPEAKER_00"] != nil {
		t.Fatalf("expected mapping removal, got %+v", payload)
	}
}

func TestReassignTranscriptOwnerAssignsOwnerlessTranscript(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)
	mock := withMockDatabase(t)
	now := time.Now()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1`)).
		WithArgs("target").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow("target", "Target User", "target@example.com", "hash", "user", true, now, now, sql.NullTime{}))

	result, err := ReassignTranscriptOwner(context.Background(), "job", "target")
	if err != nil {
		t.Fatalf("ReassignTranscriptOwner failed: %v", err)
	}
	if result.PreviousOwnerUserID != "" || payload["owner_user_id"] != "target" || payload["owner_display_name"] != "Target User" || payload["owner_email"] != "target@example.com" {
		t.Fatalf("unexpected reassignment result=%+v payload=%+v", result, payload)
	}
}

func TestReassignTranscriptOwnerRejectsSameOwnerAndInactiveTarget(t *testing.T) {
	var payload map[string]interface{}
	server := speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job", "owner_user_id": "target"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)
	mock := withMockDatabase(t)
	now := time.Now()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1`)).
		WithArgs("target").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow("target", "Target User", "target@example.com", "hash", "user", true, now, now, sql.NullTime{}))
	_, err := ReassignTranscriptOwner(context.Background(), "job", "target")
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeTranscriptOwnerUnchanged {
		t.Fatalf("expected owner unchanged error, got %#v", err)
	}

	server = speakerRenameQdrantServer(t, map[string]interface{}{"job_id": "job", "owner_user_id": "owner"}, &payload)
	t.Setenv("QDRANT_HOST", server.URL)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1`)).
		WithArgs("inactive").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow("inactive", "Inactive", "inactive@example.com", "hash", "user", false, now, now, sql.NullTime{}))
	_, err = ReassignTranscriptOwner(context.Background(), "job", "inactive")
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeTargetUserInactive {
		t.Fatalf("expected inactive target error, got %#v", err)
	}
}

func TestTranscriptReassignmentAuditMetadataExcludesSnapshots(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("transcript_reassignment_succeeded", map[string]interface{}{"jobId": "job", "previousOwnerUserId": "old", "newOwnerUserId": "new", "ownerEmail": "new@example.com", "ownerDisplayName": "New"})
	if err != nil {
		t.Fatalf("sanitize failed: %v", err)
	}
	if metadata["ownerEmail"] != nil || metadata["ownerDisplayName"] != nil || metadata["newOwnerUserId"] != "new" {
		t.Fatalf("unexpected audit metadata: %+v", metadata)
	}
}

func speakerRenameQdrantServer(t *testing.T, parentPayload map[string]interface{}, updatedPayload *map[string]interface{}) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/collections/file_metadata/points/payload" {
			var body struct {
				Payload map[string]interface{} `json:"payload"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode payload request: %v", err)
			}
			*updatedPayload = body.Payload
			_, _ = w.Write([]byte(`{"result":{}}`))
			return
		}
		var body struct {
			Filter struct {
				Must []struct {
					Key string `json:"key"`
				} `json:"must"`
			} `json:"filter"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode scroll request: %v", err)
		}
		isSegmentScroll := false
		for _, clause := range body.Filter.Must {
			if clause.Key == "parent_job_id" {
				isSegmentScroll = true
			}
		}
		if isSegmentScroll {
			_, _ = w.Write([]byte(`{"result":{"points":[{"id":2,"payload":{"type":"segment","parent_job_id":"job","segment_index":0,"speaker":"SPEAKER_00"}},{"id":3,"payload":{"type":"segment","parent_job_id":"job","segment_index":1,"speaker":"SPEAKER_01"}}]}}`))
			return
		}
		response := map[string]interface{}{"result": map[string]interface{}{"points": []map[string]interface{}{{"id": 1, "payload": parentPayload}}}}
		_ = json.NewEncoder(w).Encode(response)
	}))
	t.Cleanup(server.Close)
	return server
}
