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
	maxReviewNoteRunes  = 500
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

type TranscriptSearchFilters struct {
	Query       string
	Filename    string
	Reference   string
	Category    string
	Status      string
	OwnerUserID string
	FolderID    string
	CreatedFrom string
	CreatedTo   string
	Speaker     string
	Page        int
	PageSize    int
	IsAdmin     bool
}

type TranscriptDownload struct {
	Filename    string
	ContentType string
	Body        []byte
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

func GetAPITranscripts(ctx context.Context, scope TranscriptAccessScope, page, pageSize int, search, status, folderID string, extraFilters ...string) (dtos.TranscriptListResponse, error) {
	reviewProgress := ""
	if len(extraFilters) > 0 {
		reviewProgress = extraFilters[0]
	}
	page, pageSize = NormalizePagination(page, pageSize)
	var folderJobIDs map[string]struct{}
	if strings.TrimSpace(folderID) != "" {
		var err error
		folderJobIDs, err = FolderJobIDSetForFilter(ctx, scope, folderID)
		if err != nil {
			return dtos.TranscriptListResponse{}, err
		}
	}
	parents, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return dtos.TranscriptListResponse{}, err
	}

	search = strings.ToLower(strings.TrimSpace(search))
	status = strings.TrimSpace(status)
	items := make([]dtos.TranscriptSummary, 0, len(parents))
	for _, point := range parents {
		payload := point.Payload
		if folderJobIDs != nil {
			if _, ok := folderJobIDs[getString(payload, "job_id", "")]; !ok {
				continue
			}
		}
		if status != "" && status != "all" && publicParentStatus(getString(payload, "status", "uploaded")) != status {
			continue
		}
		if reviewProgress != "" {
			total := parentSegmentCount(payload)
			reviewed := getInt(payload, "reviewed_segment_count", 0)
			pct := reviewPercentage(reviewed, total)
			if !matchesReviewProgressFilter(reviewProgress, pct, total) {
				continue
			}
		}
		if search != "" && !matchesParentSearch(payload, search) {
			continue
		}
		items = append(items, MapParentSummary(payload))
	}
	items = EnrichTranscriptSummariesWithFolders(ctx, scope, items)

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
	return SearchTranscripts(scope, TranscriptSearchFilters{Query: query, Page: page, PageSize: pageSize, Status: status, Category: category, IsAdmin: scope.IsAdmin})
}

func SearchTranscripts(scope TranscriptAccessScope, filters TranscriptSearchFilters) (dtos.TranscriptSearchResponse, error) {
	filters.Page, filters.PageSize = NormalizePagination(filters.Page, filters.PageSize)
	filters.Query = strings.TrimSpace(filters.Query)
	filters.Filename = strings.TrimSpace(filters.Filename)
	filters.Reference = strings.TrimSpace(filters.Reference)
	filters.Category = strings.TrimSpace(filters.Category)
	filters.Status = strings.TrimSpace(filters.Status)
	filters.OwnerUserID = strings.TrimSpace(filters.OwnerUserID)
	filters.FolderID = strings.TrimSpace(filters.FolderID)
	filters.Speaker = strings.TrimSpace(filters.Speaker)
	filters.IsAdmin = scope.IsAdmin
	if err := validateTranscriptSearchFilters(filters); err != nil {
		return dtos.TranscriptSearchResponse{}, err
	}
	if filters.OwnerUserID != "" && !scope.IsAdmin {
		return dtos.TranscriptSearchResponse{}, newServiceError(ErrCodeForbidden, ErrForbidden)
	}
	var folderJobIDs map[string]struct{}
	if filters.FolderID != "" {
		var err error
		folderJobIDs, err = FolderJobIDSetForFilter(context.Background(), scope, filters.FolderID)
		if err != nil {
			return dtos.TranscriptSearchResponse{}, err
		}
	}

	parents, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return dtos.TranscriptSearchResponse{}, newServiceError(ErrCodeSearchUnavailable, err)
	}
	segments, err := ListAllSegmentPoints()
	if err != nil {
		return dtos.TranscriptSearchResponse{}, newServiceError(ErrCodeSearchUnavailable, err)
	}
	if folderJobIDs != nil {
		filtered := parents[:0]
		for _, parent := range parents {
			if _, ok := folderJobIDs[getString(parent.Payload, "job_id", "")]; ok {
				filtered = append(filtered, parent)
			}
		}
		parents = filtered
	}
	result := BuildTranscriptSearchResponse(filters, segments, parents)
	result.Items = EnrichSearchResultsWithFolders(context.Background(), scope, result.Items)
	return result, nil
}

