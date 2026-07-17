package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
)

const (
	qdrantCollection    = "file_metadata"
	defaultPage         = 1
	defaultPageSize     = 20
	maxPageSize         = 100
	maxSpeakerNameRunes = 80
)

var qdrantHTTPClient = &http.Client{Timeout: 10 * time.Second}

type QdrantPoint struct {
	ID      interface{}            `json:"id"`
	Payload map[string]interface{} `json:"payload"`
}

type TranscriptAccessScope struct {
	UserID  string
	IsAdmin bool
}

type qdrantScrollResponse struct {
	Result struct {
		Points         []QdrantPoint `json:"points"`
		NextPageOffset interface{}   `json:"next_page_offset"`
	} `json:"result"`
}

func NormalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	return page, pageSize
}

func GetAPITranscripts(scope TranscriptAccessScope, page, pageSize int, search, status string) (dtos.TranscriptListResponse, error) {
	page, pageSize = NormalizePagination(page, pageSize)
	parents, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return dtos.TranscriptListResponse{}, err
	}

	search = strings.ToLower(strings.TrimSpace(search))
	status = strings.TrimSpace(status)
	items := make([]dtos.TranscriptSummary, 0, len(parents))
	for _, point := range parents {
		payload := point.Payload
		if status != "" && status != "all" && publicParentStatus(getString(payload, "status", "uploaded")) != status {
			continue
		}
		if search != "" && !matchesParentSearch(payload, search) {
			continue
		}
		items = append(items, MapParentSummary(payload))
	}

	sort.SliceStable(items, func(i, j int) bool {
		left := parseTimeOrZero(items[i].CreatedAt)
		right := parseTimeOrZero(items[j].CreatedAt)
		if left.Equal(right) {
			return items[i].JobID > items[j].JobID
		}
		return left.After(right)
	})

	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}

	return dtos.TranscriptListResponse{
		Items: items[start:end],
		Pagination: dtos.Pagination{
			Page:        page,
			PageSize:    pageSize,
			Total:       total,
			TotalPages:  totalPages,
			HasNextPage: page < totalPages,
		},
	}, nil
}

func SearchTranscriptText(scope TranscriptAccessScope, query string, page, pageSize int, status, category string) (dtos.TranscriptSearchResponse, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return dtos.TranscriptSearchResponse{}, newServiceError(ErrCodeSearchQueryRequired, errors.New("search query is required"))
	}
	page, pageSize = NormalizePagination(page, pageSize)

	segments, err := ListAllSegmentPoints()
	if err != nil {
		return dtos.TranscriptSearchResponse{}, newServiceError(ErrCodeSearchUnavailable, err)
	}
	parents, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return dtos.TranscriptSearchResponse{}, newServiceError(ErrCodeSearchUnavailable, err)
	}
	allowedJobIDs := map[string]struct{}{}
	for _, parent := range parents {
		if jobID := getString(parent.Payload, "job_id", ""); jobID != "" {
			allowedJobIDs[jobID] = struct{}{}
		}
	}
	filteredSegments := make([]QdrantPoint, 0, len(segments))
	for _, segment := range segments {
		if _, ok := allowedJobIDs[getString(segment.Payload, "parent_job_id", "")]; ok {
			filteredSegments = append(filteredSegments, segment)
		}
	}

	return BuildTranscriptSearchResponse(query, page, pageSize, status, category, filteredSegments, parents), nil
}

