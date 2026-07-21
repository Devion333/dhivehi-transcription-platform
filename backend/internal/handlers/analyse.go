// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: analyse.go
// Description: HTTP handler for analyse
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

type AnalysisRequest struct {
	Data []string `json:"data"`
}

type AnalysisResponse struct {
	Data []string `json:"data"`
}

type AnalysisResult struct {
	Keywords           []string               `json:"keywords"`
	Entities           map[string]interface{} `json:"entities"`
	Summary            string                 `json:"summary"`
	Classification     string                 `json:"classification"`
	EnglishTranslation string                 `json:"english_translation"`
}

type analysisHandlerError struct {
	status  int
	code    string
	message string
	err     error
}

func (e analysisHandlerError) Error() string {
	if e.err != nil {
		return e.err.Error()
	}
	return e.message
}

func AnalyseTranscript(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "job_id is required"})
		return
	}
	parent, err := services.GetAuthorizedParentTranscriptPoint(transcriptAccessScope(c), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}

	result, analysisErr := runTranscriptAnalysis(jobID, services.MapSpeakerNames(parent.Payload))
	if analysisErr != nil {
		c.JSON(analysisErr.status, gin.H{"error": analysisErr.message})
		return
	}

	go saveAnalysisResult(context.Background(), jobID, result, parent.Payload)

	c.JSON(http.StatusOK, gin.H{
		"keywords":            result.Keywords,
		"entities":            result.Entities,
		"summary":             result.Summary,
		"classification":      result.Classification,
		"english_translation": result.EnglishTranslation,
	})
}

func APIAnalyseTranscript(c *gin.Context) {
	jobID := strings.TrimSpace(c.Param("jobId"))
	if jobID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "jobId is required", nil)
		return
	}
	settings, err := services.GetSystemSettings(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if !settings.AnalysisEnabled {
		writeAPIError(c, http.StatusForbidden, services.ErrCodeForbidden, "Analysis is disabled", nil)
		return
	}

	started := time.Now()
	parent, err := services.GetAuthorizedParentTranscriptPoint(transcriptAccessScope(c), jobID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	if settings.RequireFullReviewBeforeAnalysis {
		if err := services.RequireFullReview(transcriptAccessScope(c), jobID); err != nil {
			writeServiceError(c, err)
			return
		}
	}
	if !settings.UsersCanRerunAnalysis && services.MapAnalysis(parent.Payload).Status == "complete" {
		writeAPIError(c, http.StatusForbidden, services.ErrCodeForbidden, "Analysis reruns are disabled", nil)
		return
	}

	currentAnalysis := services.MapAnalysis(parent.Payload)
	if currentAnalysis.Status == "processing" {
		c.JSON(http.StatusAccepted, dtos.AnalysisTriggerResponse{
			Analysis: currentAnalysis,
			Message:  "Analysis is already running",
		})
		return
	}

	speakerNames := services.MapSpeakerNames(parent.Payload)
	currentUser, _ := CurrentUser(c)
	auditRequestEvent(c, services.AuditEventInput{Action: "analysis.started", Category: "analysis", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"analysisStatus": "processing", "provider": "analysis"}})

	if err := services.UpdateParentPayload(jobID, map[string]interface{}{
		"analysis_status": "processing",
		"updated_at":      started.UTC().Format(time.RFC3339Nano),
	}); err != nil {
		writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "Failed to start analysis", nil)
		return
	}

	c.JSON(http.StatusAccepted, dtos.AnalysisTriggerResponse{
		Analysis: dtos.Analysis{Status: "processing"},
		Message:  "Analysis started",
	})

	go runAPIAnalysisAsync(jobID, speakerNames, parent.Payload, currentUser, started)
}

func runAPIAnalysisAsync(jobID string, speakerNames map[string]string, parentPayload map[string]interface{}, currentUser dtos.AuthUser, started time.Time) {
	ctx := context.Background()

	defer func() {
		if r := recover(); r != nil {
			errMsg := fmt.Sprintf("panic in analysis: %v", r)
			log.Printf("Analysis panic for job %s: %v", jobID, r)
			_ = services.UpdateParentPayload(jobID, map[string]interface{}{
				"analysis_status": "failed",
				"analysis_error":  errMsg,
				"updated_at":      time.Now().UTC().Format(time.RFC3339Nano),
			})
			services.RecordAuditEvent(ctx, services.AuditEventInput{
				Action: "analysis.failed", Category: "analysis", ResourceType: "transcript", ResourceID: jobID,
				Outcome:  services.AuditOutcomeFailure,
				Metadata: map[string]interface{}{"analysisStatus": "failed", "durationMs": time.Since(started).Milliseconds(), "provider": "analysis"},
				Actor:    &currentUser,
			})
		}
	}()

	result, analysisErr := runTranscriptAnalysis(jobID, speakerNames)
	if analysisErr != nil {
		_ = services.UpdateParentPayload(jobID, map[string]interface{}{
			"analysis_status": "failed",
			"analysis_error":  analysisErr.message,
			"updated_at":      time.Now().UTC().Format(time.RFC3339Nano),
		})
		services.NotifyAnalysisFailed(ctx, parentPayload, jobID, started.UTC().Format(time.RFC3339Nano))
		services.RecordAuditEvent(ctx, services.AuditEventInput{
			Action: "analysis.failed", Category: "analysis", ResourceType: "transcript", ResourceID: jobID,
			Outcome:  services.AuditOutcomeFailure,
			Metadata: map[string]interface{}{"analysisStatus": "failed", "durationMs": time.Since(started).Milliseconds(), "provider": "analysis"},
			Actor:    &currentUser,
		})
		log.Printf("Analysis failed for job %s: %s", jobID, analysisErr.message)
		return
	}

	saveAnalysisResult(ctx, jobID, result, parentPayload)
	services.RecordAuditEvent(ctx, services.AuditEventInput{
		Action: "analysis.completed", Category: "analysis", ResourceType: "transcript", ResourceID: jobID,
		Outcome:  services.AuditOutcomeSuccess,
		Metadata: map[string]interface{}{"analysisStatus": "complete", "durationMs": time.Since(started).Milliseconds(), "provider": "analysis"},
		Actor:    &currentUser,
	})
	log.Printf("Analysis completed for job %s", jobID)
}

