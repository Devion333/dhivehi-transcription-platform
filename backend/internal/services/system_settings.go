// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: system_settings.go
// Description: Service layer for system_settings
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

const ErrCodeInvalidSystemSettings = "INVALID_SYSTEM_SETTINGS"

var uploadFormats = []string{"mp3", "wav", "m4a", "aac", "flac", "ogg", "mp4", "mov", "mkv", "webm"}
var downloadFormats = []string{"txt", "json", "srt", "vtt", "pdf"}
var analysisOutputs = []string{"summary", "keywords", "entities", "classification", "english_translation"}
var systemSettingsProviderForTest func(context.Context) (SystemSettings, error)

type SystemSettings struct {
	ID                            int       `json:"id"`
	UploadsEnabled                bool      `json:"uploadsEnabled"`
	MaximumUploadSizeMB           int       `json:"maximumUploadSizeMb"`
	AllowedUploadFormats          []string  `json:"allowedUploadFormats"`
	RequireCategory               bool      `json:"requireCategory"`
	ProcessingEnabled             bool      `json:"processingEnabled"`
	AutomaticProcessing           bool      `json:"automaticProcessing"`
	AutomaticAnalysis             bool      `json:"automaticAnalysis"`
	MaximumProcessingRetries      int       `json:"maximumProcessingRetries"`
	RetryDelayMinutes             int       `json:"retryDelayMinutes"`
	TranscriptEditingEnabled      bool      `json:"transcriptEditingEnabled"`
	SpeakerRenamingEnabled        bool      `json:"speakerRenamingEnabled"`
	TranscriptDownloadsEnabled    bool      `json:"transcriptDownloadsEnabled"`
	EnabledDownloadFormats        []string  `json:"enabledDownloadFormats"`
	RequireApprovalBeforeDownload    bool      `json:"requireApprovalBeforeDownload"`
	RequireFullReviewBeforeDownload  bool      `json:"requireFullReviewBeforeDownload"`
	AnalysisEnabled                  bool      `json:"analysisEnabled"`
	EnabledAnalysisOutputs           []string  `json:"enabledAnalysisOutputs"`
	RequireApprovalBeforeAnalysis    bool      `json:"requireApprovalBeforeAnalysis"`
	RequireFullReviewBeforeAnalysis  bool      `json:"requireFullReviewBeforeAnalysis"`
	UsersCanRerunAnalysis            bool      `json:"usersCanRerunAnalysis"`
	CleanupEnabled                bool      `json:"cleanupEnabled"`
	NotificationRetentionDays     int       `json:"notificationRetentionDays"`
	AuditRetentionDays            int       `json:"auditRetentionDays"`
	SessionDurationMinutes        int       `json:"sessionDurationMinutes"`
	MaximumFailedLoginAttempts    int       `json:"maximumFailedLoginAttempts"`
	AccountLockoutMinutes         int       `json:"accountLockoutMinutes"`
	NotifyTranscriptionComplete   bool      `json:"notifyTranscriptionComplete"`
	NotifyProcessingFailed        bool      `json:"notifyProcessingFailed"`
	NotifyAnalysisComplete        bool      `json:"notifyAnalysisComplete"`
	NotifyTranscriptAssigned      bool      `json:"notifyTranscriptAssigned"`
	NotifyReviewStatusChanged     bool      `json:"notifyReviewStatusChanged"`
	NotifyReviewProgressChanged   bool      `json:"notifyReviewProgressChanged"`
	MaintenanceMode               bool      `json:"maintenanceMode"`
	MaintenanceMessage            string    `json:"maintenanceMessage"`
	AnnouncementEnabled           bool      `json:"announcementEnabled"`
	AnnouncementMessage           string    `json:"announcementMessage"`
	AnnouncementExpiresAt         *string   `json:"announcementExpiresAt"`
	OrganisationName              string    `json:"organisationName"`
	PDFHeaderText                 string    `json:"pdfHeaderText"`
	CreatedAt                     time.Time `json:"-"`
	UpdatedAt                     time.Time `json:"-"`
	UpdatedAtText                 string    `json:"updatedAt"`
	UpdatedBy                     *string   `json:"updatedBy"`
	UpdatedByDisplayName          *string   `json:"updatedByDisplayName"`
}

