// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: folders.go
// Description: Service layer for folders
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	maxFolderNameRunes        = 120
	maxFolderDescriptionRunes = 500
)

type FolderListFilters struct {
	Page        int
	PageSize    int
	Search      string
	OwnerUserID string
}

type folderRecord struct {
	ID               string
	OwnerUserID      string
	OwnerDisplayName string
	Name             string
	Description      string
	TranscriptCount  int
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func ListFolders(ctx context.Context, scope TranscriptAccessScope, filters FolderListFilters) (dtos.FolderListResponse, error) {
	if Database == nil {
		return dtos.FolderListResponse{}, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	filters.Page, filters.PageSize = NormalizePagination(filters.Page, filters.PageSize)
	filters.Search = strings.TrimSpace(filters.Search)
	filters.OwnerUserID = strings.TrimSpace(filters.OwnerUserID)
	where, args, err := folderWhere(scope, filters)
	if err != nil {
		return dtos.FolderListResponse{}, err
	}
	var total int
	if err := Database.QueryRowContext(ctx, `SELECT COUNT(*) FROM transcript_folders f `+where, args...).Scan(&total); err != nil {
		return dtos.FolderListResponse{}, err
	}
	offset := (filters.Page - 1) * filters.PageSize
	queryArgs := append(append([]interface{}{}, args...), filters.PageSize, offset)
	rows, err := Database.QueryContext(ctx, fmt.Sprintf(`SELECT f.id::text, f.owner_user_id::text, u.name, f.name, f.description, COUNT(i.transcript_job_id), f.created_at, f.updated_at FROM transcript_folders f JOIN users u ON u.id = f.owner_user_id LEFT JOIN transcript_folder_items i ON i.folder_id = f.id %s GROUP BY f.id, u.name ORDER BY f.updated_at DESC, f.id DESC LIMIT $%d OFFSET $%d`, where, len(args)+1, len(args)+2), queryArgs...)
	if err != nil {
		return dtos.FolderListResponse{}, err
	}
	defer rows.Close()
	items := []dtos.Folder{}
	for rows.Next() {
		record, err := scanFolder(rows)
		if err != nil {
			return dtos.FolderListResponse{}, err
		}
		items = append(items, folderDTO(record))
	}
	if err := rows.Err(); err != nil {
		return dtos.FolderListResponse{}, err
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + filters.PageSize - 1) / filters.PageSize
	}
	return dtos.FolderListResponse{Items: items, Pagination: dtos.Pagination{Page: filters.Page, PageSize: filters.PageSize, Total: total, TotalPages: totalPages, HasNextPage: filters.Page < totalPages}}, nil
}

func CreateFolder(ctx context.Context, scope TranscriptAccessScope, user dtos.AuthUser, name, description string) (dtos.Folder, error) {
	name, description, err := validateFolderInput(name, description)
	if err != nil {
		return dtos.Folder{}, err
	}
	row := Database.QueryRowContext(ctx, `INSERT INTO transcript_folders (id, owner_user_id, name, description) VALUES ($1, $2, $3, $4) RETURNING id::text, owner_user_id::text, $5::text, name, description, 0, created_at, updated_at`, uuid.NewString(), user.ID, name, description, user.Name)
	folder, err := scanFolder(row)
	if err != nil {
		return dtos.Folder{}, mapFolderSQLError(err)
	}
	return folderDTO(folder), nil
}

func GetFolderDetail(ctx context.Context, scope TranscriptAccessScope, folderID string) (dtos.FolderDetailResponse, error) {
	folder, err := getAuthorizedFolder(ctx, scope, folderID)
	if err != nil {
		return dtos.FolderDetailResponse{}, err
	}
	jobIDs, err := folderJobIDs(ctx, folder.ID)
	if err != nil {
		return dtos.FolderDetailResponse{}, err
	}
	parents, err := ListParentTranscriptPointsForScope(scope)
	if err != nil {
		return dtos.FolderDetailResponse{}, err
	}
	allowed := stringSet(jobIDs)
	items := []dtos.TranscriptSummary{}
	for _, parent := range parents {
		if _, ok := allowed[getString(parent.Payload, "job_id", "")]; ok {
			item := MapParentSummary(parent.Payload)
			item.FolderID = folder.ID
			item.FolderName = folder.Name
			items = append(items, item)
		}
	}
	return dtos.FolderDetailResponse{Folder: folderDTO(folder), Transcripts: items}, nil
}

func UpdateFolder(ctx context.Context, scope TranscriptAccessScope, folderID, name, description string) (dtos.Folder, error) {
	folder, err := getAuthorizedFolder(ctx, scope, folderID)
	if err != nil {
		return dtos.Folder{}, err
	}
	name, description, err = validateFolderInput(name, description)
	if err != nil {
		return dtos.Folder{}, err
	}
	row := Database.QueryRowContext(ctx, `UPDATE transcript_folders SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING id::text, owner_user_id::text, $4::text, name, description, $5::int, created_at, updated_at`, name, description, folder.ID, folder.OwnerDisplayName, folder.TranscriptCount)
	next, err := scanFolder(row)
	if err != nil {
		return dtos.Folder{}, mapFolderSQLError(err)
	}
	return folderDTO(next), nil
}

func DeleteFolder(ctx context.Context, scope TranscriptAccessScope, folderID string) error {
	folder, err := getAuthorizedFolder(ctx, scope, folderID)
	if err != nil {
		return err
	}
	if folder.TranscriptCount > 0 {
		return newServiceError(ErrCodeFolderNotEmpty, errors.New("folder is not empty"))
	}
	_, err = Database.ExecContext(ctx, `DELETE FROM transcript_folders WHERE id = $1`, folder.ID)
	return err
}

func AddTranscriptToFolder(ctx context.Context, scope TranscriptAccessScope, folderID, jobID string) error {
	folder, err := getAuthorizedFolder(ctx, scope, folderID)
	if err != nil {
		return err
	}
	if _, err := GetAuthorizedParentTranscriptPoint(scope, strings.TrimSpace(jobID)); err != nil {
		return err
	}
	_, err = Database.ExecContext(ctx, `INSERT INTO transcript_folder_items (folder_id, transcript_job_id) VALUES ($1, $2)`, folder.ID, strings.TrimSpace(jobID))
	if err != nil {
		return mapFolderItemSQLError(err)
	}
	_, _ = Database.ExecContext(ctx, `UPDATE transcript_folders SET updated_at = NOW() WHERE id = $1`, folder.ID)
	return nil
}

func RemoveTranscriptFromFolder(ctx context.Context, scope TranscriptAccessScope, folderID, jobID string) error {
	folder, err := getAuthorizedFolder(ctx, scope, folderID)
	if err != nil {
		return err
	}
	result, err := Database.ExecContext(ctx, `DELETE FROM transcript_folder_items WHERE folder_id = $1 AND transcript_job_id = $2`, folder.ID, strings.TrimSpace(jobID))
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return newServiceError(ErrCodeTranscriptNotInFolder, errors.New("transcript is not in folder"))
	}
	_, _ = Database.ExecContext(ctx, `UPDATE transcript_folders SET updated_at = NOW() WHERE id = $1`, folder.ID)
	return nil
}

