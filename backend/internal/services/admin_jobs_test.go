package services

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestSafeFailureMessageRedactsInternals(t *testing.T) {
	message := SafeFailureMessage(`failed at C:\tmp\secret\file.py calling http://analysis:7861/run/predict Traceback full stack`)
	if strings.Contains(message, `C:\tmp`) || strings.Contains(message, "analysis:7861") || strings.Contains(message, "Traceback") {
		t.Fatalf("unsafe message: %q", message)
	}
}

func TestAdminJobSummaryDerivesTranscriptionFailureFromSegment(t *testing.T) {
	parent := map[string]interface{}{"job_id": "job-1", "filename": "call.wav", "status": "diarized", "timestamp": "2026-07-15T00:00:00Z"}
	segments := []QdrantPoint{{Payload: map[string]interface{}{"parent_job_id": "job-1", "segment_index": 0, "status": "transcription_failed", "transcription_error": "model failed"}}}
	summary := adminJobSummary(parent, segments)
	if summary.Status != "transcription_failed" || summary.CurrentStage != JobStageTranscription || !summary.Retryable {
		t.Fatalf("unexpected summary: %#v", summary)
	}
	if summary.FailureMessage != "model failed" || summary.FailureCode != "TRANSCRIPTION_FAILED" {
		t.Fatalf("unexpected failure fields: %#v", summary)
	}
}

func TestRetryPayloadsReconstructTranscriptionJobs(t *testing.T) {
	parent := map[string]interface{}{"job_id": "job-1"}
	segments := []QdrantPoint{
		{Payload: map[string]interface{}{"parent_job_id": "job-1", "segment_index": 0, "speaker": "SPEAKER_00", "start_time": 1.5, "end_time": 3.5, "minio_url": "http://minio/audio.wav", "status": "transcription_failed"}},
		{Payload: map[string]interface{}{"parent_job_id": "job-1", "segment_index": 1, "status": "transcribed"}},
	}
	payloads, err := retryPayloads(JobStageTranscription, parent, segments, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(payloads) != 1 {
		t.Fatalf("expected one payload, got %d", len(payloads))
	}
	payload := payloads[0]
	if payload["segment_id"] != "job-1_seg_000" || payload["file_id"] != "job-1" || payload["attempts"] != 2 {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestRetryPayloadsRequireFailedSegments(t *testing.T) {
	_, err := retryPayloads(JobStageTranscription, map[string]interface{}{"job_id": "job-1"}, nil, 0)
	if err == nil {
		t.Fatal("expected no failed segments error")
	}
}

func TestEnqueueRetryQueueUnavailable(t *testing.T) {
	RedisClient = nil
	err := EnqueueRetry(context.Background(), JobStageConversion, map[string]interface{}{"file_id": "job-1"})
	if err == nil {
		t.Fatal("expected queue unavailable")
	}
	serviceErr, ok := err.(*ServiceError)
	if !ok || serviceErr.Code != ErrCodeJobQueueUnavailable {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAuditMetadataAllowsJobRetryActions(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("admin.job_retry_succeeded", map[string]interface{}{"jobId": "job-1", "stage": "transcription", "previousStatus": "transcription_failed", "newStatus": "transcribing", "retryCount": 1, "failureCode": "TRANSCRIPTION_FAILED", "rawPayload": "secret"})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := metadata["rawPayload"]; ok {
		t.Fatal("raw payload should not be allowlisted")
	}
	if metadata["jobId"] != "job-1" || metadata["stage"] != "transcription" {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
}

func TestParseExpectedWorkersDefaultsAndFilters(t *testing.T) {
	defaults := ParseExpectedWorkers("")
	for _, workerType := range []string{JobStageConversion, JobStageDiarization, JobStageTranscription, JobStageAnalysis} {
		if !defaults[workerType] {
			t.Fatalf("expected default worker %q", workerType)
		}
	}
	parsed := ParseExpectedWorkers("conversion,unknown, analysis ")
	if !parsed[JobStageConversion] || !parsed[JobStageAnalysis] || parsed["unknown"] || parsed[JobStageDiarization] {
		t.Fatalf("unexpected parsed workers: %#v", parsed)
	}
}

func TestSummarizeWorkerHeartbeatsAvailability(t *testing.T) {
	now := time.Date(2026, 7, 16, 12, 0, 0, 0, time.UTC)
	fresh := now.Add(-10 * time.Second).Format(time.RFC3339)
	stale := now.Add(-2 * time.Minute).Format(time.RFC3339)
	summary := summarizeWorkerHeartbeats([]WorkerHeartbeatRecord{
		{WorkerType: JobStageConversion, InstanceID: "one", Status: WorkerAvailabilityAvailable, LastHeartbeatAt: stale},
		{WorkerType: JobStageConversion, InstanceID: "two", Status: WorkerAvailabilityAvailable, LastHeartbeatAt: fresh},
	}, time.Minute, now)
	if summary.Status != WorkerAvailabilityAvailable || summary.Instances != 1 || summary.LastHeartbeatAt == nil || *summary.LastHeartbeatAt != fresh {
		t.Fatalf("unexpected available summary: %#v", summary)
	}
	unavailable := summarizeWorkerHeartbeats([]WorkerHeartbeatRecord{{WorkerType: JobStageConversion, InstanceID: "one", Status: WorkerAvailabilityAvailable, LastHeartbeatAt: stale}}, time.Minute, now)
	if unavailable.Status != WorkerAvailabilityUnavailable || unavailable.Instances != 0 || unavailable.LastHeartbeatAt != nil {
		t.Fatalf("unexpected unavailable summary: %#v", unavailable)
	}
}