type PublicSystemSettings struct {
	UploadsEnabled                bool     `json:"uploadsEnabled"`
	MaximumUploadSizeMB           int      `json:"maximumUploadSizeMb"`
	AllowedUploadFormats          []string `json:"allowedUploadFormats"`
	RequireCategory               bool     `json:"requireCategory"`
	ProcessingEnabled             bool     `json:"processingEnabled"`
	AutomaticProcessing           bool     `json:"automaticProcessing"`
	TranscriptEditingEnabled      bool     `json:"transcriptEditingEnabled"`
	SpeakerRenamingEnabled        bool     `json:"speakerRenamingEnabled"`
	TranscriptDownloadsEnabled    bool     `json:"transcriptDownloadsEnabled"`
	EnabledDownloadFormats        []string `json:"enabledDownloadFormats"`
	RequireApprovalBeforeDownload   bool     `json:"requireApprovalBeforeDownload"`
	RequireFullReviewBeforeDownload bool     `json:"requireFullReviewBeforeDownload"`
	AnalysisEnabled                 bool     `json:"analysisEnabled"`
	EnabledAnalysisOutputs          []string `json:"enabledAnalysisOutputs"`
	RequireApprovalBeforeAnalysis   bool     `json:"requireApprovalBeforeAnalysis"`
	RequireFullReviewBeforeAnalysis bool     `json:"requireFullReviewBeforeAnalysis"`
	UsersCanRerunAnalysis           bool     `json:"usersCanRerunAnalysis"`
	MaintenanceMode               bool     `json:"maintenanceMode"`
	MaintenanceMessage            string   `json:"maintenanceMessage"`
	AnnouncementEnabled           bool     `json:"announcementEnabled"`
	AnnouncementMessage           string   `json:"announcementMessage"`
	AnnouncementExpiresAt         *string  `json:"announcementExpiresAt"`
	OrganisationName              string   `json:"organisationName"`
	PDFHeaderText                 string   `json:"pdfHeaderText"`
}

type SettingsChange struct {
	Field string      `json:"field"`
	Old   interface{} `json:"old"`
	New   interface{} `json:"new"`
}

func DefaultSystemSettings() SystemSettings {
	now := time.Now().UTC()
	return SystemSettings{ID: 1, UploadsEnabled: true, MaximumUploadSizeMB: 1024, AllowedUploadFormats: append([]string{}, uploadFormats...), RequireCategory: true, ProcessingEnabled: true, AutomaticProcessing: true, AutomaticAnalysis: false, MaximumProcessingRetries: 3, RetryDelayMinutes: 5, TranscriptEditingEnabled: true, SpeakerRenamingEnabled: true, TranscriptDownloadsEnabled: true, EnabledDownloadFormats: append([]string{}, downloadFormats...), AnalysisEnabled: true, EnabledAnalysisOutputs: append([]string{}, analysisOutputs...), UsersCanRerunAnalysis: true, NotificationRetentionDays: 90, AuditRetentionDays: 365, SessionDurationMinutes: int(defaultSessionLife.Minutes()), MaximumFailedLoginAttempts: loginAttemptLimit, AccountLockoutMinutes: int(loginAttemptWindow.Minutes()), NotifyTranscriptionComplete: true, NotifyProcessingFailed: true, NotifyAnalysisComplete: true, NotifyTranscriptAssigned: true, NotifyReviewStatusChanged: true, NotifyReviewProgressChanged: true, CreatedAt: now, UpdatedAt: now, UpdatedAtText: now.Format(time.RFC3339)}
}

func GetSystemSettings(ctx context.Context) (SystemSettings, error) {
	if systemSettingsProviderForTest != nil {
		return systemSettingsProviderForTest(ctx)
	}
	if Database == nil {
		return DefaultSystemSettings(), nil
	}
	settings, err := getSystemSettings(ctx, Database)
	if err == nil {
		return settings, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return RestoreDefaultSystemSettings(ctx, "")
	}
	return SystemSettings{}, err
}

func GetPublicSystemSettings(ctx context.Context) (PublicSystemSettings, error) {
	settings, err := GetSystemSettings(ctx)
	if err != nil {
		return PublicSystemSettings{}, err
	}
	return publicSystemSettings(settings), nil
}

