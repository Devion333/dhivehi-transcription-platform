package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/google/uuid"
)

const (
	AuditOutcomeSuccess       = "success"
	AuditOutcomeFailure       = "failure"
	maxAuditPageSize          = 100
	maxAuditMetaBytes         = 4096
	maxUserAgentLength        = 256
	DefaultAuditRetentionDays = 365
	MinAuditRetentionDays     = 30
	MaxAuditRetentionDays     = 3650
	DefaultAuditCleanupBatch  = 500
)

type AuditCleanupResult struct {
	Cutoff        time.Time
	EligibleCount int
	DeletedCount  int
	DryRun        bool
	RetentionDays int
	BatchSize     int
}

type AuditEventInput struct {
	Actor        *dtos.AuthUser
	Action       string
	Category     string
	ResourceType string
	ResourceID   string
	Outcome      string
	IPAddress    string
	UserAgent    string
	Metadata     map[string]interface{}
}

type AuditFilters struct {
	Page         int
	PageSize     int
	Search       string
	Category     string
	Action       string
	Outcome      string
	ActorUserID  string
	ResourceType string
	ResourceID   string
	DateFrom     string
	DateTo       string
}

type AuditEventRecord struct {
	ID           string
	ActorUserID  sql.NullString
	ActorName    sql.NullString
	ActorEmail   sql.NullString
	ActorRole    sql.NullString
	Action       string
	Category     string
	ResourceType sql.NullString
	ResourceID   sql.NullString
	Outcome      string
	IPAddress    sql.NullString
	UserAgent    sql.NullString
	MetadataJSON []byte
	CreatedAt    time.Time
}

var actionCategories = map[string]string{
	"auth.login_succeeded":       "authentication",
	"auth.login_failed":          "authentication",
	"auth.logout":                "authentication",
	"password_change_succeeded":  "authentication",
	"password_change_failed":     "authentication",
	"admin.user_created":         "user_management",
	"admin.user_updated":         "user_management",
	"admin.user_activated":       "user_management",
	"admin.user_deactivated":     "user_management",
	"admin.password_reset":       "user_management",
	"transcript.uploaded":        "transcript",
	"transcript.viewed":          "transcript",
	"transcript.segment_updated": "transcript",
	"analysis.started":           "analysis",
	"analysis.completed":         "analysis",
	"analysis.failed":            "analysis",
	"search.executed":            "search",
	"export.pdf_generated":       "export",
	"export.pdf_failed":          "export",
	"admin.job_retry_requested":  "job_management",
	"admin.job_retry_succeeded":  "job_management",
	"admin.job_retry_failed":     "job_management",
}

var auditMetadataAllowlist = map[string]map[string]struct{}{
	"auth.login_failed":          keys("loginIdentifierHash"),
	"password_change_succeeded":  keys("otherSessionsRevoked", "currentSessionPreserved"),
	"password_change_failed":     keys("reasonCode"),
	"admin.user_created":         keys("targetUserId", "targetRole"),
	"admin.user_updated":         keys("targetUserId", "changedFields", "previousRole", "newRole"),
	"admin.user_activated":       keys("targetUserId", "previousActiveState", "newActiveState"),
	"admin.user_deactivated":     keys("targetUserId", "previousActiveState", "newActiveState", "sessionsRevoked"),
	"admin.password_reset":       keys("targetUserId", "sessionsRevoked"),
	"transcript.uploaded":        keys("jobId", "filename", "category", "referenceNumber", "requestedSpeakers"),
	"transcript.viewed":          keys("jobId"),
	"transcript.segment_updated": keys("jobId", "segmentId", "segmentIndex", "changedFields"),
	"analysis.started":           keys("analysisStatus", "provider"),
	"analysis.completed":         keys("analysisStatus", "durationMs", "provider"),
	"analysis.failed":            keys("analysisStatus", "durationMs", "provider"),
	"search.executed":            keys("queryLength", "page", "pageSize", "statusFilter", "categoryFilter", "resultCount"),
	"export.pdf_generated":       keys("jobId", "format", "includeAnalysis"),
	"export.pdf_failed":          keys("jobId", "format", "includeAnalysis"),
	"admin.job_retry_requested":  keys("jobId", "stage", "previousStatus", "newStatus", "retryCount", "failureCode"),
	"admin.job_retry_succeeded":  keys("jobId", "stage", "previousStatus", "newStatus", "retryCount", "failureCode"),
	"admin.job_retry_failed":     keys("jobId", "stage", "previousStatus", "newStatus", "retryCount", "failureCode"),
}