func RemoveTranscriptFolderMembership(ctx context.Context, jobID string) error {
	if Database == nil {
		return nil
	}
	_, err := Database.ExecContext(ctx, `DELETE FROM transcript_folder_items WHERE transcript_job_id = $1`, strings.TrimSpace(jobID))
	return err
}

func FolderJobIDSetForFilter(ctx context.Context, scope TranscriptAccessScope, folderID string) (map[string]struct{}, error) {
	folder, err := getAuthorizedFolder(ctx, scope, folderID)
	if err != nil {
		return nil, err
	}
	jobIDs, err := folderJobIDs(ctx, folder.ID)
	if err != nil {
		return nil, err
	}
	return stringSet(jobIDs), nil
}

func EnrichTranscriptSummariesWithFolders(ctx context.Context, scope TranscriptAccessScope, items []dtos.TranscriptSummary) []dtos.TranscriptSummary {
	if Database == nil || len(items) == 0 {
		return items
	}
	jobIDs := make([]string, 0, len(items))
	for _, item := range items {
		jobIDs = append(jobIDs, item.JobID)
	}
	memberships := folderMemberships(ctx, scope, jobIDs)
	for i := range items {
		if membership, ok := memberships[items[i].JobID]; ok {
			items[i].FolderID = membership.ID
			items[i].FolderName = membership.Name
		}
	}
	return items
}

