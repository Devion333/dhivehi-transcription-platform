package handlers

import (
	"bytes"
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

	result, analysisErr := runTranscriptAnalysis(jobID)
	if analysisErr != nil {
		c.JSON(analysisErr.status, gin.H{"error": analysisErr.message})
		return
	}

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

	started := time.Now()
	auditRequestEvent(c, services.AuditEventInput{Action: "analysis.started", Category: "analysis", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"analysisStatus": "started", "provider": "analysis"}})
	result, analysisErr := runTranscriptAnalysis(jobID)
	if analysisErr != nil {
		auditRequestEvent(c, services.AuditEventInput{Action: "analysis.failed", Category: "analysis", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeFailure, Metadata: map[string]interface{}{"analysisStatus": "failed", "durationMs": time.Since(started).Milliseconds(), "provider": "analysis"}})
		writeAPIError(c, analysisErr.status, analysisErr.code, analysisErr.message, nil)
		return
	}

	auditRequestEvent(c, services.AuditEventInput{Action: "analysis.completed", Category: "analysis", ResourceType: "transcript", ResourceID: jobID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"analysisStatus": "complete", "durationMs": time.Since(started).Milliseconds(), "provider": "analysis"}})
	c.JSON(http.StatusOK, dtos.AnalysisTriggerResponse{
		Analysis: mapAnalysisResult(result),
		Message:  "Analysis completed",
	})
}

func runTranscriptAnalysis(jobID string) (AnalysisResult, *analysisHandlerError) {

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

	var transcriptLines []string
	for _, seg := range segments {
		text := strings.TrimSpace(seg.Payload.TranscriptText)
		if text == "" || text == "Transcription pending..." {
			continue
		}
		transcriptLines = append(transcriptLines, fmt.Sprintf("%s: %s", seg.Payload.Speaker, text))
	}

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

	go func() {
		parentPayload := map[string]interface{}{
			"analysis_keywords":            result.Keywords,
			"analysis_entities":            result.Entities,
			"analysis_summary":             result.Summary,
			"analysis_classification":      result.Classification,
			"analysis_english_translation": result.EnglishTranslation,
			"analysis_status":              "complete",
		}
		if err := services.UpdateParentPayload(jobID, parentPayload); err != nil {
			log.Printf("Warning: failed to update parent payload with analysis for %s: %v", jobID, err)
		} else {
			log.Printf("Saved analysis results to Qdrant for job %s", jobID)
		}
	}()

	return result, nil
}

func mapAnalysisResult(result AnalysisResult) dtos.Analysis {
	return dtos.Analysis{
		Status:             "complete",
		Keywords:           result.Keywords,
		Entities:           result.Entities,
		Summary:            result.Summary,
		Classification:     result.Classification,
		EnglishTranslation: result.EnglishTranslation,
	}
}