func BuildTranscriptSearchResponse(query string, page, pageSize int, status, category string, segments, parents []QdrantPoint) dtos.TranscriptSearchResponse {
	page, pageSize = NormalizePagination(page, pageSize)
	query = strings.TrimSpace(query)
	status = strings.TrimSpace(status)
	category = strings.ToLower(strings.TrimSpace(category))
	parentLookup := map[string]map[string]interface{}{}
	for _, parent := range parents {
		jobID := getString(parent.Payload, "job_id", "")
		if jobID != "" {
			parentLookup[jobID] = parent.Payload
		}
	}

	items := make([]dtos.TranscriptSearchResult, 0)
	for _, segment := range segments {
		text := getString(segment.Payload, "transcript_text", "")
		if !literalContains(text, query) {
			continue
		}
		jobID := getString(segment.Payload, "parent_job_id", "")
		parent := parentLookup[jobID]
		publicStatus := publicParentStatus(getString(parent, "status", "uploaded"))
		parentCategory := getString(parent, "category", "Uncategorized")
		if status != "" && status != "all" && publicStatus != status {
			continue
		}
		if category != "" && strings.ToLower(parentCategory) != category {
			continue
		}
		items = append(items, dtos.TranscriptSearchResult{
			SegmentID:        SegmentIDFromPayload(jobID, segment.Payload),
			JobID:            jobID,
			Filename:         getString(parent, "filename", "Unknown"),
			ReferenceNumber:  getString(parent, "reference_number", "N/A"),
			Category:         parentCategory,
			TranscriptStatus: publicStatus,
			SegmentIndex:     getInt(segment.Payload, "segment_index", 0),
			Speaker:          getString(segment.Payload, "speaker", "Unknown"),
			StartTime:        getFloat(segment.Payload, "start_time", 0),
			EndTime:          getFloat(segment.Payload, "end_time", 0),
			TranscriptText:   text,
			MatchExcerpt:     MatchExcerpt(text, query, 48),
		})
	}

	sort.SliceStable(items, func(i, j int) bool {
		leftParent := parentLookup[items[i].JobID]
		rightParent := parentLookup[items[j].JobID]
		leftTime := parseTimeOrZero(getString(leftParent, "timestamp", ""))
		rightTime := parseTimeOrZero(getString(rightParent, "timestamp", ""))
		if !leftTime.Equal(rightTime) {
			return leftTime.After(rightTime)
		}
		if items[i].JobID != items[j].JobID {
			return items[i].JobID > items[j].JobID
		}
		return items[i].SegmentIndex < items[j].SegmentIndex
	})

	total := len(items)
	start := (page - 1) * pageSize
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}

	return dtos.TranscriptSearchResponse{
		Query: query,
		Items: items[start:end],
		Pagination: dtos.Pagination{
			Page:        page,
			PageSize:    pageSize,
			Total:       total,
			TotalPages:  totalPages,
			HasNextPage: page < totalPages,
		},
	}
}

func MatchExcerpt(text, query string, contextRunes int) string {
	textRunes := []rune(text)
	if len(textRunes) == 0 {
		return ""
	}
	index := literalIndex(text, query)
	if index < 0 {
		if len(textRunes) <= contextRunes*2 {
			return text
		}
		return string(textRunes[:contextRunes*2]) + "..."
	}
	queryLen := len([]rune(query))
	start := index - contextRunes
	if start < 0 {
		start = 0
	}
	end := index + queryLen + contextRunes
	if end > len(textRunes) {
		end = len(textRunes)
	}
	excerpt := string(textRunes[start:end])
	if start > 0 {
		excerpt = "..." + excerpt
	}
	if end < len(textRunes) {
		excerpt += "..."
	}
	return excerpt
}

func literalContains(text, query string) bool {
	return literalIndex(text, query) >= 0
}

func literalIndex(text, query string) int {
	query = strings.TrimSpace(query)
	if query == "" {
		return -1
	}
	textRunes := []rune(text)
	queryRunes := []rune(query)
	if len(queryRunes) > len(textRunes) {
		return -1
	}
	lowerText := []rune(strings.ToLower(text))
	lowerQuery := []rune(strings.ToLower(query))
	for i := 0; i <= len(lowerText)-len(lowerQuery); i++ {
		matched := true
		for j := range lowerQuery {
			if lowerText[i+j] != lowerQuery[j] {
				matched = false
				break
			}
		}
		if matched {
			return i
		}
	}
	return -1
}

