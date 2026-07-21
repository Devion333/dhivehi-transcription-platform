// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcript_list.go
// Description: Service layer for transcript_list
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"fmt"
)

// TranscriptListItem represents a transcript in the list
type TranscriptListItem struct {
	ID              string  `json:"id"`
	Filename        string  `json:"filename"`
	Category        string  `json:"category"`
	ReferenceNumber string  `json:"reference_number"`
	Status          string  `json:"status"`
	Timestamp       string  `json:"timestamp"`
	Duration        float64 `json:"duration"`
	Speakers        int     `json:"speakers"`
	Segments        int     `json:"segments"`
	Notes           string  `json:"notes"`
	MinioURL        string  `json:"minio_url"`
}

// GetAllTranscripts fetches all parent transcripts from Qdrant
// GetAllTranscripts fetches all parent transcripts from Qdrant
func GetAllTranscripts(scope TranscriptAccessScope) ([]TranscriptListItem, error) {
	points, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return nil, err
	}
	transcripts := make([]TranscriptListItem, 0, len(points))
	for _, point := range points {
		payload := point.Payload

		// Helper function to safely get string values
		getString := func(key string) string {
			if val, ok := payload[key]; ok {
				if str, ok := val.(string); ok {
					return str
				}
			}
			return ""
		}

		// Helper function to safely get float values
		getFloat := func(key string) float64 {
			if val, ok := payload[key]; ok {
				if f, ok := val.(float64); ok {
					return f
				}
			}
			return 0
		}

		// Helper function to safely get int values
		getInt := func(key string) int {
			if val, ok := payload[key]; ok {
				if f, ok := val.(float64); ok {
					return int(f)
				}
			}
			return 0
		}

		transcript := TranscriptListItem{
			ID:              getString("job_id"), // Use job_id from payload
			Filename:        getString("filename"),
			Category:        getString("category"),
			ReferenceNumber: getString("reference_number"),
			Status:          getString("status"),
			Timestamp:       getString("timestamp"),
			Duration:        getFloat("duration"),
			Speakers:        getInt("speakers"),
			Segments:        getInt("segments"),
			Notes:           getString("notes"),
			MinioURL:        getString("minio_url"),
		}

		transcripts = append(transcripts, transcript)
	}

	fmt.Printf("âœ… Retrieved %d transcripts from Qdrant\n", len(transcripts))

	return transcripts, nil
}

// GetTranscriptsByStatus filters transcripts by status
func GetTranscriptsByStatus(scope TranscriptAccessScope, status string) ([]TranscriptListItem, error) {
	transcripts, err := GetAllTranscripts(scope)
	if err != nil {
		return nil, err
	}

	if status == "" || status == "all" {
		return transcripts, nil
	}

	var filtered []TranscriptListItem
	for _, t := range transcripts {
		if t.Status == status {
			filtered = append(filtered, t)
		}
	}

	return filtered, nil
}

// GetTranscriptStats returns statistics about transcripts
func GetTranscriptStats(scope TranscriptAccessScope) (map[string]interface{}, error) {
	transcripts, err := GetAllTranscripts(scope)
	if err != nil {
		return nil, err
	}

	stats := map[string]interface{}{
		"total":       len(transcripts),
		"completed":   0,
		"processing":  0,
		"uploaded":    0,
		"error":       0,
		"total_hours": 0.0,
	}

	totalDuration := 0.0

	for _, t := range transcripts {
		totalDuration += t.Duration

		switch t.Status {
		case "completed":
			stats["completed"] = stats["completed"].(int) + 1
		case "processing":
			stats["processing"] = stats["processing"].(int) + 1
		case "uploaded":
			stats["uploaded"] = stats["uploaded"].(int) + 1
		case "error":
			stats["error"] = stats["error"].(int) + 1
		}
	}

	stats["total_hours"] = totalDuration / 3600 // Convert seconds to hours

	return stats, nil

}