func UpdateSystemSettings(ctx context.Context, input SystemSettings, updatedBy string) (SystemSettings, []SettingsChange, error) {
	input.ID = 1
	if err := normalizeValidateSettings(&input); err != nil {
		return SystemSettings{}, nil, err
	}
	if Database == nil {
		return SystemSettings{}, nil, newServiceError(ErrCodeInternal, errors.New("database is not initialized"))
	}
	tx, err := Database.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return SystemSettings{}, nil, err
	}
	defer tx.Rollback()
	previous, err := getSystemSettings(ctx, tx)
	if err != nil {
		return SystemSettings{}, nil, err
	}
	changes := diffSettings(previous, input)
	if len(changes) == 0 {
		return previous, changes, tx.Commit()
	}
	if err := writeSystemSettings(ctx, tx, input, updatedBy); err != nil {
		return SystemSettings{}, nil, err
	}
	updated, err := getSystemSettings(ctx, tx)
	if err != nil {
		return SystemSettings{}, nil, err
	}
	if err := tx.Commit(); err != nil {
		return SystemSettings{}, nil, err
	}
	return updated, changes, nil
}

func RestoreDefaultSystemSettings(ctx context.Context, updatedBy string) (SystemSettings, error) {
	defaults := DefaultSystemSettings()
	if Database == nil {
		return defaults, nil
	}
	tx, err := Database.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return SystemSettings{}, err
	}
	defer tx.Rollback()
	if err := writeSystemSettings(ctx, tx, defaults, updatedBy); err != nil {
		return SystemSettings{}, err
	}
	settings, err := getSystemSettings(ctx, tx)
	if err != nil {
		return SystemSettings{}, err
	}
	if err := tx.Commit(); err != nil {
		return SystemSettings{}, err
	}
	return settings, nil
}

type systemSettingsQuerier interface {
	QueryRowContext(context.Context, string, ...interface{}) *sql.Row
}

func getSystemSettings(ctx context.Context, q systemSettingsQuerier) (SystemSettings, error) {
	var s SystemSettings
	var uploadJSON, downloadJSON, outputsJSON []byte
	var expires sql.NullTime
	var maintenance, announcement, org, pdf sql.NullString
	var updatedBy, updatedByName sql.NullString
	err := q.QueryRowContext(ctx, `SELECT s.id, s.uploads_enabled, s.maximum_upload_size_mb, s.allowed_upload_formats, s.require_category, s.processing_enabled, s.automatic_processing, s.automatic_analysis, s.maximum_processing_retries, s.retry_delay_minutes, s.transcript_editing_enabled, s.speaker_renaming_enabled, s.transcript_downloads_enabled, s.enabled_download_formats, s.require_approval_before_download, s.analysis_enabled, s.enabled_analysis_outputs, s.require_approval_before_analysis, s.users_can_rerun_analysis, s.cleanup_enabled, s.notification_retention_days, s.audit_retention_days, s.session_duration_minutes, s.maximum_failed_login_attempts, s.account_lockout_minutes, s.notify_transcription_complete, s.notify_processing_failed, s.notify_analysis_complete, s.notify_transcript_assigned, s.notify_review_status_changed, s.maintenance_mode, s.maintenance_message, s.announcement_enabled, s.announcement_message, s.announcement_expires_at, s.organisation_name, s.pdf_header_text, s.created_at, s.updated_at, s.updated_by::text, u.name FROM system_settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.id = 1`).Scan(&s.ID, &s.UploadsEnabled, &s.MaximumUploadSizeMB, &uploadJSON, &s.RequireCategory, &s.ProcessingEnabled, &s.AutomaticProcessing, &s.AutomaticAnalysis, &s.MaximumProcessingRetries, &s.RetryDelayMinutes, &s.TranscriptEditingEnabled, &s.SpeakerRenamingEnabled, &s.TranscriptDownloadsEnabled, &downloadJSON, &s.RequireApprovalBeforeDownload, &s.AnalysisEnabled, &outputsJSON, &s.RequireApprovalBeforeAnalysis, &s.UsersCanRerunAnalysis, &s.CleanupEnabled, &s.NotificationRetentionDays, &s.AuditRetentionDays, &s.SessionDurationMinutes, &s.MaximumFailedLoginAttempts, &s.AccountLockoutMinutes, &s.NotifyTranscriptionComplete, &s.NotifyProcessingFailed, &s.NotifyAnalysisComplete, &s.NotifyTranscriptAssigned, &s.NotifyReviewStatusChanged, &s.MaintenanceMode, &maintenance, &s.AnnouncementEnabled, &announcement, &expires, &org, &pdf, &s.CreatedAt, &s.UpdatedAt, &updatedBy, &updatedByName)
	if err != nil {
		return SystemSettings{}, err
	}
	_ = json.Unmarshal(uploadJSON, &s.AllowedUploadFormats)
	_ = json.Unmarshal(downloadJSON, &s.EnabledDownloadFormats)
	_ = json.Unmarshal(outputsJSON, &s.EnabledAnalysisOutputs)
	s.MaintenanceMessage = maintenance.String
	s.AnnouncementMessage = announcement.String
	s.OrganisationName = org.String
	s.PDFHeaderText = pdf.String
	if expires.Valid {
		v := expires.Time.UTC().Format(time.RFC3339)
		s.AnnouncementExpiresAt = &v
	}
	if updatedBy.Valid {
		s.UpdatedBy = &updatedBy.String
	}
	if updatedByName.Valid {
		s.UpdatedByDisplayName = &updatedByName.String
	}
	s.UpdatedAtText = s.UpdatedAt.UTC().Format(time.RFC3339)
	return s, nil
}

