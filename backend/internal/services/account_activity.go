package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
)

var safeAccountActivityActions = map[string]struct{}{
	"auth.login_succeeded":          {},
	"transcript.uploaded":           {},
	"transcript.viewed":             {},
	"transcript.segment_updated":    {},
	"speaker_rename_succeeded":      {},
	"speaker_name_reset":            {},
	"analysis.started":              {},
	"analysis.completed":            {},
	"analysis_review_updated":       {},
	"transcript_download_succeeded": {},
	"export.pdf_generated":          {},
	"password_change_succeeded":     {},
	"profile_updated":               {},
}

func ListAccountActivity(ctx context.Context, userID string, page, pageSize int) (dtos.AccountActivityResponse, error) {
	if Database == nil {
		return dtos.AccountActivityResponse{}, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	page, pageSize = NormalizePagination(page, pageSize)
	actions := accountActivityActionList()
	actionClause, actionArgs := accountActivityActionClause(actions, 2)
	baseArgs := append([]interface{}{strings.TrimSpace(userID)}, actionArgs...)
	var total int
	if err := Database.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_events WHERE actor_user_id = $1 AND action IN (`+actionClause+`)`, baseArgs...).Scan(&total); err != nil {
		return dtos.AccountActivityResponse{}, err
	}
	queryArgs := append(baseArgs, pageSize, (page-1)*pageSize)
	limitIndex := len(baseArgs) + 1
	offsetIndex := len(baseArgs) + 2
	rows, err := Database.QueryContext(ctx, fmt.Sprintf(`SELECT id, action, resource_type, resource_id, metadata_json, created_at FROM audit_events WHERE actor_user_id = $1 AND action IN (%s) ORDER BY created_at DESC, id DESC LIMIT $%d OFFSET $%d`, actionClause, limitIndex, offsetIndex), queryArgs...)
	if err != nil {
		return dtos.AccountActivityResponse{}, err
	}
	defer rows.Close()
	items := []dtos.AccountActivityItem{}
	for rows.Next() {
		var id, action string
		var resourceType, resourceID sql.NullString
		var metadataRaw []byte
		var createdAt time.Time
		if err := rows.Scan(&id, &action, &resourceType, &resourceID, &metadataRaw, &createdAt); err != nil {
			return dtos.AccountActivityResponse{}, err
		}
		items = append(items, accountActivityDTO(id, action, resourceType, resourceID, metadataRaw, createdAt))
	}
	if err := rows.Err(); err != nil {
		return dtos.AccountActivityResponse{}, err
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	return dtos.AccountActivityResponse{Items: items, Pagination: dtos.Pagination{Page: page, PageSize: pageSize, Total: total, TotalPages: totalPages, HasNextPage: page < totalPages}}, nil
}

func accountActivityActionList() []string {
	items := make([]string, 0, len(safeAccountActivityActions))
	for action := range safeAccountActivityActions {
		items = append(items, action)
	}
	return items
}

func accountActivityActionClause(actions []string, start int) (string, []interface{}) {
	placeholders := make([]string, 0, len(actions))
	args := make([]interface{}, 0, len(actions))
	for index, action := range actions {
		placeholders = append(placeholders, "$"+strconv.Itoa(start+index))
		args = append(args, action)
	}
	return strings.Join(placeholders, ", "), args
}

func accountActivityDTO(id, action string, resourceType, resourceID sql.NullString, metadataRaw []byte, createdAt time.Time) dtos.AccountActivityItem {
	title, description := accountActivityText(action)
	metadata := map[string]interface{}{}
	_ = json.Unmarshal(metadataRaw, &metadata)
	return dtos.AccountActivityItem{ID: id, Action: action, Title: title, Description: description, ResourceType: stringPtrFromNull(resourceType), ResourceID: stringPtrFromNull(resourceID), ReferenceNumber: metadataString(metadata, "referenceNumber"), Filename: metadataString(metadata, "filename"), Detail: accountActivityDetail(action, metadata), CreatedAt: createdAt.UTC().Format(time.RFC3339)}
}

func metadataString(metadata map[string]interface{}, key string) string {
	if value, ok := metadata[key].(string); ok {
		return strings.TrimSpace(value)
	}
	return ""
}

func accountActivityDetail(action string, metadata map[string]interface{}) string {
	switch action {
	case "transcript.segment_updated":
		return "Edited transcript text"
	case "speaker_rename_succeeded":
		return fmt.Sprintf("%s renamed", metadataString(metadata, "speakerKey"))
	case "speaker_name_reset":
		return fmt.Sprintf("%s reset", metadataString(metadata, "speakerKey"))
	case "transcript_download_succeeded", "export.pdf_generated":
		format := metadataString(metadata, "format")
		if format != "" {
			return "Downloaded " + strings.ToUpper(format)
		}
	}
	return ""
}

func stringPtrFromNull(value sql.NullString) *string {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return nil
	}
	result := value.String
	return &result
}

func accountActivityText(action string) (string, string) {
	switch action {
	case "auth.login_succeeded":
		return "Signed in", "Your account was used to sign in."
	case "transcript.uploaded":
		return "Transcript uploaded", "You uploaded media for transcription."
	case "transcript.viewed":
		return "Transcript opened", "You opened a transcript."
	case "transcript.segment_updated":
		return "Transcript edited", "You edited transcript text."
	case "speaker_rename_succeeded", "speaker_name_reset":
		return "Speaker labels updated", "You updated speaker display names."
	case "analysis.started":
		return "Analysis requested", "You requested generated analysis."
	case "analysis.completed":
		return "Analysis completed", "Generated analysis completed."
	case "analysis_review_updated":
		return "Analysis review updated", "You updated human review status."
	case "transcript_download_succeeded", "export.pdf_generated":
		return "Transcript downloaded", "You exported or downloaded transcript data."
	case "password_change_succeeded":
		return "Password changed", "Your password was updated."
	case "profile_updated":
		return "Profile updated", "Your account profile was updated."
	default:
		return "Account activity", fmt.Sprintf("Safe account event: %s", action)
	}
}
