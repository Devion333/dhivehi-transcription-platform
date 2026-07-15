package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func TestWriteAPIError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)

	writeAPIError(context, http.StatusNotFound, services.ErrCodeTranscriptNotFound, "Transcript was not found", nil)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected status 404, got %d", recorder.Code)
	}
	var body dtos.APIErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode error body: %v", err)
	}
	if body.Error.Code != services.ErrCodeTranscriptNotFound || body.Error.Message != "Transcript was not found" {
		t.Fatalf("unexpected error body: %+v", body)
	}
}

func TestAPISearchTranscriptsRequiresQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/search/transcripts", APISearchTranscripts)

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/search/transcripts?q=%20%20", strings.NewReader(""))
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", recorder.Code)
	}
	var body dtos.APIErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode error body: %v", err)
	}
	if body.Error.Code != services.ErrCodeSearchQueryRequired {
		t.Fatalf("expected search query error, got %+v", body)
	}
}
