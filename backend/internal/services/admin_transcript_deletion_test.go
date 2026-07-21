// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: admin_transcript_deletion_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTranscriptDeletionPreviewBlocksProcessingTranscript(t *testing.T) {
	server := deletionQdrantServer(t, map[string]interface{}{"job_id": "job-1", "filename": "test.wav", "status": "transcribing"}, nil)
	t.Setenv("QDRANT_HOST", server.URL)
	preview, err := GetTranscriptDeletionPreview(context.Background(), "job-1")
	if err != nil {
		t.Fatalf("preview failed: %v", err)
	}
	if preview.CanDelete || preview.BlockingReason == nil || *preview.BlockingReason != transcriptProcessingReason {
		t.Fatalf("expected processing block, got %+v", preview)
	}
}

func TestDeleteAdminTranscriptRequiresMatchingConfirmation(t *testing.T) {
	_, err := DeleteAdminTranscript(context.Background(), "job-1", "other")
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeDeleteConfirmationMismatch {
		t.Fatalf("expected confirmation mismatch, got %#v", err)
	}
}

func TestCollectMediaObjectRefsDedupesAndRejectsUnsafe(t *testing.T) {
	refs, err := collectMediaObjectRefs(map[string]interface{}{"minio_url": "http://minio:9000/uploads/job-1.wav"}, []QdrantPoint{{Payload: map[string]interface{}{"minio_url": "http://minio:9000/uploads/job-1.wav"}}, {Payload: map[string]interface{}{"minio_url": "http://minio:9000/audio/job-1.wav"}}})
	if err != nil {
		t.Fatalf("collect refs failed: %v", err)
	}
	if len(refs) != 2 {
		t.Fatalf("expected deduped refs, got %+v", refs)
	}
	_, err = collectMediaObjectRefs(map[string]interface{}{"minio_url": "http://minio:9000/uploads/../secret"}, nil)
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeUnsafeMediaReference {
		t.Fatalf("expected unsafe media error, got %#v", err)
	}
}

func TestDeleteAdminTranscriptDeletesSegmentsThenParent(t *testing.T) {
	deleteFilters := []string{}
	server := deletionQdrantServer(t, map[string]interface{}{"job_id": "job-1", "filename": "test.wav", "status": "transcribed"}, &deleteFilters)
	t.Setenv("QDRANT_HOST", server.URL)
	MinioClient = nil
	RedisClient = nil
	result, err := DeleteAdminTranscript(context.Background(), "job-1", "job-1")
	if err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if !result.Deleted || result.SegmentCount != 2 {
		t.Fatalf("unexpected delete response: %+v", result)
	}
	if len(deleteFilters) != 2 || !strings.Contains(deleteFilters[0], "parent_job_id") || !strings.Contains(deleteFilters[1], "job_id") {
		t.Fatalf("expected segment then parent delete filters, got %+v", deleteFilters)
	}
}

func TestRepeatedDeleteAfterMissingTranscriptReturnsNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":{"points":[]}}`))
	}))
	defer server.Close()
	t.Setenv("QDRANT_HOST", server.URL)
	_, err := DeleteAdminTranscript(context.Background(), "missing", "missing")
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeTranscriptNotFound {
		t.Fatalf("expected transcript not found, got %#v", err)
	}
}

func TestTranscriptDeletionAuditMetadataExcludesSensitiveValues(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("transcript_deletion_failed", map[string]interface{}{"jobId": "job-1", "segmentCount": 2, "mediaObjectCount": 1, "failureCode": ErrCodeTranscriptDeletionPartial, "partialCleanupCategories": []string{"media"}, "transcriptText": "secret", "minioURL": "http://minio:9000/uploads/job-1.wav"})
	if err != nil {
		t.Fatalf("sanitize failed: %v", err)
	}
	if _, ok := metadata["transcriptText"]; ok {
		t.Fatalf("transcript text leaked into audit metadata: %+v", metadata)
	}
	if _, ok := metadata["minioURL"]; ok {
		t.Fatalf("minio URL leaked into audit metadata: %+v", metadata)
	}
}

func deletionQdrantServer(t *testing.T, parent map[string]interface{}, deleteFilters *[]string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.Path, "/points/delete") {
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode delete body: %v", err)
			}
			if deleteFilters != nil {
				data, _ := json.Marshal(body["filter"])
				*deleteFilters = append(*deleteFilters, string(data))
			}
			_, _ = w.Write([]byte(`{"result":{}}`))
			return
		}
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode scroll body: %v", err)
		}
		data, _ := json.Marshal(body)
		if strings.Contains(string(data), "parent_job_id") {
			_, _ = w.Write([]byte(`{"result":{"points":[{"id":2,"payload":{"type":"segment","parent_job_id":"job-1","segment_index":0,"speaker":"SPEAKER_00","minio_url":"http://minio:9000/audio/job-1.wav"}},{"id":3,"payload":{"type":"segment","parent_job_id":"job-1","segment_index":1,"speaker":"SPEAKER_01"}}]}}`))
			return
		}
		response := map[string]interface{}{"result": map[string]interface{}{"points": []map[string]interface{}{{"id": 1, "payload": parent}}}}
		_ = json.NewEncoder(w).Encode(response)
	}))
	t.Cleanup(server.Close)
	return server
}