func GetAPITranscriptDetail(scope TranscriptAccessScope, jobID string) (dtos.TranscriptDetail, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.TranscriptDetail{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.TranscriptDetail{}, err
	}

	sort.SliceStable(segments, func(i, j int) bool {
		return getInt(segments[i].Payload, "segment_index", 0) < getInt(segments[j].Payload, "segment_index", 0)
	})

	segmentDTOs := make([]dtos.Segment, 0, len(segments))
	speakers := map[string]struct{}{}
	for _, segment := range segments {
		segmentDTO := MapSegment(parent.Payload, segment.Payload)
		segmentDTOs = append(segmentDTOs, segmentDTO)
		if segmentDTO.Speaker != "" && segmentDTO.Speaker != "Unknown" {
			speakers[segmentDTO.Speaker] = struct{}{}
		}
	}

	detail := MapTranscriptDetail(parent.Payload, segmentDTOs)
	if detail.SegmentCount == 0 {
		detail.SegmentCount = len(segmentDTOs)
	}
	if detail.Speakers == 0 {
		detail.Speakers = len(speakers)
	}
	return detail, nil
}

func GetAPITranscriptStatus(scope TranscriptAccessScope, jobID string) (dtos.TranscriptStatusResponse, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.TranscriptStatusResponse{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.TranscriptStatusResponse{}, err
	}
	return MapTranscriptStatus(parent.Payload, segments, scope.IsAdmin), nil
}

func UpdateSegmentTranscript(scope TranscriptAccessScope, jobID, segmentID, transcriptText string) (dtos.Segment, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.Segment{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.Segment{}, err
	}

	target, err := findSegmentForUpdate(jobID, segmentID, segments)
	if err != nil {
		return dtos.Segment{}, err
	}
	if target == nil {
		return dtos.Segment{}, newServiceError(ErrCodeSegmentNotFound, ErrSegmentNotFound)
	}

	segmentIndex := getInt(target.Payload, "segment_index", -1)
	if segmentIndex < 0 {
		return dtos.Segment{}, newServiceError(ErrCodeInternal, fmt.Errorf("segment missing segment_index"))
	}

	updatedAt := time.Now().UTC().Format(time.RFC3339)
	payload := map[string]interface{}{
		"transcript_text": transcriptText,
		"updated_at":      updatedAt,
	}
	if err := updateSegmentPayloadByIndex(jobID, segmentIndex, payload); err != nil {
		return dtos.Segment{}, err
	}

	updatedPayload := copyPayload(target.Payload)
	updatedPayload["transcript_text"] = transcriptText
	updatedPayload["updated_at"] = updatedAt
	return MapSegment(parent.Payload, updatedPayload), nil
}

func UpdateSpeakerName(scope TranscriptAccessScope, jobID, speakerKey, displayName string) (dtos.SpeakerRenameResponse, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.SpeakerRenameResponse{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.SpeakerRenameResponse{}, err
	}
	speakerKey = strings.TrimSpace(speakerKey)
	displayName = strings.TrimSpace(displayName)
	if speakerKey == "" || hasControlCharacters(speakerKey) || !speakerKeyExists(speakerKey, segments) {
		return dtos.SpeakerRenameResponse{}, newServiceError(ErrCodeInvalidSpeakerKey, errors.New("invalid speaker key"))
	}
	if err := validateSpeakerDisplayName(displayName); err != nil {
		return dtos.SpeakerRenameResponse{}, err
	}

	speakerNames := MapSpeakerNames(parent.Payload)
	reset := displayName == speakerKey
	if reset {
		delete(speakerNames, speakerKey)
	} else {
		speakerNames[speakerKey] = displayName
	}
	if err := updateParentPayloadByJobID(jobID, map[string]interface{}{"speaker_names": speakerNames, "updated_at": time.Now().UTC().Format(time.RFC3339)}); err != nil {
		return dtos.SpeakerRenameResponse{}, err
	}
	return dtos.SpeakerRenameResponse{SpeakerKey: speakerKey, DisplayName: SpeakerDisplayName(speakerKey, speakerNames), SpeakerNames: speakerNames, Reset: reset}, nil
}

func validateSpeakerDisplayName(value string) error {
	if value == "" || len([]rune(value)) > maxSpeakerNameRunes || hasControlCharacters(value) {
		return newServiceError(ErrCodeInvalidSpeakerName, errors.New("invalid speaker display name"))
	}
	return nil
}

func speakerKeyExists(speakerKey string, segments []QdrantPoint) bool {
	for _, segment := range segments {
		if getString(segment.Payload, "speaker", "") == speakerKey {
			return true
		}
	}
	return false
}

