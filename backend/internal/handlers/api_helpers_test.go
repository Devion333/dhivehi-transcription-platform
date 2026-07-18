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

func TestAPIUpdateSpeakerNameRejectsUnknownJSONFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/api/transcripts/:jobId/speakers", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "owner", Role: services.UserRoleUser})
	}, APIUpdateSpeakerName)

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/api/transcripts/job/speakers", strings.NewReader(`{"speakerKey":"SPEAKER_00","displayName":"Officer Ahmed","ownerUserId":"other"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", recorder.Code)
	}
}

func TestSpeakerRenameAuditMetadataAllowlistExcludesDisplayName(t *testing.T) {
	metadata, err := services.SanitizeAuditMetadata("speaker_rename_succeeded", map[string]interface{}{"jobId": "job", "speakerKey": "SPEAKER_00", "displayName": "Officer Ahmed"})
	if err != nil {
		t.Fatalf("unexpected audit sanitize error: %v", err)
	}
	if _, ok := metadata["displayName"]; ok {
		t.Fatalf("display name should not be stored in audit metadata: %+v", metadata)
	}
	if metadata["jobId"] != "job" || metadata["speakerKey"] != "SPEAKER_00" {
		t.Fatalf("expected safe metadata keys, got %+v", metadata)
	}
}

func TestAnalysisTranscriptLinesUseMappedSpeakerNames(t *testing.T) {
	lines := buildAnalysisTranscriptLines([]services.SegmentPoint{
		{Payload: services.SegmentPayload{Speaker: "SPEAKER_00", TranscriptText: "hello"}},
		{Payload: services.SegmentPayload{Speaker: "SPEAKER_01", TranscriptText: "world"}},
	}, map[string]string{"SPEAKER_00": "Officer Ahmed"})
	if len(lines) != 2 || lines[0] != "Officer Ahmed: hello" || lines[1] != "SPEAKER_01: world" {
		t.Fatalf("unexpected analysis lines: %+v", lines)
	}
}

func TestAPISearchTranscriptsRejectsInvalidDate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/search/transcripts", APISearchTranscripts)

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/search/transcripts?createdFrom=not-a-date", strings.NewReader(""))
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", recorder.Code)
	}
	var body dtos.APIErrorBody
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode error body: %v", err)
	}
	if body.Error.Code != services.ErrCodeInvalidSearchFilter {
		t.Fatalf("expected invalid search filter error, got %+v", body)
	}
}