func EnrichSearchResultsWithFolders(ctx context.Context, scope TranscriptAccessScope, items []dtos.TranscriptSearchResult) []dtos.TranscriptSearchResult {
	if Database == nil || len(items) == 0 {
		return items
	}
	seen := map[string]struct{}{}
	jobIDs := []string{}
	for _, item := range items {
		if _, ok := seen[item.JobID]; !ok {
			seen[item.JobID] = struct{}{}
			jobIDs = append(jobIDs, item.JobID)
		}
	}
	memberships := folderMemberships(ctx, scope, jobIDs)
	for i := range items {
		if membership, ok := memberships[items[i].JobID]; ok {
			items[i].FolderID = membership.ID
			items[i].FolderName = membership.Name
		}
	}
	return items
}

func folderWhere(scope TranscriptAccessScope, filters FolderListFilters) (string, []interface{}, error) {
	clauses := []string{"1=1"}
	args := []interface{}{}
	if scope.IsAdmin {
		if filters.OwnerUserID != "" {
			args = append(args, filters.OwnerUserID)
			clauses = append(clauses, fmt.Sprintf("f.owner_user_id = $%d", len(args)))
		}
	} else {
		args = append(args, scope.UserID)
		clauses = append(clauses, fmt.Sprintf("f.owner_user_id = $%d", len(args)))
	}
	if filters.OwnerUserID != "" && !scope.IsAdmin {
		return "", nil, newServiceError(ErrCodeForbidden, ErrForbidden)
	}
	if filters.Search != "" {
		args = append(args, "%"+strings.ToLower(filters.Search)+"%")
		clauses = append(clauses, fmt.Sprintf("(lower(f.name) LIKE $%d OR lower(f.description) LIKE $%d)", len(args), len(args)))
	}
	return "WHERE " + strings.Join(clauses, " AND "), args, nil
}

func getAuthorizedFolder(ctx context.Context, scope TranscriptAccessScope, folderID string) (folderRecord, error) {
	if _, err := uuid.Parse(strings.TrimSpace(folderID)); err != nil {
		return folderRecord{}, newServiceError(ErrCodeFolderNotFound, errors.New("folder not found"))
	}
	row := Database.QueryRowContext(ctx, `SELECT f.id::text, f.owner_user_id::text, u.name, f.name, f.description, COUNT(i.transcript_job_id), f.created_at, f.updated_at FROM transcript_folders f JOIN users u ON u.id = f.owner_user_id LEFT JOIN transcript_folder_items i ON i.folder_id = f.id WHERE f.id = $1 GROUP BY f.id, u.name`, folderID)
	folder, err := scanFolder(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return folderRecord{}, newServiceError(ErrCodeFolderNotFound, errors.New("folder not found"))
		}
		return folderRecord{}, err
	}
	if !scope.IsAdmin && folder.OwnerUserID != scope.UserID {
		return folderRecord{}, newServiceError(ErrCodeFolderNotFound, errors.New("folder not found"))
	}
	return folder, nil
}