func hasControlCharacters(value string) bool {
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return true
		}
	}
	return false
}

func findSegmentForUpdate(jobID, segmentID string, segments []QdrantPoint) (*QdrantPoint, error) {
	for i := range segments {
		candidateID := SegmentIDFromPayload(jobID, segments[i].Payload)
		if candidateID == segmentID || getString(segments[i].Payload, "id", "") == segmentID || getString(segments[i].Payload, "segment_id", "") == segmentID || strconv.Itoa(getInt(segments[i].Payload, "segment_index", -1)) == segmentID {
			if getString(segments[i].Payload, "parent_job_id", "") != jobID {
				return nil, newServiceError(ErrCodeSegmentConflict, ErrSegmentConflict)
			}
			return &segments[i], nil
		}
	}
	return nil, nil
}

func GetStoredAnalysis(scope TranscriptAccessScope, jobID string) (dtos.Analysis, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.Analysis{}, err
	}
	return MapAnalysis(parent.Payload), nil
}

func GetAPIStats(scope TranscriptAccessScope) (dtos.StatsResponse, error) {
	parents, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return dtos.StatsResponse{}, err
	}
	segments, err := ListAllSegmentPoints()
	if err != nil {
		return dtos.StatsResponse{}, err
	}

	allowedJobIDs := map[string]struct{}{}
	for _, parent := range parents {
		if jobID := getString(parent.Payload, "job_id", ""); jobID != "" {
			allowedJobIDs[jobID] = struct{}{}
		}
	}
	stats := dtos.StatsResponse{
		TotalTranscripts: len(parents),
	}
	for _, segment := range segments {
		if _, ok := allowedJobIDs[getString(segment.Payload, "parent_job_id", "")]; ok {
			stats.TotalSegments++
		}
	}
	for _, parent := range parents {
		switch publicParentStatus(getString(parent.Payload, "status", "uploaded")) {
		case "uploaded":
			stats.Uploaded++
		case "diarized", "processing":
			stats.Diarized++
		case "transcribed":
			stats.Transcribed++
		case "failed":
			stats.Failed++
		}
		if getString(parent.Payload, "analysis_status", "not_started") == "complete" {
			stats.AnalysisComplete++
		}
	}
	return stats, nil
}

func CheckQdrantReady() error {
	url := fmt.Sprintf("%s/collections/%s", qdrantHost(), qdrantCollection)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := qdrantHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("qdrant readiness returned %s", resp.Status)
	}
	return nil
}

func CheckRedisReady(ctx context.Context) error {
	if RedisClient == nil {
		return fmt.Errorf("redis client is not initialized")
	}
	_, err := RedisClient.Ping(ctx).Result()
	return err
}

func CheckMinIOReady(ctx context.Context) error {
	if MinioClient == nil {
		return fmt.Errorf("minio client is not initialized")
	}
	_, err := MinioClient.BucketExists(ctx, "uploads")
	return err
}

func CheckDatabaseReady(ctx context.Context) error {
	if Database == nil {
		return fmt.Errorf("database is not initialized")
	}
	return Database.PingContext(ctx)
}

func EnsureTranscriptTextIndex() error {
	requestBody := map[string]interface{}{
		"field_name":   "transcript_text",
		"field_schema": "text",
	}
	err := qdrantRequest(http.MethodPut, fmt.Sprintf("/collections/%s/index?wait=true", qdrantCollection), requestBody, nil)
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) && serviceErr.Code == ErrCodeUpstream && strings.Contains(strings.ToLower(serviceErr.Error()), "already") {
			log.Println("✅ Qdrant transcript_text payload index already exists")
			return nil
		}
		return err
	}
	log.Println("✅ Qdrant transcript_text payload index ensured")
	return nil
}

func ListParentTranscriptPoints() ([]QdrantPoint, error) {
	return scrollAll(map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "type", "match": map[string]string{"value": "parent"}},
		},
	})
}

func ListParentTranscriptPointsForScope(scope TranscriptAccessScope) ([]QdrantPoint, error) {
	parents, err := ListParentTranscriptPoints()
	if err != nil {
		return nil, err
	}
	return filterParentTranscriptPointsForScope(scope, parents), nil
}