func BuildTranscriptSearchResponse(filters TranscriptSearchFilters, segments, parents []QdrantPoint) dtos.TranscriptSearchResponse {
	filters.Page, filters.PageSize = NormalizePagination(filters.Page, filters.PageSize)
	query := strings.TrimSpace(filters.Query)
	parentLookup := map[string]map[string]interface{}{}
	for _, parent := range parents {
		jobID := getString(parent.Payload, "job_id", "")
		if jobID != "" && parentMatchesSearchFilters(parent.Payload, filters) {
			parentLookup[jobID] = parent.Payload
		}
	}

	items := make([]dtos.TranscriptSearchResult, 0)
	matchedBySegment := map[string]struct{}{}
	for _, segment := range segments {
		jobID := getString(segment.Payload, "parent_job_id", "")
		parent, ok := parentLookup[jobID]
		if !ok {
			continue
		}
		text := getString(segment.Payload, "transcript_text", "")
		speakerKey := getString(segment.Payload, "speaker", "Unknown")
		speakerDisplayName := SpeakerDisplayName(speakerKey, MapSpeakerNames(parent))
		if filters.Speaker != "" && !containsFold(speakerKey, filters.Speaker) && !containsFold(speakerDisplayName, filters.Speaker) {
			continue
		}
		if query != "" && !literalContains(text, query) {
			continue
		}
		if query == "" && filters.Speaker == "" {
			continue
		}
		matchedBySegment[jobID] = struct{}{}
		total := parentSegmentCount(parent)
		reviewed := getInt(parent, "reviewed_segment_count", 0)
		items = append(items, dtos.TranscriptSearchResult{
			SegmentID:          SegmentIDFromPayload(jobID, segment.Payload),
			JobID:              jobID,
			Filename:           getString(parent, "filename", "Unknown"),
			ReferenceNumber:    getString(parent, "reference_number", "N/A"),
			Category:           getString(parent, "category", "Uncategorized"),
			TranscriptStatus:   publicParentStatus(getString(parent, "status", "uploaded")),
			CreatedAt:          getString(parent, "timestamp", ""),
			OwnerUserID:        parentOwnerUserID(parent),
			OwnerDisplayName:   getString(parent, "owner_display_name", ""),
			OwnerEmail:         getString(parent, "owner_email", ""),
			SegmentIndex:       getInt(segment.Payload, "segment_index", 0),
			Speaker:            speakerKey,
			SpeakerDisplayName: speakerDisplayName,
			StartTime:          getFloat(segment.Payload, "start_time", 0),
			EndTime:            getFloat(segment.Payload, "end_time", 0),
			TranscriptText:     text,
			MatchedText:             MatchExcerpt(text, query, 48),
			MatchExcerpt:            MatchExcerpt(text, query, 48),
			ReviewedSegmentCount:    reviewed,
			TotalSegmentCount:       total,
			ReviewPercentage:        reviewPercentage(reviewed, total),
		})
	}
	for jobID, parent := range parentLookup {
		if _, ok := matchedBySegment[jobID]; ok || !metadataMatchesQuery(parent, query) {
			continue
		}
		total := parentSegmentCount(parent)
		reviewed := getInt(parent, "reviewed_segment_count", 0)
		items = append(items, dtos.TranscriptSearchResult{JobID: jobID, Filename: getString(parent, "filename", "Unknown"), ReferenceNumber: getString(parent, "reference_number", "N/A"), Category: getString(parent, "category", "Uncategorized"), TranscriptStatus: publicParentStatus(getString(parent, "status", "uploaded")), CreatedAt: getString(parent, "timestamp", ""), OwnerUserID: parentOwnerUserID(parent), OwnerDisplayName: getString(parent, "owner_display_name", ""), OwnerEmail: getString(parent, "owner_email", ""), MatchedText: metadataMatchText(parent, query), MatchExcerpt: metadataMatchText(parent, query), ReviewedSegmentCount: reviewed, TotalSegmentCount: total, ReviewPercentage: reviewPercentage(reviewed, total)})
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
	start := (filters.Page - 1) * filters.PageSize
	if start > total {
		start = total
	}
	end := start + filters.PageSize
	if end > total {
		end = total
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + filters.PageSize - 1) / filters.PageSize
	}

	return dtos.TranscriptSearchResponse{
		Query: query,
		Items: items[start:end],
		Pagination: dtos.Pagination{
			Page:        filters.Page,
			PageSize:    filters.PageSize,
			Total:       total,
			TotalPages:  totalPages,
			HasNextPage: filters.Page < totalPages,
		},
	}
}