func writeSystemSettings(ctx context.Context, tx *sql.Tx, s SystemSettings, updatedBy string) error {
	uploadJSON, _ := json.Marshal(s.AllowedUploadFormats)
	downloadJSON, _ := json.Marshal(s.EnabledDownloadFormats)
	outputsJSON, _ := json.Marshal(s.EnabledAnalysisOutputs)
	var expires interface{}
	if s.AnnouncementExpiresAt != nil && strings.TrimSpace(*s.AnnouncementExpiresAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*s.AnnouncementExpiresAt))
		if err != nil {
			return newServiceError(ErrCodeInvalidSystemSettings, err)
		}
		expires = parsed.UTC()
	}
	var updater interface{}
	if strings.TrimSpace(updatedBy) != "" {
		if _, err := uuid.Parse(updatedBy); err != nil {
			return newServiceError(ErrCodeInvalidSystemSettings, errors.New("updatedBy is invalid"))
		}
		updater = updatedBy
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE system_settings SET uploads_enabled=$1, maximum_upload_size_mb=$2, allowed_upload_formats=$3::jsonb, require_reference_number=TRUE, require_category=$4, processing_enabled=$5, automatic_processing=$6, automatic_analysis=$7, maximum_processing_retries=$8, retry_delay_minutes=$9, transcript_editing_enabled=$10, speaker_renaming_enabled=$11, transcript_downloads_enabled=$12, enabled_download_formats=$13::jsonb, require_approval_before_download=$14, analysis_enabled=$15, enabled_analysis_outputs=$16::jsonb, require_approval_before_analysis=$17, users_can_rerun_analysis=$18, cleanup_enabled=$19, notification_retention_days=$20, audit_retention_days=$21, session_duration_minutes=$22, maximum_failed_login_attempts=$23, account_lockout_minutes=$24, notify_transcription_complete=$25, notify_processing_failed=$26, notify_analysis_complete=$27, notify_transcript_assigned=$28, notify_review_status_changed=$29, maintenance_mode=$30, maintenance_message=$31, announcement_enabled=$32, announcement_message=$33, announcement_expires_at=$34, organisation_name=$35, pdf_header_text=$36, updated_at=NOW(), updated_by=$37 WHERE id=1`, s.UploadsEnabled, s.MaximumUploadSizeMB, string(uploadJSON), s.RequireCategory, s.ProcessingEnabled, s.AutomaticProcessing, s.AutomaticAnalysis, s.MaximumProcessingRetries, s.RetryDelayMinutes, s.TranscriptEditingEnabled, s.SpeakerRenamingEnabled, s.TranscriptDownloadsEnabled, string(downloadJSON), s.RequireApprovalBeforeDownload, s.RequireFullReviewBeforeDownload, s.AnalysisEnabled, string(outputsJSON), s.RequireApprovalBeforeAnalysis, s.RequireFullReviewBeforeAnalysis, s.UsersCanRerunAnalysis, s.CleanupEnabled, s.NotificationRetentionDays, s.AuditRetentionDays, s.SessionDurationMinutes, s.MaximumFailedLoginAttempts, s.AccountLockoutMinutes, s.NotifyTranscriptionComplete, s.NotifyProcessingFailed, s.NotifyAnalysisComplete, s.NotifyTranscriptAssigned, s.NotifyReviewStatusChanged, s.NotifyReviewProgressChanged, s.MaintenanceMode, nullableSettingString(s.MaintenanceMessage), s.AnnouncementEnabled, nullableSettingString(s.AnnouncementMessage), expires, nullableSettingString(s.OrganisationName), nullableSettingString(s.PDFHeaderText), updater)
	return err
}

func normalizeValidateSettings(s *SystemSettings) error {
	var err error
	s.AllowedUploadFormats, err = normalizeList(s.AllowedUploadFormats, uploadFormats, "upload format")
	if err != nil {
		return err
	}
	s.EnabledDownloadFormats, err = normalizeList(s.EnabledDownloadFormats, downloadFormats, "download format")
	if err != nil {
		return err
	}
	s.EnabledAnalysisOutputs, err = normalizeList(s.EnabledAnalysisOutputs, analysisOutputs, "analysis output")
	if err != nil {
		return err
	}
	if !between(s.MaximumUploadSizeMB, 1, 10240) || !between(s.MaximumProcessingRetries, 0, 10) || !between(s.RetryDelayMinutes, 1, 1440) || !between(s.SessionDurationMinutes, 15, 10080) || !between(s.MaximumFailedLoginAttempts, 1, 20) || !between(s.AccountLockoutMinutes, 1, 1440) {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("settings limits are out of range"))
	}
	for _, days := range []int{s.NotificationRetentionDays, s.AuditRetentionDays} {
		if days != 0 && !between(days, 1, 3650) {
			return newServiceError(ErrCodeInvalidSystemSettings, errors.New("retention days must be 0 or 1-3650"))
		}
	}
	if s.UploadsEnabled && len(s.AllowedUploadFormats) == 0 {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("at least one upload format is required"))
	}
	if s.TranscriptDownloadsEnabled && len(s.EnabledDownloadFormats) == 0 {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("at least one download format is required"))
	}
	if s.AnalysisEnabled && len(s.EnabledAnalysisOutputs) == 0 {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("at least one analysis output is required"))
	}
	s.MaintenanceMessage = strings.TrimSpace(s.MaintenanceMessage)
	s.AnnouncementMessage = strings.TrimSpace(s.AnnouncementMessage)
	s.OrganisationName = strings.TrimSpace(s.OrganisationName)
	s.PDFHeaderText = strings.TrimSpace(s.PDFHeaderText)
	if len([]rune(s.MaintenanceMessage)) > 500 || len([]rune(s.AnnouncementMessage)) > 500 || len([]rune(s.OrganisationName)) > 150 || len([]rune(s.PDFHeaderText)) > 250 {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("message text is too long"))
	}
	if s.MaintenanceMode && s.MaintenanceMessage == "" {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("maintenance message is required"))
	}
	if s.AnnouncementEnabled && s.AnnouncementMessage == "" {
		return newServiceError(ErrCodeInvalidSystemSettings, errors.New("announcement message is required"))
	}
	if s.AnnouncementExpiresAt != nil && strings.TrimSpace(*s.AnnouncementExpiresAt) != "" {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*s.AnnouncementExpiresAt))
		if err != nil || parsed.Before(time.Now().UTC()) {
			return newServiceError(ErrCodeInvalidSystemSettings, errors.New("announcement expiry must be a future RFC3339 timestamp"))
		}
		v := parsed.UTC().Format(time.RFC3339)
		s.AnnouncementExpiresAt = &v
	}
	return nil
}

func normalizeList(values, allowed []string, label string) ([]string, error) {
	allowedSet := map[string]struct{}{}
	for _, item := range allowed {
		allowedSet[item] = struct{}{}
	}
	seen := map[string]struct{}{}
	result := []string{}
	for _, item := range values {
		item = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(item, ".")))
		if item == "" {
			return nil, newServiceError(ErrCodeInvalidSystemSettings, fmt.Errorf("%s cannot be empty", label))
		}
		if _, ok := allowedSet[item]; !ok {
			return nil, newServiceError(ErrCodeInvalidSystemSettings, fmt.Errorf("unsupported %s: %s", label, item))
		}
		if _, ok := seen[item]; ok {
			return nil, newServiceError(ErrCodeInvalidSystemSettings, fmt.Errorf("duplicate %s: %s", label, item))
		}
		seen[item] = struct{}{}
		result = append(result, item)
	}
	sort.Strings(result)
	return result, nil
}

func publicSystemSettings(s SystemSettings) PublicSystemSettings {
	if s.AnnouncementExpiresAt != nil {
		if expiresAt, err := time.Parse(time.RFC3339, strings.TrimSpace(*s.AnnouncementExpiresAt)); err == nil && !expiresAt.After(time.Now().UTC()) {
			s.AnnouncementEnabled = false
			s.AnnouncementMessage = ""
			s.AnnouncementExpiresAt = nil
		}
	}
	return PublicSystemSettings{UploadsEnabled: s.UploadsEnabled, MaximumUploadSizeMB: s.MaximumUploadSizeMB, AllowedUploadFormats: s.AllowedUploadFormats, RequireCategory: s.RequireCategory, ProcessingEnabled: s.ProcessingEnabled, AutomaticProcessing: s.AutomaticProcessing, TranscriptEditingEnabled: s.TranscriptEditingEnabled, SpeakerRenamingEnabled: s.SpeakerRenamingEnabled, TranscriptDownloadsEnabled: s.TranscriptDownloadsEnabled, EnabledDownloadFormats: s.EnabledDownloadFormats, RequireApprovalBeforeDownload: s.RequireApprovalBeforeDownload,
	RequireFullReviewBeforeDownload: s.RequireFullReviewBeforeDownload, AnalysisEnabled: s.AnalysisEnabled, EnabledAnalysisOutputs: s.EnabledAnalysisOutputs, RequireApprovalBeforeAnalysis: s.RequireApprovalBeforeAnalysis,
	RequireFullReviewBeforeAnalysis: s.RequireFullReviewBeforeAnalysis, UsersCanRerunAnalysis: s.UsersCanRerunAnalysis, MaintenanceMode: s.MaintenanceMode, MaintenanceMessage: s.MaintenanceMessage, AnnouncementEnabled: s.AnnouncementEnabled, AnnouncementMessage: s.AnnouncementMessage, AnnouncementExpiresAt: s.AnnouncementExpiresAt, OrganisationName: s.OrganisationName, PDFHeaderText: s.PDFHeaderText}
}

func SetSystemSettingsProviderForTest(provider func(context.Context) (SystemSettings, error)) func() {
	previous := systemSettingsProviderForTest
	systemSettingsProviderForTest = provider
	return func() { systemSettingsProviderForTest = previous }
}

func diffSettings(old, next SystemSettings) []SettingsChange {
	oldMap, nextMap := map[string]interface{}{}, map[string]interface{}{}
	oldBytes, _ := json.Marshal(old)
	nextBytes, _ := json.Marshal(next)
	_ = json.Unmarshal(oldBytes, &oldMap)
	_ = json.Unmarshal(nextBytes, &nextMap)
	delete(oldMap, "id")
	delete(oldMap, "createdAt")
	delete(oldMap, "updatedAt")
	delete(oldMap, "updatedBy")
	delete(oldMap, "updatedByDisplayName")
	delete(nextMap, "id")
	delete(nextMap, "createdAt")
	delete(nextMap, "updatedAt")
	delete(nextMap, "updatedBy")
	delete(nextMap, "updatedByDisplayName")
	changes := []SettingsChange{}
	for key, nextValue := range nextMap {
		oldJSON, _ := json.Marshal(oldMap[key])
		nextJSON, _ := json.Marshal(nextValue)
		if string(oldJSON) != string(nextJSON) {
			changes = append(changes, SettingsChange{Field: key, Old: oldMap[key], New: nextValue})
		}
	}
	sort.Slice(changes, func(i, j int) bool { return changes[i].Field < changes[j].Field })
	return changes
}

func nullableSettingString(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return strings.TrimSpace(value)
}

func between(value, min, max int) bool { return value >= min && value <= max }

func UploadFormatAllowed(filename string, settings SystemSettings) bool {
	filename = strings.TrimSpace(filename)
	dot := strings.LastIndex(filename, ".")
	if dot < 0 || dot == len(filename)-1 {
		return false
	}
	ext := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(filename[dot+1:]), "."))
	for _, item := range settings.AllowedUploadFormats {
		if item == ext {
			return true
		}
	}
	return false
}

func ContainsString(values []string, value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}