func filterParentTranscriptPointsForScope(scope TranscriptAccessScope, parents []QdrantPoint) []QdrantPoint {
	if scope.IsAdmin {
		return parents
	}
	filtered := make([]QdrantPoint, 0, len(parents))
	for _, parent := range parents {
		if parentOwnerUserID(parent.Payload) == scope.UserID && scope.UserID != "" {
			filtered = append(filtered, parent)
		}
	}
	return filtered
}

func GetParentTranscriptPoint(jobID string) (QdrantPoint, error) {
	points, err := scrollOnce(map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "type", "match": map[string]string{"value": "parent"}},
			{"key": "job_id", "match": map[string]string{"value": jobID}},
		},
	}, 1)
	if err != nil {
		return QdrantPoint{}, err
	}
	if len(points) == 0 {
		return QdrantPoint{}, newServiceError(ErrCodeTranscriptNotFound, ErrTranscriptNotFound)
	}
	return points[0], nil
}

func GetAuthorizedParentTranscriptPoint(scope TranscriptAccessScope, jobID string) (QdrantPoint, error) {
	parent, err := GetParentTranscriptPoint(jobID)
	if err != nil {
		return QdrantPoint{}, err
	}
	if scope.IsAdmin {
		return parent, nil
	}
	if ownerID := parentOwnerUserID(parent.Payload); ownerID != "" && ownerID == scope.UserID {
		return parent, nil
	}
	return QdrantPoint{}, newServiceError(ErrCodeForbidden, ErrForbidden)
}

func ListSegmentPointsByParent(jobID string) ([]QdrantPoint, error) {
	return scrollAll(map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "type", "match": map[string]string{"value": "segment"}},
			{"key": "parent_job_id", "match": map[string]string{"value": jobID}},
		},
	})
}

func ListAllSegmentPoints() ([]QdrantPoint, error) {
	return scrollAll(map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "type", "match": map[string]string{"value": "segment"}},
		},
	})
}

func scrollAll(filter map[string]interface{}) ([]QdrantPoint, error) {
	var all []QdrantPoint
	var offset interface{}
	for {
		points, nextOffset, err := scroll(filter, 100, offset)
		if err != nil {
			return nil, err
		}
		all = append(all, points...)
		if nextOffset == nil || len(points) == 0 {
			break
		}
		offset = nextOffset
	}
	return all, nil
}

func scrollOnce(filter map[string]interface{}, limit int) ([]QdrantPoint, error) {
	points, _, err := scroll(filter, limit, nil)
	return points, err
}

func scroll(filter map[string]interface{}, limit int, offset interface{}) ([]QdrantPoint, interface{}, error) {
	requestBody := map[string]interface{}{
		"filter":       filter,
		"limit":        limit,
		"with_payload": true,
		"with_vector":  false,
	}
	if offset != nil {
		requestBody["offset"] = offset
	}

	var response qdrantScrollResponse
	if err := qdrantRequest(http.MethodPost, fmt.Sprintf("/collections/%s/points/scroll", qdrantCollection), requestBody, &response); err != nil {
		return nil, nil, err
	}
	return response.Result.Points, response.Result.NextPageOffset, nil
}

func updateSegmentPayloadByIndex(jobID string, segmentIndex int, payload map[string]interface{}) error {
	requestBody := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{"key": "type", "match": map[string]string{"value": "segment"}},
				{"key": "parent_job_id", "match": map[string]string{"value": jobID}},
				{"key": "segment_index", "match": map[string]int{"value": segmentIndex}},
			},
		},
		"payload": payload,
	}
	return qdrantRequest(http.MethodPost, fmt.Sprintf("/collections/%s/points/payload?wait=true", qdrantCollection), requestBody, nil)
}

func updateParentPayloadByJobID(jobID string, payload map[string]interface{}) error {
	requestBody := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []map[string]interface{}{
				{"key": "type", "match": map[string]string{"value": "parent"}},
				{"key": "job_id", "match": map[string]string{"value": jobID}},
			},
		},
		"payload": payload,
	}
	return qdrantRequest(http.MethodPost, fmt.Sprintf("/collections/%s/points/payload?wait=true", qdrantCollection), requestBody, nil)
}