func validateTranscriptSearchFilters(filters TranscriptSearchFilters) error {
	if filters.Status != "" && filters.Status != "all" && !validPublicTranscriptStatus(filters.Status) {
		return newServiceError(ErrCodeInvalidSearchFilter, errors.New("invalid status filter"))
	}
	if filters.CreatedFrom != "" {
		if _, err := parseSearchDate(filters.CreatedFrom, false); err != nil {
			return newServiceError(ErrCodeInvalidSearchFilter, errors.New("invalid createdFrom"))
		}
	}
	if filters.CreatedTo != "" {
		if _, err := parseSearchDate(filters.CreatedTo, true); err != nil {
			return newServiceError(ErrCodeInvalidSearchFilter, errors.New("invalid createdTo"))
		}
	}
	return nil
}

func validPublicTranscriptStatus(status string) bool {
	switch status {
	case "uploaded", "processing", "converting", "diarizing", "transcribing", "diarized", "transcribed", "completed", "complete", "failed", "queued_conversion", "analysing":
		return true
	default:
		return false
	}
}

func parentMatchesSearchFilters(parent map[string]interface{}, filters TranscriptSearchFilters) bool {
	if filters.Status != "" && filters.Status != "all" && publicParentStatus(getString(parent, "status", "uploaded")) != filters.Status {
		return false
	}
	if filters.Filename != "" && !containsFold(getString(parent, "filename", ""), filters.Filename) {
		return false
	}
	if filters.Reference != "" && !containsFold(getString(parent, "reference_number", ""), filters.Reference) {
		return false
	}
	if filters.Category != "" && !containsFold(getString(parent, "category", ""), filters.Category) {
		return false
	}
	if filters.OwnerUserID != "" && parentOwnerUserID(parent) != filters.OwnerUserID {
		return false
	}
	created := parseTimeOrZero(getString(parent, "timestamp", ""))
	if filters.CreatedFrom != "" {
		from, _ := parseSearchDate(filters.CreatedFrom, false)
		if created.IsZero() || created.Before(from) {
			return false
		}
	}
	if filters.CreatedTo != "" {
		to, _ := parseSearchDate(filters.CreatedTo, true)
		if created.IsZero() || created.After(to) {
			return false
		}
	}
	return true
}

func metadataMatchesQuery(parent map[string]interface{}, query string) bool {
	query = strings.TrimSpace(query)
	if query == "" {
		return true
	}
	for _, value := range []string{getString(parent, "filename", ""), getString(parent, "reference_number", ""), getString(parent, "category", ""), publicParentStatus(getString(parent, "status", "uploaded")), getString(parent, "owner_display_name", ""), getString(parent, "owner_email", "")} {
		if containsFold(value, query) {
			return true
		}
	}
	for _, value := range MapSpeakerNames(parent) {
		if containsFold(value, query) {
			return true
		}
	}
	return false
}

func metadataMatchText(parent map[string]interface{}, query string) string {
	if query == "" {
		return getString(parent, "filename", "Unknown")
	}
	for _, value := range []string{getString(parent, "filename", ""), getString(parent, "reference_number", ""), getString(parent, "category", ""), publicParentStatus(getString(parent, "status", "uploaded")), getString(parent, "owner_display_name", ""), getString(parent, "owner_email", "")} {
		if containsFold(value, query) {
			return value
		}
	}
	for _, value := range MapSpeakerNames(parent) {
		if containsFold(value, query) {
			return value
		}
	}
	return "Metadata match"
}

func containsFold(value, query string) bool {
	return strings.Contains(strings.ToLower(value), strings.ToLower(strings.TrimSpace(query)))
}

func parseSearchDate(value string, endOfDay bool) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, nil
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, err
	}
	if endOfDay {
		return parsed.Add(24*time.Hour - time.Nanosecond), nil
	}
	return parsed, nil
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
	if memberships := folderMemberships(context.Background(), scope, []string{jobID}); len(memberships) > 0 {
		if membership, ok := memberships[jobID]; ok {
			detail.FolderID = membership.ID
			detail.FolderName = membership.Name
		}
	}
	if detail.SegmentCount == 0 {
		detail.SegmentCount = len(segmentDTOs)
	}
	if detail.Speakers == 0 {
		detail.Speakers = len(speakers)
	}
	return detail, nil
}

func GetAPITranscriptStatus(ctx context.Context, scope TranscriptAccessScope, jobID string) (dtos.TranscriptStatusResponse, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.TranscriptStatusResponse{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.TranscriptStatusResponse{}, err
	}
	status := MapTranscriptStatus(parent.Payload, segments, scope.IsAdmin)
	NotifyTranscriptStatusObserved(ctx, parent.Payload, status)
	return status, nil
}