func keys(values ...string) map[string]struct{} {
	result := map[string]struct{}{}
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func RecordAuditEvent(ctx context.Context, input AuditEventInput) error {
	if Database == nil {
		return newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	if err := validateAuditEvent(input); err != nil {
		return err
	}
	metadata, err := SanitizeAuditMetadata(input.Action, input.Metadata)
	if err != nil {
		return err
	}
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	if len(metadataJSON) > maxAuditMetaBytes {
		return newServiceError(ErrCodeInvalidAuditEvent, errors.New("audit metadata too large"))
	}

	var actorID, actorName, actorEmail, actorRole interface{}
	if input.Actor != nil {
		actorID = input.Actor.ID
		actorName = input.Actor.Name
		actorEmail = input.Actor.Email
		actorRole = input.Actor.Role
	}
	_, err = Database.ExecContext(ctx, `INSERT INTO audit_events (id, actor_user_id, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`, uuid.NewString(), actorID, actorName, actorEmail, actorRole, input.Action, input.Category, nullIfEmpty(input.ResourceType), nullIfEmpty(input.ResourceID), input.Outcome, nullIfEmpty(input.IPAddress), nullIfEmpty(truncateString(input.UserAgent, maxUserAgentLength)), string(metadataJSON))
	return err
}

func SanitizeAuditMetadata(action string, metadata map[string]interface{}) (map[string]interface{}, error) {
	allowed := auditMetadataAllowlist[action]
	if allowed == nil || len(metadata) == 0 {
		return map[string]interface{}{}, nil
	}
	result := map[string]interface{}{}
	for key, value := range metadata {
		if _, ok := allowed[key]; !ok || isSensitiveAuditKey(key) {
			continue
		}
		result[key] = sanitizeAuditValue(value)
	}
	return result, nil
}

func ListAuditEvents(ctx context.Context, filters AuditFilters) (dtos.AuditListResponse, error) {
	filters = normalizeAuditFilters(filters)
	where, args, err := auditWhere(filters)
	if err != nil {
		return dtos.AuditListResponse{}, err
	}
	var total int
	if err := Database.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_events`+where, args...).Scan(&total); err != nil {
		return dtos.AuditListResponse{}, err
	}
	offset := (filters.Page - 1) * filters.PageSize
	queryArgs := append(append([]interface{}{}, args...), filters.PageSize, offset)
	query := fmt.Sprintf(`SELECT id, actor_user_id::text, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json, created_at FROM audit_events%s ORDER BY created_at DESC, id DESC LIMIT $%d OFFSET $%d`, where, len(args)+1, len(args)+2)
	rows, err := Database.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return dtos.AuditListResponse{}, err
	}
	defer rows.Close()
	items := []dtos.AuditEventSummary{}
	for rows.Next() {
		record, err := scanAuditEvent(rows)
		if err != nil {
			return dtos.AuditListResponse{}, err
		}
		items = append(items, auditSummaryDTO(record))
	}
	if err := rows.Err(); err != nil {
		return dtos.AuditListResponse{}, err
	}
	totalPages := 0
	if total > 0 {
		totalPages = (total + filters.PageSize - 1) / filters.PageSize
	}
	return dtos.AuditListResponse{Items: items, Pagination: dtos.Pagination{Page: filters.Page, PageSize: filters.PageSize, Total: total, TotalPages: totalPages, HasNextPage: filters.Page < totalPages}}, nil
}

func GetAuditEvent(ctx context.Context, eventID string) (dtos.AuditEventDetail, error) {
	if _, err := uuid.Parse(eventID); err != nil {
		return dtos.AuditEventDetail{}, newServiceError(ErrCodeAuditNotFound, errors.New("audit event not found"))
	}
	row := Database.QueryRowContext(ctx, `SELECT id, actor_user_id::text, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json, created_at FROM audit_events WHERE id = $1`, eventID)
	record, err := scanAuditEvent(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return dtos.AuditEventDetail{}, newServiceError(ErrCodeAuditNotFound, errors.New("audit event not found"))
		}
		return dtos.AuditEventDetail{}, err
	}
	return auditDetailDTO(record), nil
}

func AuditRetentionDaysFromEnv() (int, error) {
	return ParseAuditRetentionDays(os.Getenv("AUDIT_RETENTION_DAYS"))
}

func ParseAuditRetentionDays(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return DefaultAuditRetentionDays, nil
	}
	days, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("AUDIT_RETENTION_DAYS must be an integer")
	}
	if days < MinAuditRetentionDays || days > MaxAuditRetentionDays {
		return 0, fmt.Errorf("AUDIT_RETENTION_DAYS must be between %d and %d", MinAuditRetentionDays, MaxAuditRetentionDays)
	}
	return days, nil
}

func DeleteAuditEventsBefore(ctx context.Context, cutoff time.Time, batchSize int, dryRun bool, retentionDays int) (AuditCleanupResult, error) {
	if batchSize < 1 {
		batchSize = DefaultAuditCleanupBatch
	}
	cutoff = cutoff.UTC()
	result := AuditCleanupResult{Cutoff: cutoff, DryRun: dryRun, RetentionDays: retentionDays, BatchSize: batchSize}
	if err := Database.QueryRowContext(ctx, `SELECT COUNT(*) FROM audit_events WHERE created_at < $1`, cutoff).Scan(&result.EligibleCount); err != nil {
		return AuditCleanupResult{}, err
	}
	if dryRun || result.EligibleCount == 0 {
		return result, nil
	}
	for {
		exec, err := Database.ExecContext(ctx, `WITH doomed AS (SELECT id FROM audit_events WHERE created_at < $1 ORDER BY created_at ASC, id ASC LIMIT $2 FOR UPDATE SKIP LOCKED) DELETE FROM audit_events WHERE id IN (SELECT id FROM doomed)`, cutoff, batchSize)
		if err != nil {
			return AuditCleanupResult{}, err
		}
		deleted, err := exec.RowsAffected()
		if err != nil {
			return AuditCleanupResult{}, err
		}
		result.DeletedCount += int(deleted)
		if deleted < int64(batchSize) {
			break
		}
	}
	return result, nil
}

func AuditRetentionCutoff(now time.Time, retentionDays int) time.Time {
	return now.UTC().AddDate(0, 0, -retentionDays)
}

func validateAuditEvent(input AuditEventInput) error {
	if input.Outcome != AuditOutcomeSuccess && input.Outcome != AuditOutcomeFailure {
		return newServiceError(ErrCodeInvalidAuditEvent, errors.New("invalid audit outcome"))
	}
	category, ok := actionCategories[input.Action]
	if !ok || category != input.Category {
		return newServiceError(ErrCodeInvalidAuditEvent, errors.New("invalid audit action"))
	}
	return nil
}

func HashAuditIdentifier(value string) string {
	sum := sha256.Sum256([]byte(NormalizeEmail(value)))
	return hex.EncodeToString(sum[:])
}

func normalizeAuditFilters(filters AuditFilters) AuditFilters {
	if filters.Page < 1 {
		filters.Page = 1
	}
	if filters.PageSize < 1 {
		filters.PageSize = 50
	}
	if filters.PageSize > maxAuditPageSize {
		filters.PageSize = maxAuditPageSize
	}
	filters.Search = strings.TrimSpace(filters.Search)
	filters.Category = strings.TrimSpace(filters.Category)
	filters.Action = strings.TrimSpace(filters.Action)
	filters.Outcome = strings.TrimSpace(filters.Outcome)
	filters.ActorUserID = strings.TrimSpace(filters.ActorUserID)
	filters.ResourceType = strings.TrimSpace(filters.ResourceType)
	filters.ResourceID = strings.TrimSpace(filters.ResourceID)
	filters.DateFrom = strings.TrimSpace(filters.DateFrom)
	filters.DateTo = strings.TrimSpace(filters.DateTo)
	return filters
}

func auditWhere(filters AuditFilters) (string, []interface{}, error) {
	clauses := []string{}
	args := []interface{}{}
	add := func(clause string, value interface{}) {
		args = append(args, value)
		clauses = append(clauses, fmt.Sprintf(clause, len(args)))
	}
	if filters.Search != "" {
		args = append(args, "%"+strings.ToLower(filters.Search)+"%")
		placeholder := len(args)
		clauses = append(clauses, fmt.Sprintf(`(LOWER(actor_name) LIKE $%d OR LOWER(actor_email) LIKE $%d OR LOWER(action) LIKE $%d OR LOWER(resource_id) LIKE $%d)`, placeholder, placeholder, placeholder, placeholder))
	}
	if filters.Category != "" {
		if !validAuditCategory(filters.Category) {
			return "", nil, newServiceError(ErrCodeInvalidAuditFilter, errors.New("invalid category"))
		}
		add(`category = $%d`, filters.Category)
	}
	if filters.Action != "" {
		if _, ok := actionCategories[filters.Action]; !ok {
			return "", nil, newServiceError(ErrCodeInvalidAuditFilter, errors.New("invalid action"))
		}
		add(`action = $%d`, filters.Action)
	}
	if filters.Outcome != "" {
		if filters.Outcome != AuditOutcomeSuccess && filters.Outcome != AuditOutcomeFailure {
			return "", nil, newServiceError(ErrCodeInvalidAuditFilter, errors.New("invalid outcome"))
		}
		add(`outcome = $%d`, filters.Outcome)
	}
	if filters.ActorUserID != "" {
		if _, err := uuid.Parse(filters.ActorUserID); err != nil {
			return "", nil, newServiceError(ErrCodeInvalidAuditFilter, errors.New("invalid actor"))
		}
		add(`actor_user_id = $%d`, filters.ActorUserID)
	}
	if filters.ResourceType != "" {
		add(`resource_type = $%d`, filters.ResourceType)
	}
	if filters.ResourceID != "" {
		add(`resource_id = $%d`, filters.ResourceID)
	}
	if filters.DateFrom != "" {
		from, err := time.Parse(time.RFC3339, filters.DateFrom)
		if err != nil {
			return "", nil, newServiceError(ErrCodeInvalidAuditFilter, errors.New("invalid dateFrom"))
		}
		add(`created_at >= $%d`, from)
	}
	if filters.DateTo != "" {
		to, err := time.Parse(time.RFC3339, filters.DateTo)
		if err != nil {
			return "", nil, newServiceError(ErrCodeInvalidAuditFilter, errors.New("invalid dateTo"))
		}
		add(`created_at <= $%d`, to)
	}
	if len(clauses) == 0 {
		return "", args, nil
	}
	return " WHERE " + strings.Join(clauses, " AND "), args, nil
}

func validAuditCategory(category string) bool {
	for _, value := range actionCategories {
		if value == category {
			return true
		}
	}
	return false
}

type auditScanner interface {
	Scan(dest ...interface{}) error
}

func scanAuditEvent(scanner auditScanner) (AuditEventRecord, error) {
	var record AuditEventRecord
	err := scanner.Scan(&record.ID, &record.ActorUserID, &record.ActorName, &record.ActorEmail, &record.ActorRole, &record.Action, &record.Category, &record.ResourceType, &record.ResourceID, &record.Outcome, &record.IPAddress, &record.UserAgent, &record.MetadataJSON, &record.CreatedAt)
	return record, err
}

func auditSummaryDTO(record AuditEventRecord) dtos.AuditEventSummary {
	return dtos.AuditEventSummary{ID: record.ID, CreatedAt: record.CreatedAt.UTC().Format(time.RFC3339), Actor: auditActorDTO(record), Action: record.Action, Category: record.Category, Outcome: record.Outcome, ResourceType: nullString(record.ResourceType), ResourceID: nullString(record.ResourceID), IPAddress: nullString(record.IPAddress)}
}

func auditDetailDTO(record AuditEventRecord) dtos.AuditEventDetail {
	metadata := map[string]interface{}{}
	_ = json.Unmarshal(record.MetadataJSON, &metadata)
	return dtos.AuditEventDetail{AuditEventSummary: auditSummaryDTO(record), UserAgent: nullString(record.UserAgent), Metadata: metadata}
}

func auditActorDTO(record AuditEventRecord) *dtos.AuditActor {
	if !record.ActorUserID.Valid {
		return nil
	}
	return &dtos.AuditActor{ID: record.ActorUserID.String, Name: nullString(record.ActorName), Email: nullString(record.ActorEmail), Role: nullString(record.ActorRole)}
}

func nullString(value sql.NullString) string {
	if value.Valid {
		return value.String
	}
	return ""
}

func nullIfEmpty(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func truncateString(value string, max int) string {
	value = strings.TrimSpace(value)
	if len([]rune(value)) <= max {
		return value
	}
	return string([]rune(value)[:max])
}

func isSensitiveAuditKey(key string) bool {
	lower := strings.ToLower(key)
	for _, blocked := range []string{"password", "token", "cookie", "authorization", "transcripttext", "summary", "translation", "apikey", "connectionstring"} {
		if strings.Contains(lower, blocked) {
			return true
		}
	}
	return false
}

func sanitizeAuditValue(value interface{}) interface{} {
	switch typed := value.(type) {
	case string:
		return truncateString(typed, 256)
	case []string:
		if len(typed) > 20 {
			typed = typed[:20]
		}
		return typed
	case []interface{}:
		if len(typed) > 20 {
			typed = typed[:20]
		}
		return typed
	case bool, int, int64, float64:
		return typed
	case map[string]interface{}:
		limited := map[string]interface{}{}
		for key, nested := range typed {
			if !isSensitiveAuditKey(key) {
				limited[key] = sanitizeAuditValue(nested)
			}
		}
		return limited
	default:
		return fmt.Sprint(typed)
	}
}