func qdrantRequest(method, path string, body interface{}, out interface{}) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return newServiceError(ErrCodeInternal, fmt.Errorf("failed to marshal qdrant request: %w", err))
		}
		reader = bytes.NewBuffer(data)
	}

	req, err := http.NewRequest(method, qdrantHost()+path, reader)
	if err != nil {
		return newServiceError(ErrCodeInternal, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := qdrantHTTPClient.Do(req)
	if err != nil {
		return newServiceError(ErrCodeUpstream, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return newServiceError(ErrCodeUpstream, err)
	}
	if resp.StatusCode >= 300 {
		return newServiceError(ErrCodeUpstream, fmt.Errorf("qdrant returned %s: %s", resp.Status, string(bodyBytes)))
	}
	if out != nil {
		if err := json.Unmarshal(bodyBytes, out); err != nil {
			return newServiceError(ErrCodeInternal, err)
		}
	}
	return nil
}

func qdrantHost() string {
	if host := os.Getenv("QDRANT_HOST"); host != "" {
		return strings.TrimRight(host, "/")
	}
	return "http://qdrant:6333"
}

func MapParentSummary(payload map[string]interface{}) dtos.TranscriptSummary {
	createdAt := getString(payload, "timestamp", "")
	updatedAt := firstString(payload, "updated_at", "transcription_completed_at", "diarization_completed_at", "timestamp")
	return dtos.TranscriptSummary{
		JobID:            getString(payload, "job_id", ""),
		Filename:         getString(payload, "filename", "Unknown"),
		Category:         getString(payload, "category", "Uncategorized"),
		ReferenceNumber:  getString(payload, "reference_number", "N/A"),
		Notes:            getString(payload, "notes", ""),
		Status:           publicParentStatus(getString(payload, "status", "uploaded")),
		SegmentCount:     parentSegmentCount(payload),
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
		AnalysisStatus:   publicAnalysisStatus(getString(payload, "analysis_status", "not_started")),
		OwnerUserID:      parentOwnerUserID(payload),
		OwnerDisplayName: getString(payload, "owner_display_name", ""),
		OwnerEmail:       getString(payload, "owner_email", ""),
	}
}

func MapTranscriptDetail(parent map[string]interface{}, segments []dtos.Segment) dtos.TranscriptDetail {
	createdAt := getString(parent, "timestamp", "")
	updatedAt := firstString(parent, "updated_at", "transcription_completed_at", "diarization_completed_at", "timestamp")
	return dtos.TranscriptDetail{
		JobID:            getString(parent, "job_id", ""),
		Filename:         getString(parent, "filename", "Unknown"),
		Category:         getString(parent, "category", "Uncategorized"),
		ReferenceNumber:  getString(parent, "reference_number", "N/A"),
		Notes:            getString(parent, "notes", ""),
		Status:           publicParentStatus(getString(parent, "status", "uploaded")),
		Speakers:         getInt(parent, "speakers", 0),
		SegmentCount:     parentSegmentCount(parent),
		MediaURL:         PublicMediaURL(getString(parent, "minio_url", "")),
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
		AnalysisStatus:   publicAnalysisStatus(getString(parent, "analysis_status", "not_started")),
		OwnerUserID:      parentOwnerUserID(parent),
		OwnerDisplayName: getString(parent, "owner_display_name", ""),
		OwnerEmail:       getString(parent, "owner_email", ""),
		SpeakerNames:     MapSpeakerNames(parent),
		Segments:         segments,
	}
}

func MapTranscriptStatus(parent map[string]interface{}, segments []QdrantPoint, includeFailureDetails bool) dtos.TranscriptStatusResponse {
	status := getString(parent, "status", "uploaded")
	analysisStatus := getString(parent, "analysis_status", "not_started")
	stage := currentStage(status, analysisStatus, segments)
	normalizedStatus := transcriptStatusKey(status, analysisStatus, segments)
	updatedAt := firstString(parent, "updated_at", "analysis_completed_at", "transcription_completed_at", "diarization_completed_at", "timestamp")
	failure := failureMessage(parent, segments)
	var failureCodeValue *string
	var failureMessageValue *string
	if normalizedStatus == "failed" {
		code := failureCode(stage, failure)
		if code == "" {
			code = strings.ToUpper(stage) + "_FAILED"
		}
		failureCodeValue = &code
		message := "Transcript processing failed. Please contact an administrator."
		if includeFailureDetails && failure != "" {
			message = failure
		}
		failureMessageValue = &message
	}

	return dtos.TranscriptStatusResponse{
		JobID:          getString(parent, "job_id", ""),
		Status:         normalizedStatus,
		Stage:          stage,
		IsTerminal:     transcriptStatusTerminal(normalizedStatus),
		UpdatedAt:      updatedAt,
		FailureCode:    failureCodeValue,
		FailureMessage: failureMessageValue,
	}
}

func transcriptStatusKey(status, analysisStatus string, segments []QdrantPoint) string {
	canonical := canonicalJobStatus(status, analysisStatus, segments)
	switch canonical {
	case "conversion_failed", "diarization_failed", "transcription_failed", "analysis_failed", "failed", "error":
		return "failed"
	case "uploaded", "queued", "pending", "pending_conversion":
		return "queued_conversion"
	case "converting":
		return "converting"
	case "diarizing":
		return "diarizing"
	case "diarized", "transcribing", "processing":
		return "transcribing"
	case "transcribed", "completed":
		return "transcribed"
	case "analysis_processing", "analysis_pending":
		return "analysing"
	case "analysis_complete", "complete":
		return "complete"
	default:
		if status == "" {
			return "queued_conversion"
		}
		return publicParentStatus(status)
	}
}

func transcriptStatusTerminal(status string) bool {
	return status == "complete" || status == "transcribed" || status == "failed"
}

func MapSpeakerNames(payload map[string]interface{}) map[string]string {
	result := map[string]string{}
	value := payload["speaker_names"]
	switch typed := value.(type) {
	case map[string]string:
		for key, name := range typed {
			if key != "" && name != "" {
				result[key] = name
			}
		}
	case map[string]interface{}:
		for key, value := range typed {
			if name, ok := value.(string); ok && key != "" && name != "" {
				result[key] = name
			}
		}
	}
	return result
}

func SpeakerDisplayName(speakerKey string, speakerNames map[string]string) string {
	if speakerNames != nil {
		if displayName := strings.TrimSpace(speakerNames[speakerKey]); displayName != "" {
			return displayName
		}
	}
	if strings.TrimSpace(speakerKey) == "" {
		return "Unknown speaker"
	}
	return speakerKey
}

func parentOwnerUserID(payload map[string]interface{}) string {
	return getString(payload, "owner_user_id", "")
}

func MapSegment(parent, payload map[string]interface{}) dtos.Segment {
	jobID := getString(payload, "parent_job_id", getString(parent, "job_id", ""))
	mediaURL := getString(payload, "minio_url", "")
	if mediaURL == "" {
		mediaURL = getString(parent, "minio_url", "")
	}
	return dtos.Segment{
		ID:             SegmentIDFromPayload(jobID, payload),
		SegmentIndex:   getInt(payload, "segment_index", 0),
		Speaker:        getString(payload, "speaker", "Unknown"),
		StartTime:      getFloat(payload, "start_time", 0),
		EndTime:        getFloat(payload, "end_time", 0),
		TranscriptText: getString(payload, "transcript_text", ""),
		Status:         getString(payload, "status", "pending_transcription"),
		MediaURL:       PublicMediaURL(mediaURL),
	}
}

func MapAnalysis(payload map[string]interface{}) dtos.Analysis {
	return dtos.Analysis{
		Status:             publicAnalysisStatus(getString(payload, "analysis_status", "not_started")),
		Keywords:           getStringSlice(payload, "analysis_keywords"),
		Entities:           analysisEntities(payload["analysis_entities"]),
		Summary:            getString(payload, "analysis_summary", ""),
		Classification:     getString(payload, "analysis_classification", ""),
		EnglishTranslation: getString(payload, "analysis_english_translation", ""),
	}
}

func SegmentIDFromPayload(jobID string, payload map[string]interface{}) string {
	if id := getString(payload, "segment_id", ""); id != "" {
		return id
	}
	return fmt.Sprintf("%s_seg_%03d", jobID, getInt(payload, "segment_index", 0))
}

func PublicMediaURL(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	publicBase := strings.TrimRight(os.Getenv("MINIO_PUBLIC_URL"), "/")
	if publicBase == "" {
		return rawURL
	}
	parsedRaw, err := url.Parse(rawURL)
	if err != nil || parsedRaw.Path == "" {
		return rawURL
	}
	parsedPublic, err := url.Parse(publicBase)
	if err != nil || parsedPublic.Scheme == "" || parsedPublic.Host == "" {
		return rawURL
	}
	parsedPublic.Path = strings.TrimRight(parsedPublic.Path, "/") + parsedRaw.Path
	parsedPublic.RawQuery = parsedRaw.RawQuery
	return parsedPublic.String()
}

func publicParentStatus(status string) string {
	switch status {
	case "completed", "complete":
		return "transcribed"
	case "converting", "diarizing", "transcribing", "processing":
		return "processing"
	case "diarization_failed", "transcription_failed", "error", "failed":
		return "failed"
	case "conversion_failed":
		return "failed"
	case "uploaded", "diarized", "transcribed":
		return status
	default:
		if status == "" {
			return "uploaded"
		}
		return status
	}
}

func publicAnalysisStatus(status string) string {
	switch status {
	case "analysis_complete", "completed":
		return "complete"
	case "analysis_pending", "processing":
		return "processing"
	case "complete", "failed", "not_started":
		return status
	default:
		if status == "" {
			return "not_started"
		}
		return status
	}
}

func matchesParentSearch(payload map[string]interface{}, search string) bool {
	fields := []string{
		getString(payload, "filename", ""),
		getString(payload, "reference_number", ""),
		getString(payload, "category", ""),
	}
	for _, field := range fields {
		if strings.Contains(strings.ToLower(field), search) {
			return true
		}
	}
	return false
}

func parentSegmentCount(payload map[string]interface{}) int {
	if count := getInt(payload, "segment_count", 0); count > 0 {
		return count
	}
	return getInt(payload, "segments", 0)
}

func firstString(payload map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value := getString(payload, key, ""); value != "" {
			return value
		}
	}
	return ""
}

func getString(payload map[string]interface{}, key, fallback string) string {
	value, ok := payload[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return fallback
		}
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprintf("%v", typed)
	}
}