func saveAnalysisResult(ctx context.Context, jobID string, result AnalysisResult, parentPayload map[string]interface{}) {
	completedAt := time.Now().UTC().Format(time.RFC3339Nano)
	if err := services.UpdateParentPayload(jobID, map[string]interface{}{
		"analysis_keywords":            result.Keywords,
		"analysis_entities":            result.Entities,
		"analysis_summary":             result.Summary,
		"analysis_classification":      result.Classification,
		"analysis_english_translation": result.EnglishTranslation,
		"analysis_status":              "complete",
		"analysis_completed_at":        completedAt,
	}); err != nil {
		log.Printf("Failed to save analysis results for %s: %v", jobID, err)
		_ = services.UpdateParentPayload(jobID, map[string]interface{}{
			"analysis_status": "failed",
			"analysis_error":  fmt.Sprintf("save failed: %v", err),
			"updated_at":      time.Now().UTC().Format(time.RFC3339Nano),
		})
		return
	}
	if parent, err := services.GetParentTranscriptPoint(jobID); err == nil {
		services.NotifyAnalysisCompleted(ctx, parent.Payload, jobID, completedAt)
	}
}

func runTranscriptAnalysis(jobID string, speakerNames map[string]string) (AnalysisResult, *analysisHandlerError) {

	segments, err := services.ScrollSegmentsByParent(jobID)
	if err != nil {
		log.Printf("Failed to fetch segments for %s: %v", jobID, err)
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeInternal, message: "Failed to fetch transcript segments", err: err}
	}

	if len(segments) == 0 {
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusNotFound, code: services.ErrCodeTranscriptNotFound, message: "no segments found for this transcript"}
	}

	sort.Slice(segments, func(i, j int) bool {
		return segments[i].Payload.SegmentIndex < segments[j].Payload.SegmentIndex
	})

	transcriptLines := buildAnalysisTranscriptLines(segments, speakerNames)

	if len(transcriptLines) == 0 {
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusBadRequest, code: services.ErrCodeBadRequest, message: "no transcribed text found in segments"}
	}

	fullTranscript := strings.Join(transcriptLines, "\n")

	analysisReq := AnalysisRequest{
		Data: []string{fullTranscript},
	}
	reqBody, _ := json.Marshal(analysisReq)

	log.Printf("Sending transcript to analysis service for job %s (%d chars)", jobID, len(fullTranscript))

	resp, err := http.Post("http://analysis:7861/run/predict", "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		log.Printf("Failed to call analysis service for %s: %v", jobID, err)
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeUpstream, message: "Analysis service is unavailable", err: err}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Failed to read analysis response for %s: %v", jobID, err)
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeUpstream, message: "failed to read analysis response", err: err}
	}

	if resp.StatusCode >= 300 {
		log.Printf("Analysis service returned error %d for %s", resp.StatusCode, jobID)
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeUpstream, message: "Analysis service returned an error"}
	}

	var analysisResp AnalysisResponse
	if err := json.Unmarshal(respBody, &analysisResp); err != nil {
		log.Printf("Failed to parse analysis response for %s: %v", jobID, err)
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeUpstream, message: "invalid response from analysis service", err: err}
	}

	if len(analysisResp.Data) == 0 {
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeUpstream, message: "empty response from analysis service"}
	}

	var result AnalysisResult
	if err := json.Unmarshal([]byte(analysisResp.Data[0]), &result); err != nil {
		log.Printf("Failed to parse analysis JSON result for %s: %v", jobID, err)
		return AnalysisResult{}, &analysisHandlerError{status: http.StatusInternalServerError, code: services.ErrCodeUpstream, message: "failed to parse analysis result", err: err}
	}

	return result, nil
}

func buildAnalysisTranscriptLines(segments []services.SegmentPoint, speakerNames map[string]string) []string {
	var transcriptLines []string
	for _, seg := range segments {
		text := strings.TrimSpace(seg.Payload.TranscriptText)
		if text == "" || text == "Transcription pending..." {
			continue
		}
		transcriptLines = append(transcriptLines, fmt.Sprintf("%s: %s", services.SpeakerDisplayName(seg.Payload.Speaker, speakerNames), text))
	}
	return transcriptLines
}

func mapAnalysisResult(result AnalysisResult) dtos.Analysis {
	return dtos.Analysis{
		Status:             "complete",
		Keywords:           result.Keywords,
		Entities:           result.Entities,
		Summary:            result.Summary,
		Classification:     result.Classification,
		EnglishTranslation: result.EnglishTranslation,
		Review:             dtos.AnalysisReview{Status: "unreviewed"},
	}
}
