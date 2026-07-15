package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAPIUploadFileMissingFile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/uploads", APIUploadFile)

	req := httptest.NewRequest(http.MethodPost, "/api/uploads", strings.NewReader(""))
	req.Header.Set("Content-Type", "multipart/form-data; boundary=missing")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
	var body map[string]map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("expected json error body: %v", err)
	}
	if body["error"]["code"] != "BAD_REQUEST" {
		t.Fatalf("expected BAD_REQUEST code, got %#v", body["error"]["code"])
	}
}

func TestAPIUploadFileInvalidMultipart(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/uploads", APIUploadFile)

	req := httptest.NewRequest(http.MethodPost, "/api/uploads", strings.NewReader("not multipart"))
	req.Header.Set("Content-Type", "multipart/form-data")
	recorder := httptest.NewRecorder()

	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, recorder.Code)
	}
}

func TestMapAPIUploadResponse(t *testing.T) {
	response := mapAPIUploadResponse(uploadResult{
		FileID:          "job-123",
		Filename:        "recording.wav",
		Category:        "meeting",
		ReferenceNumber: "REF-1",
		Notes:           "note",
		Status:          "uploaded",
		Speakers:        "3",
		CreatedAt:       "2026-07-15T00:00:00Z",
	})

	if response.Job.JobID != "job-123" {
		t.Fatalf("expected job ID mapping, got %q", response.Job.JobID)
	}
	if response.Job.ReferenceNumber != "REF-1" {
		t.Fatalf("expected reference mapping, got %q", response.Job.ReferenceNumber)
	}
	if response.Job.SpeakerCount != 3 {
		t.Fatalf("expected speaker count 3, got %d", response.Job.SpeakerCount)
	}
	if response.Job.AnalysisStatus != "not_started" {
		t.Fatalf("expected default analysis status, got %q", response.Job.AnalysisStatus)
	}
	if response.Message == "" {
		t.Fatal("expected message")
	}
}