func BuildTranscriptDownload(scope TranscriptAccessScope, jobID, format string) (TranscriptDownload, error) {
	format = strings.ToLower(strings.TrimSpace(format))
	if !supportedTranscriptDownloadFormat(format) {
		return TranscriptDownload{}, newServiceError(ErrCodeUnsupportedDownloadFormat, errors.New("unsupported download format"))
	}
	detail, err := GetAPITranscriptDetail(scope, jobID)
	if err != nil {
		return TranscriptDownload{}, err
	}
	if err := validateDownloadSegments(detail.Segments); err != nil {
		return TranscriptDownload{}, err
	}
	base := safeDownloadBaseName(detail.ReferenceNumber)
	if base == "" {
		base = safeDownloadBaseName(detail.Filename)
	}
	if base == "" {
		base = "transcript-" + detail.JobID
	}
	body, contentType, err := renderTranscriptDownload(scope, detail, format)
	if err != nil {
		return TranscriptDownload{}, err
	}
	return TranscriptDownload{Filename: base + "." + format, ContentType: contentType, Body: body}, nil
}

func ReassignTranscriptOwner(ctx context.Context, jobID, newOwnerUserID string) (dtos.TranscriptReassignmentResponse, error) {
	jobID = strings.TrimSpace(jobID)
	newOwnerUserID = strings.TrimSpace(newOwnerUserID)
	if jobID == "" || newOwnerUserID == "" {
		return dtos.TranscriptReassignmentResponse{}, newServiceError(ErrCodeBadRequest, errors.New("job ID and new owner are required"))
	}
	parent, err := GetParentTranscriptPoint(jobID)
	if err != nil {
		return dtos.TranscriptReassignmentResponse{}, err
	}
	target, err := GetUserByID(ctx, newOwnerUserID)
	if err != nil {
		var serviceErr *ServiceError
		if errors.As(err, &serviceErr) && serviceErr.Code == ErrCodeUserNotFound {
			return dtos.TranscriptReassignmentResponse{}, newServiceError(ErrCodeTargetUserNotFound, errors.New("target user not found"))
		}
		return dtos.TranscriptReassignmentResponse{}, err
	}
	if !target.IsActive {
		return dtos.TranscriptReassignmentResponse{}, newServiceError(ErrCodeTargetUserInactive, errors.New("target user inactive"))
	}
	previousOwnerUserID := parentOwnerUserID(parent.Payload)
	if previousOwnerUserID != "" && previousOwnerUserID == target.ID {
		return dtos.TranscriptReassignmentResponse{}, newServiceError(ErrCodeTranscriptOwnerUnchanged, errors.New("owner unchanged"))
	}
	updatedAt := time.Now().UTC().Format(time.RFC3339)
	payload := map[string]interface{}{
		"owner_user_id":      target.ID,
		"owner_display_name": target.Name,
		"owner_email":        target.Email,
		"updated_at":         updatedAt,
	}
	if err := updateParentPayloadByJobID(jobID, payload); err != nil {
		return dtos.TranscriptReassignmentResponse{}, err
	}
	_ = RemoveTranscriptFolderMembership(ctx, jobID)
	NotifyTranscriptAssigned(ctx, jobID, target.ID, updatedAt)
	return dtos.TranscriptReassignmentResponse{JobID: jobID, PreviousOwnerUserID: previousOwnerUserID, NewOwner: dtos.TranscriptDeletionOwner{DisplayName: target.Name, Email: target.Email}}, nil
}

func supportedTranscriptDownloadFormat(format string) bool {
	switch format {
	case "txt", "json", "srt", "vtt":
		return true
	default:
		return false
	}
}

func renderTranscriptDownload(scope TranscriptAccessScope, detail dtos.TranscriptDetail, format string) ([]byte, string, error) {
	switch format {
	case "txt":
		return []byte(renderTranscriptTXT(detail)), "text/plain; charset=utf-8", nil
	case "json":
		data, err := json.MarshalIndent(MapTranscriptDownloadDocument(scope, detail), "", "  ")
		if err != nil {
			return nil, "", newServiceError(ErrCodeInternal, err)
		}
		return data, "application/json; charset=utf-8", nil
	case "srt":
		return []byte(renderTranscriptSubtitles(detail, "srt")), "application/x-subrip; charset=utf-8", nil
	case "vtt":
		return []byte(renderTranscriptSubtitles(detail, "vtt")), "text/vtt; charset=utf-8", nil
	default:
		return nil, "", newServiceError(ErrCodeUnsupportedDownloadFormat, errors.New("unsupported download format"))
	}
}

