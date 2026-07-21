// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcript_handlers.go
// Description: HTTP handler for transcript_handlers
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"transcript_app/backend/internal/services" // Replace with your actual module path
)

// GetStatsHandler handles GET /api/stats
func GetStatsHandler(w http.ResponseWriter, r *http.Request) {
	stats, err := services.GetTranscriptStats(services.TranscriptAccessScope{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get stats: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// GetAllTranscriptsHandler handles GET /api/transcripts
func GetAllTranscriptsHandler(w http.ResponseWriter, r *http.Request) {
	transcripts, err := services.GetAllTranscripts(services.TranscriptAccessScope{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get transcripts: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transcripts)
}

// GetTranscriptsByStatusHandler handles GET /api/transcripts?status=completed
func GetTranscriptsByStatusHandler(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")

	transcripts, err := services.GetTranscriptsByStatus(services.TranscriptAccessScope{}, status)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to get transcripts: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transcripts)
}