func getInt(payload map[string]interface{}, key string, fallback int) int {
	value, ok := payload[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed)
		}
	case string:
		parsed, err := strconv.Atoi(typed)
		if err == nil {
			return parsed
		}
	}
	return fallback
}

func getFloat(payload map[string]interface{}, key string, fallback float64) float64 {
	value, ok := payload[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case float64:
		return typed
	case float32:
		return float64(typed)
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case json.Number:
		parsed, err := typed.Float64()
		if err == nil {
			return parsed
		}
	case string:
		parsed, err := strconv.ParseFloat(typed, 64)
		if err == nil {
			return parsed
		}
	}
	return fallback
}

func getStringSlice(payload map[string]interface{}, key string) []string {
	value, ok := payload[key]
	if !ok || value == nil {
		return []string{}
	}
	switch typed := value.(type) {
	case []string:
		return typed
	case []interface{}:
		items := make([]string, 0, len(typed))
		for _, item := range typed {
			if item != nil {
				items = append(items, fmt.Sprintf("%v", item))
			}
		}
		return items
	default:
		return []string{}
	}
}

func analysisEntities(value interface{}) interface{} {
	if value == nil {
		return map[string][]string{
			"persons":       {},
			"locations":     {},
			"organizations": {},
			"events":        {},
		}
	}
	return value
}

func parseTimeOrZero(value string) time.Time {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}
	}
	return parsed
}

func copyPayload(payload map[string]interface{}) map[string]interface{} {
	copyMap := make(map[string]interface{}, len(payload))
	for key, value := range payload {
		copyMap[key] = value
	}
	return copyMap
}