func MapTranscriptDownloadDocument(scope TranscriptAccessScope, detail dtos.TranscriptDetail) dtos.TranscriptDownloadDocument {
	document := dtos.TranscriptDownloadDocument{JobID: detail.JobID, Filename: detail.Filename, ReferenceNumber: detail.ReferenceNumber, Category: detail.Category, SpeakerNames: detail.SpeakerNames, Segments: make([]dtos.TranscriptDownloadSegment, 0, len(detail.Segments))}
	if scope.IsAdmin {
		document.OwnerUserID = detail.OwnerUserID
		document.OwnerDisplayName = detail.OwnerDisplayName
		document.OwnerEmail = detail.OwnerEmail
	}
	for _, segment := range detail.Segments {
		document.Segments = append(document.Segments, dtos.TranscriptDownloadSegment{ID: segment.ID, SegmentIndex: segment.SegmentIndex, Speaker: segment.Speaker, SpeakerDisplayName: SpeakerDisplayName(segment.Speaker, detail.SpeakerNames), StartTime: segment.StartTime, EndTime: segment.EndTime, TranscriptText: segment.TranscriptText, Status: segment.Status})
	}
	return document
}

func renderTranscriptTXT(detail dtos.TranscriptDetail) string {
	var builder strings.Builder
	builder.WriteString("Transcript\n")
	builder.WriteString("Job ID: " + detail.JobID + "\n")
	builder.WriteString("Filename: " + detail.Filename + "\n")
	builder.WriteString("Reference: " + detail.ReferenceNumber + "\n")
	builder.WriteString("Category: " + detail.Category + "\n\n")
	for _, segment := range detail.Segments {
		builder.WriteString(fmt.Sprintf("[%s - %s] %s\n%s\n\n", formatTranscriptTimestamp(segment.StartTime, "."), formatTranscriptTimestamp(segment.EndTime, "."), SpeakerDisplayName(segment.Speaker, detail.SpeakerNames), segment.TranscriptText))
	}
	return builder.String()
}

func renderTranscriptSubtitles(detail dtos.TranscriptDetail, format string) string {
	var builder strings.Builder
	if format == "vtt" {
		builder.WriteString("WEBVTT\n\n")
	}
	number := 1
	for _, segment := range detail.Segments {
		text := sanitizeSubtitleText(segment.TranscriptText)
		if text == "" {
			continue
		}
		if format == "srt" {
			builder.WriteString(strconv.Itoa(number) + "\n")
			builder.WriteString(formatTranscriptTimestamp(segment.StartTime, ",") + " --> " + formatTranscriptTimestamp(segment.EndTime, ",") + "\n")
		} else {
			builder.WriteString(formatTranscriptTimestamp(segment.StartTime, ".") + " --> " + formatTranscriptTimestamp(segment.EndTime, ".") + "\n")
		}
		builder.WriteString(SpeakerDisplayName(segment.Speaker, detail.SpeakerNames) + ": " + text + "\n\n")
		number++
	}
	return builder.String()
}

func validateDownloadSegments(segments []dtos.Segment) error {
	for _, segment := range segments {
		if !validSegmentTimestamp(segment.StartTime, segment.EndTime) {
			return newServiceError(ErrCodeInvalidTranscriptTimestamp, errors.New("invalid segment timestamp"))
		}
	}
	return nil
}

func validSegmentTimestamp(start, end float64) bool {
	return start >= 0 && end >= 0 && end >= start && start < 24*60*60*100
}

func formatTranscriptTimestamp(seconds float64, separator string) string {
	if seconds < 0 {
		seconds = 0
	}
	millis := int64(seconds*1000 + 0.5)
	hours := millis / 3600000
	millis %= 3600000
	minutes := millis / 60000
	millis %= 60000
	secs := millis / 1000
	millis %= 1000
	return fmt.Sprintf("%02d:%02d:%02d%s%03d", hours, minutes, secs, separator, millis)
}

func sanitizeSubtitleText(text string) string {
	lines := strings.Fields(strings.ReplaceAll(strings.ReplaceAll(text, "\r", "\n"), "\n", " "))
	return strings.Join(lines, " ")
}

