package services

import (
	"errors"
	"testing"
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

func TestSearchTranscriptTextRejectsEmptyQuery(t *testing.T) {
	_, err := SearchTranscriptText("   ", 1, 20, "", "")
	if err == nil {
		t.Fatal("expected empty query error")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeSearchQueryRequired {
		t.Fatalf("expected search query required error, got %#v", err)
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

	result := BuildTranscriptSearchResponse("ALPHA", 1, 20, "transcribed", "meeting", segments, parents)
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
	result := BuildTranscriptSearchResponse("ދިވެހި", 1, 20, "", "", segments, nil)
	if len(result.Items) != 1 {
		t.Fatalf("expected one result, got %+v", result)
	}
	item := result.Items[0]
	if item.Filename != "Unknown" || item.ReferenceNumber != "N/A" || item.TranscriptStatus != "uploaded" {
		t.Fatalf("fallbacks not applied: %+v", item)
	}
}

func TestBuildTranscriptSearchResponsePaginates(t *testing.T) {
	segments := []QdrantPoint{
		{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(0), "transcript_text": "alpha zero"}},
		{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(1), "transcript_text": "alpha one"}},
		{Payload: map[string]interface{}{"parent_job_id": "job", "segment_index": float64(2), "transcript_text": "alpha two"}},
	}
	parents := []QdrantPoint{{Payload: map[string]interface{}{"job_id": "job", "timestamp": "2026-07-15T00:00:00Z"}}}
	result := BuildTranscriptSearchResponse("alpha", 2, 2, "", "", segments, parents)
	if result.Pagination.Total != 3 || result.Pagination.TotalPages != 2 || len(result.Items) != 1 || result.Pagination.HasNextPage {
		t.Fatalf("unexpected pagination: %+v", result.Pagination)
	}
	if result.Items[0].SegmentIndex != 2 {
		t.Fatalf("expected page two item index 2, got %+v", result.Items[0])
	}
}