func validateFolderInput(name, description string) (string, string, error) {
	name = strings.TrimSpace(name)
	description = strings.TrimSpace(description)
	if name == "" {
		return "", "", newServiceError(ErrCodeFolderNameRequired, errors.New("folder name is required"))
	}
	if len([]rune(name)) > maxFolderNameRunes || hasControlCharacter(name) {
		return "", "", newServiceError(ErrCodeInvalidUserInput, errors.New("folder name is invalid"))
	}
	if len([]rune(description)) > maxFolderDescriptionRunes || hasControlCharacter(description) {
		return "", "", newServiceError(ErrCodeInvalidUserInput, errors.New("folder description is invalid"))
	}
	return name, description, nil
}

func hasControlCharacter(value string) bool {
	for _, r := range value {
		if (r < 32 && r != '\n' && r != '\t') || r == 127 {
			return true
		}
	}
	return false
}

type folderScanner interface {
	Scan(dest ...interface{}) error
}

func scanFolder(scanner folderScanner) (folderRecord, error) {
	var f folderRecord
	err := scanner.Scan(&f.ID, &f.OwnerUserID, &f.OwnerDisplayName, &f.Name, &f.Description, &f.TranscriptCount, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func folderDTO(f folderRecord) dtos.Folder {
	return dtos.Folder{ID: f.ID, Name: f.Name, Description: f.Description, OwnerUserID: f.OwnerUserID, OwnerDisplayName: f.OwnerDisplayName, TranscriptCount: f.TranscriptCount, CreatedAt: f.CreatedAt.UTC().Format(time.RFC3339), UpdatedAt: f.UpdatedAt.UTC().Format(time.RFC3339)}
}

func folderJobIDs(ctx context.Context, folderID string) ([]string, error) {
	rows, err := Database.QueryContext(ctx, `SELECT transcript_job_id FROM transcript_folder_items WHERE folder_id = $1 ORDER BY created_at DESC`, folderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var jobID string
		if err := rows.Scan(&jobID); err != nil {
			return nil, err
		}
		items = append(items, jobID)
	}
	return items, rows.Err()
}

func folderMemberships(ctx context.Context, scope TranscriptAccessScope, jobIDs []string) map[string]folderRecord {
	if len(jobIDs) == 0 {
		return map[string]folderRecord{}
	}
	placeholders := make([]string, 0, len(jobIDs))
	args := make([]interface{}, 0, len(jobIDs)+1)
	for i, jobID := range jobIDs {
		placeholders = append(placeholders, "$"+strconv.Itoa(i+1))
		args = append(args, jobID)
	}
	where := `i.transcript_job_id IN (` + strings.Join(placeholders, ",") + `)`
	if !scope.IsAdmin {
		args = append(args, scope.UserID)
		where += fmt.Sprintf(" AND f.owner_user_id = $%d", len(args))
	}
	rows, err := Database.QueryContext(ctx, `SELECT i.transcript_job_id, f.id::text, f.owner_user_id::text, u.name, f.name, f.description, 0, f.created_at, f.updated_at FROM transcript_folder_items i JOIN transcript_folders f ON f.id = i.folder_id JOIN users u ON u.id = f.owner_user_id WHERE `+where, args...)
	if err != nil {
		return map[string]folderRecord{}
	}
	defer rows.Close()
	result := map[string]folderRecord{}
	for rows.Next() {
		var jobID string
		var folder folderRecord
		if err := rows.Scan(&jobID, &folder.ID, &folder.OwnerUserID, &folder.OwnerDisplayName, &folder.Name, &folder.Description, &folder.TranscriptCount, &folder.CreatedAt, &folder.UpdatedAt); err == nil {
			result[jobID] = folder
		}
	}
	return result
}

func stringSet(values []string) map[string]struct{} {
	result := map[string]struct{}{}
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func mapFolderSQLError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return newServiceError(ErrCodeFolderNameExists, errors.New("folder name exists"))
	}
	return err
}

func mapFolderItemSQLError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return newServiceError(ErrCodeTranscriptAlreadyInFolder, errors.New("transcript already in folder"))
	}
	return err
}