func safeDownloadBaseName(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "N/A" {
		return ""
	}
	var builder strings.Builder
	for _, r := range value {
		if r < 32 || r == 127 || strings.ContainsRune(`<>:"/\|?*`, r) {
			continue
		}
		if r == ' ' || r == '\t' {
			builder.WriteRune('-')
			continue
		}
		builder.WriteRune(r)
	}
	return strings.Trim(builder.String(), ".-_")
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
	currentText := getString(target.Payload, "transcript_text", "")
	textChanged := currentText != transcriptText
	payload := map[string]interface{}{
		"transcript_text": transcriptText,
		"updated_at":      updatedAt,
	}
	if textChanged {
		payload["is_reviewed"] = false
		payload["reviewed_by"] = ""
		payload["reviewed_at"] = ""
	}
	if err := updateSegmentPayloadByIndex(jobID, segmentIndex, payload); err != nil {
		return dtos.Segment{}, err
	}

	if textChanged {
		// Recalculate and cache review progress after clearing review state
		segments, err = ListSegmentPointsByParent(jobID)
		if err == nil {
			allReviewSvc := 0
			for _, seg := range segments {
				if getBool(seg.Payload, "is_reviewed", false) {
					allReviewSvc++
				}
			}
			_ = cacheReviewProgressOnParent(jobID, allReviewSvc, len(segments))
		}
	}

	updatedPayload := copyPayload(target.Payload)
	updatedPayload["transcript_text"] = transcriptText
	updatedPayload["updated_at"] = updatedAt
	updatedPayload["is_reviewed"] = false
	updatedPayload["reviewed_by"] = ""
	updatedPayload["reviewed_at"] = ""
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

func UpdateSegmentReviewState(scope TranscriptAccessScope, user dtos.AuthUser, jobID, segmentID string, isReviewed bool) (dtos.SegmentReviewResponse, error) {
	if _, err := GetAuthorizedParentTranscriptPoint(scope, jobID); err != nil {
		return dtos.SegmentReviewResponse{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.SegmentReviewResponse{}, err
	}
	target, err := findSegmentForUpdate(jobID, segmentID, segments)
	if err != nil {
		return dtos.SegmentReviewResponse{}, err
	}
	if target == nil {
		return dtos.SegmentReviewResponse{}, newServiceError(ErrCodeSegmentNotFound, ErrSegmentNotFound)
	}
	segmentIndex := getInt(target.Payload, "segment_index", -1)
	if segmentIndex < 0 {
		return dtos.SegmentReviewResponse{}, newServiceError(ErrCodeInternal, fmt.Errorf("segment missing segment_index"))
	}

	now := time.Now().UTC().Format(time.RFC3339)
	payload := map[string]interface{}{"is_reviewed": isReviewed}
	if isReviewed {
		payload["reviewed_by"] = user.ID
		payload["reviewed_at"] = now
	} else {
		payload["reviewed_by"] = ""
		payload["reviewed_at"] = ""
	}
	if err := updateSegmentPayloadByIndex(jobID, segmentIndex, payload); err != nil {
		return dtos.SegmentReviewResponse{}, err
	}

	reviewed, total := segmentReviewCounts(segments, segmentIndex, isReviewed)
	if err := cacheReviewProgressOnParent(jobID, reviewed, total); err != nil {
		return dtos.SegmentReviewResponse{}, err
	}
	pct := reviewPercentage(reviewed, total)
	var reviewer *string
	var reviewedAt *string
	if isReviewed {
		reviewer = stringPtr(user.ID)
		reviewedAt = stringPtr(now)
	}
	return dtos.SegmentReviewResponse{
		SegmentID:            segmentID,
		IsReviewed:           isReviewed,
		ReviewedBy:           reviewer,
		ReviewedAt:           reviewedAt,
		ReviewedSegmentCount: reviewed,
		TotalSegmentCount:    total,
		ReviewPercentage:     pct,
	}, nil
}

func BulkUpdateSegmentReviewState(scope TranscriptAccessScope, user dtos.AuthUser, jobID string, isReviewed bool) (dtos.BulkReviewResponse, error) {
	if _, err := GetAuthorizedParentTranscriptPoint(scope, jobID); err != nil {
		return dtos.BulkReviewResponse{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return dtos.BulkReviewResponse{}, err
	}
	total := len(segments)
	if total == 0 {
		return dtos.BulkReviewResponse{
			TotalSegmentCount:    0,
			ReviewPercentage:     0,
			Message:              "Transcript has no segments to update",
		}, nil
	}

	now := time.Now().UTC().Format(time.RFC3339)
	for _, seg := range segments {
		idx := getInt(seg.Payload, "segment_index", -1)
		if idx < 0 {
			continue
		}
		payload := map[string]interface{}{"is_reviewed": isReviewed}
		if isReviewed {
			payload["reviewed_by"] = user.ID
			payload["reviewed_at"] = now
		} else {
			payload["reviewed_by"] = ""
			payload["reviewed_at"] = ""
		}
		if err := updateSegmentPayloadByIndex(jobID, idx, payload); err != nil {
			return dtos.BulkReviewResponse{}, err
		}
	}

	reviewed := 0
	if isReviewed {
		reviewed = total
	}
	if err := cacheReviewProgressOnParent(jobID, reviewed, total); err != nil {
		return dtos.BulkReviewResponse{}, err
	}
	pct := reviewPercentage(reviewed, total)
	msg := fmt.Sprintf("Marked all %d segments as reviewed", total)
	if !isReviewed {
		msg = fmt.Sprintf("Marked all %d segments as not reviewed", total)
	}
	return dtos.BulkReviewResponse{
		ReviewedSegmentCount: reviewed,
		TotalSegmentCount:    total,
		ReviewPercentage:     pct,
		Message:              msg,
	}, nil
}

func segmentReviewCounts(segments []QdrantPoint, changedIndex int, newValue bool) (int, int) {
	total := len(segments)
	reviewed := 0
	for _, seg := range segments {
		idx := getInt(seg.Payload, "segment_index", -1)
		if idx == changedIndex {
			if newValue {
				reviewed++
			}
		} else if getBool(seg.Payload, "is_reviewed", false) {
			reviewed++
		}
	}
	return reviewed, total
}

func RequireFullReview(scope TranscriptAccessScope, jobID string) error {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return err
	}
	reviewed := getInt(parent.Payload, "reviewed_segment_count", 0)
	total := parentSegmentCount(parent.Payload)
	if total == 0 || reviewed < total {
		return newServiceError(ErrCodeReviewNotComplete, fmt.Errorf("all transcript segments must be reviewed before this action"))
	}
	return nil
}

func cacheReviewProgressOnParent(jobID string, reviewed, total int) error {
	return updateParentPayloadByJobID(jobID, map[string]interface{}{
		"reviewed_segment_count": reviewed,
		"total_segment_count":    total,
		"review_percentage":      reviewPercentage(reviewed, total),
		"updated_at":             time.Now().UTC().Format(time.RFC3339),
	})
}

func stringPtr(value string) *string {
	return &value
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
	total := parentSegmentCount(payload)
	reviewed := getInt(payload, "reviewed_segment_count", 0)
	pct := reviewPercentage(reviewed, total)
	return dtos.TranscriptSummary{
		JobID:                getString(payload, "job_id", ""),
		Filename:             getString(payload, "filename", "Unknown"),
		Category:             getString(payload, "category", "Uncategorized"),
		ReferenceNumber:      getString(payload, "reference_number", "N/A"),
		Notes:                getString(payload, "notes", ""),
		Status:               publicParentStatus(getString(payload, "status", "uploaded")),
		SegmentCount:         total,
		CreatedAt:            createdAt,
		UpdatedAt:            updatedAt,
		AnalysisStatus:       publicAnalysisStatus(getString(payload, "analysis_status", "not_started")),
		AnalysisReviewStatus: MapAnalysisReview(payload).Status,
		ReviewedSegmentCount: reviewed,
		TotalSegmentCount:    total,
		ReviewPercentage:     pct,
		OwnerUserID:          parentOwnerUserID(payload),
		OwnerDisplayName:     getString(payload, "owner_display_name", ""),
		OwnerEmail:           getString(payload, "owner_email", ""),
	}
}

func MapTranscriptDetail(parent map[string]interface{}, segments []dtos.Segment) dtos.TranscriptDetail {
	createdAt := getString(parent, "timestamp", "")
	updatedAt := firstString(parent, "updated_at", "transcription_completed_at", "diarization_completed_at", "timestamp")
	total := len(segments)
	reviewed := 0
	for _, s := range segments {
		if s.IsReviewed {
			reviewed++
		}
	}
	pct := reviewPercentage(reviewed, total)
	return dtos.TranscriptDetail{
		JobID:                getString(parent, "job_id", ""),
		Filename:             getString(parent, "filename", "Unknown"),
		Category:             getString(parent, "category", "Uncategorized"),
		ReferenceNumber:      getString(parent, "reference_number", "N/A"),
		Notes:                getString(parent, "notes", ""),
		Status:               publicParentStatus(getString(parent, "status", "uploaded")),
		Speakers:             getInt(parent, "speakers", 0),
		SegmentCount:         total,
		MediaURL:             PublicMediaURL(getString(parent, "minio_url", "")),
		CreatedAt:            createdAt,
		UpdatedAt:            updatedAt,
		AnalysisStatus:       publicAnalysisStatus(getString(parent, "analysis_status", "not_started")),
		OwnerUserID:          parentOwnerUserID(parent),
		OwnerDisplayName:     getString(parent, "owner_display_name", ""),
		OwnerEmail:           getString(parent, "owner_email", ""),
		SpeakerNames:         MapSpeakerNames(parent),
		Segments:             segments,
		ReviewedSegmentCount: reviewed,
		TotalSegmentCount:    total,
		ReviewPercentage:     pct,
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

func ParentOwnerUserIDForAudit(payload map[string]interface{}) string {
	return parentOwnerUserID(payload)
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
		IsReviewed:     getBool(payload, "is_reviewed", false),
		ReviewedBy:     stringPtrIfNotEmpty(getString(payload, "reviewed_by", "")),
		ReviewedAt:     stringPtrIfNotEmpty(getString(payload, "reviewed_at", "")),
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
		Review:             MapAnalysisReview(payload),
	}
}

func MapAnalysisReview(payload map[string]interface{}) dtos.AnalysisReview {
	status := normalizeAnalysisReviewStatus(getString(payload, "analysis_review_status", ""))
	if status == "unreviewed" {
		return dtos.AnalysisReview{Status: status}
	}
	return dtos.AnalysisReview{Status: status, ReviewedByUserID: stringPtrIfNotEmpty(getString(payload, "analysis_reviewed_by_user_id", "")), ReviewedByDisplayName: stringPtrIfNotEmpty(getString(payload, "analysis_reviewed_by_display_name", "")), ReviewedAt: stringPtrIfNotEmpty(getString(payload, "analysis_reviewed_at", "")), Note: stringPtrIfNotEmpty(getString(payload, "analysis_review_note", ""))}
}

func UpdateAnalysisReview(scope TranscriptAccessScope, reviewer dtos.AuthUser, jobID, status, note string) (dtos.AnalysisReview, error) {
	parent, err := GetAuthorizedParentTranscriptPoint(scope, jobID)
	if err != nil {
		return dtos.AnalysisReview{}, err
	}
	if publicAnalysisStatus(getString(parent.Payload, "analysis_status", "not_started")) != "complete" {
		return dtos.AnalysisReview{}, newServiceError(ErrCodeAnalysisNotComplete, errors.New("analysis not complete"))
	}
	status = normalizeAnalysisReviewStatus(status)
	if !validAnalysisReviewStatus(status) {
		return dtos.AnalysisReview{}, newServiceError(ErrCodeInvalidReviewStatus, errors.New("invalid review status"))
	}
	note, err = normalizeReviewNote(note)
	if err != nil {
		return dtos.AnalysisReview{}, newServiceError(ErrCodeInvalidReviewNote, err)
	}
	payload := map[string]interface{}{"analysis_review_status": status, "updated_at": time.Now().UTC().Format(time.RFC3339)}
	if status == "unreviewed" {
		payload["analysis_reviewed_by_user_id"] = ""
		payload["analysis_reviewed_by_display_name"] = ""
		payload["analysis_reviewed_at"] = ""
		payload["analysis_review_note"] = ""
	} else {
		payload["analysis_reviewed_by_user_id"] = reviewer.ID
		payload["analysis_reviewed_by_display_name"] = reviewer.Name
		payload["analysis_reviewed_at"] = time.Now().UTC().Format(time.RFC3339)
		payload["analysis_review_note"] = note
	}
	if err := updateParentPayloadByJobID(jobID, payload); err != nil {
		return dtos.AnalysisReview{}, err
	}
	merged := copyPayload(parent.Payload)
	for key, value := range payload {
		merged[key] = value
	}
	return MapAnalysisReview(merged), nil
}

func normalizeAnalysisReviewStatus(status string) string {
	status = strings.ToLower(strings.TrimSpace(status))
	if status == "" {
		return "unreviewed"
	}
	return status
}

func validAnalysisReviewStatus(status string) bool {
	switch status {
	case "unreviewed", "reviewed", "approved", "rejected":
		return true
	default:
		return false
	}
}

func normalizeReviewNote(note string) (string, error) {
	note = strings.TrimSpace(note)
	if len([]rune(note)) > maxReviewNoteRunes {
		return "", errors.New("review note is too long")
	}
	for _, r := range note {
		if r < 32 && r != '\n' && r != '\t' || r == 127 {
			return "", errors.New("review note contains control characters")
		}
	}
	return note, nil
}

func stringPtrIfNotEmpty(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func matchesReviewProgressFilter(filter string, pct, total int) bool {
	switch strings.ToLower(strings.TrimSpace(filter)) {
	case "not_reviewed":
		return total == 0 || pct == 0
	case "in_progress":
		return total > 0 && pct > 0 && pct < 100
	case "fully_reviewed":
		return total > 0 && pct == 100
	case "", "all":
		return true
	default:
		return true
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

func getBool(payload map[string]interface{}, key string, fallback bool) bool {
	value, ok := payload[key]
	if !ok || value == nil {
		return fallback
	}
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.ToLower(typed) == "true" || typed == "1"
	case int:
		return typed != 0
	case int64:
		return typed != 0
	case float64:
		return typed != 0
	default:
		return fallback
	}
}

func reviewPercentage(reviewed, total int) int {
	if total == 0 {
		return 0
	}
	return reviewed * 100 / total
}

func copyPayload(payload map[string]interface{}) map[string]interface{} {
	copyMap := make(map[string]interface{}, len(payload))
	for key, value := range payload {
		copyMap[key] = value
	}
	return copyMap
}
