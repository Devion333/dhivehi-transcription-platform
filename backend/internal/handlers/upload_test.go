// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: upload_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
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

func TestAPIUploadFileRejectsMissingReferenceNumber(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/uploads", APIUploadFile)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, multipartUploadRequest(t, "recording.mp3", "   "))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "Reference number is required") {
		t.Fatalf("expected reference validation message, got %s", recorder.Body.String())
	}
}

func TestValidateReferenceNumberAllowsPunctuationAndCasing(t *testing.T) {
	if err := validateReferenceNumber("REF-2026/Case_014"); err != nil {
		t.Fatalf("expected reference to be valid: %v", err)
	}
	if err := validateReferenceNumber(strings.Repeat("a", maxReferenceNumberLength+1)); err == nil {
		t.Fatal("expected long reference to be rejected")
	}
}

func multipartUploadRequest(t *testing.T, filename, reference string) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("audio")); err != nil {
		t.Fatal(err)
	}
	_ = writer.WriteField("referenceNumber", reference)
	_ = writer.WriteField("category", "meeting")
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/uploads", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
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
