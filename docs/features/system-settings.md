# System Settings

Date: 2026-07-19

## Summary

System Settings provides an admin-only control plane for runtime policy that previously lived in code or environment defaults. Settings are stored in PostgreSQL in a single-row `system_settings` table and are exposed through admin and public APIs.

## Admin UI

Route: `/Admin/Settings`

Administrators can manage:

- Upload availability, size limit, allowed formats, and category requirement. Reference number is mandatory system-wide and is not configurable.
- Processing and analysis switches, retry limits, and rerun policy.
- Transcript editing, speaker renaming, download availability, and approval-before-download policy.
- Security limits, audit/notification retention values in days, and notification switches.
- Maintenance banner, announcement banner, organisation name, and PDF header text.

The UI uses a compact settings-category menu with one visible section at a time: Uploads, Processing, Transcripts and analysis, Security, Notifications, Retention, and Maintenance. One shared form state is used across sections, so unsaved changes persist while switching categories. Desktop uses a fixed 280px category menu, expanding to 300px at `xl`, beside the selected settings content. `/Admin/Settings` opts the application shell `main` into `overflow-hidden`; the route wrapper uses `box-border h-full min-h-0 overflow-hidden`; and the only settings scroll owner is the selected-content panel with `scrollbar-hidden overflow-y-auto overscroll-contain`. The page header, Save changes, Restore defaults, status messages, mobile selector, and desktop category menu remain stationary. Mobile uses a full-width category selector instead of the vertical menu. Save responses include changed field names; full change details are written to audit metadata after sanitization.

After successful Save or Restore defaults, the frontend refreshes the shared public settings cache so maintenance and announcement banners update immediately without navigation or reload.

## APIs

Public read-only settings:

- `GET /api/settings/public`

Admin settings:

- `GET /api/admin/settings`
- `PUT /api/admin/settings`
- `POST /api/admin/settings/restore-defaults`

Admin routes require an authenticated admin user. The public endpoint excludes operational secrets and sensitive infrastructure configuration.

## Runtime Enforcement

Implemented enforcement points:

- Uploads reject disabled uploads, files above `maximumUploadSizeMb`, unsupported extensions, missing reference numbers, and missing required category metadata.
- Upload enqueue respects `processingEnabled` and `automaticProcessing`.
- Transcript segment edits respect `transcriptEditingEnabled`.
- Speaker rename respects `speakerRenamingEnabled`.
- Downloads respect `transcriptDownloadsEnabled`, `enabledDownloadFormats`, and `requireApprovalBeforeDownload`.
- Analysis trigger respects `analysisEnabled`, `requireApprovalBeforeAnalysis`, and `usersCanRerunAnalysis`.
- Notification creation respects configured notification switches.
- Maintenance mode blocks non-admin protected backend requests and the frontend app shell displays the maintenance banner.
- The frontend app shell displays non-expired announcement banners from public settings.
- The notification bell popover uses a bounded 380px panel with fixed header/footer and a vertically scrolling list. Long notification text is contained with wrapping/truncation.
- Daily maintenance cleanup deletes expired audit events and notifications according to the configured retention days.

Stored but not currently enforced at runtime:

- `automaticAnalysis`
- `enabledAnalysisOutputs`
- `maximumProcessingRetries`
- `retryDelayMinutes`
- Session duration, failed login limit, and account lockout fields
- `notifyReviewStatusChanged`

## Validation

Backend validation rejects unsupported or duplicate upload/download/analysis values. Numeric limits are range-checked. Maintenance and announcement messages are length-limited, and enabled banners require message text.

Supported default lists:

- Upload formats: `mp3`, `wav`, `m4a`, `aac`, `flac`, `ogg`, `mp4`, `mov`, `mkv`, `webm`
- Download formats: `txt`, `json`, `srt`, `vtt`, `pdf`
- Analysis outputs: `summary`, `keywords`, `entities`, `classification`, `english_translation`

## Auditing

Settings changes create audit events:

- `system_settings_updated`
- `system_settings_update_failed`
- `system_settings_restored`
- `system_settings_restore_failed`

Allowed metadata includes `changedFields` and sanitized `changes` only.

## Settings Enforcement Matrix

| Setting | Default | Stored | Runtime enforced | Enforcement location | Limitations |
| --- | --- | --- | --- | --- | --- |
| `uploadsEnabled` | `true` | Yes | Yes | `backend/internal/handlers/upload.go`, Upload page | Frontend guidance is advisory; backend is authoritative. |
| `maximumUploadSizeMb` | `1024` | Yes | Yes | `backend/internal/handlers/upload.go`, Upload page | Checked before backend processing; reverse proxy/container limits may still apply separately. |
| `allowedUploadFormats` | `mp3,wav,m4a,aac,flac,ogg,mp4,mov,mkv,webm` | Yes | Yes | `backend/internal/handlers/upload.go`, Upload page | Extension-based validation only. |
| Reference number requirement | Always required | Legacy column may remain | Yes | `backend/internal/handlers/upload.go`, Upload page | `require_reference_number=false` in legacy rows is ignored. Remove the column in a later migration when safe. |
| `requireCategory` | `true` | Yes | Yes | `backend/internal/handlers/upload.go`, Upload page | Applies to new uploads only. |
| `processingEnabled` | `true` | Yes | Yes | `backend/internal/handlers/upload.go` | Prevents queue enqueue after upload metadata creation; no worker-side global stop switch. |
| `automaticProcessing` | `true` | Yes | Yes | `backend/internal/handlers/upload.go` | Disables automatic enqueue; no manual processing action exists yet. |
| `automaticAnalysis` | `false` | Yes | No | None | Stored only; analysis still requires explicit trigger. |
| `maximumProcessingRetries` | `3` | Yes | No | None | Stored only; retry code still uses existing retry behavior. |
| `retryDelayMinutes` | `5` | Yes | No | None | Stored only; queues do not delay retry from this setting. |
| `transcriptEditingEnabled` | `true` | Yes | Yes | `backend/internal/handlers/api.go` | Controls segment text edits only. |
| `speakerRenamingEnabled` | `true` | Yes | Yes | `backend/internal/handlers/api.go` | Controls speaker display-name updates. |
| `transcriptDownloadsEnabled` | `true` | Yes | Yes | `backend/internal/handlers/api.go` | Backend blocks all download formats when disabled. |
| `enabledDownloadFormats` | `txt,json,srt,vtt,pdf` | Yes | Yes | `backend/internal/handlers/api.go` | Backend checks requested format before building downloads. |
| `requireApprovalBeforeDownload` | `false` | Yes | Yes | `backend/internal/handlers/api.go` | Uses transcript review status stored in Qdrant payload. |
| `analysisEnabled` | `true` | Yes | Yes | `backend/internal/handlers/analyse.go` | Blocks explicit analysis trigger only. |
| `enabledAnalysisOutputs` | `summary,keywords,entities,classification,english_translation` | Yes | No | None | Stored and validated only; analysis worker still returns all outputs. |
| `requireApprovalBeforeAnalysis` | `false` | Yes | Yes | `backend/internal/handlers/analyse.go` | Uses transcript review status stored in Qdrant payload. |
| `usersCanRerunAnalysis` | `true` | Yes | Yes | `backend/internal/handlers/analyse.go` | Blocks rerun only when stored analysis status is complete. |
| `cleanupEnabled` | `false` | Yes | No | None | Deprecated compatibility field; daily cleanup is controlled by the audit and notification retention values. |
| `notificationRetentionDays` | `90` | Yes | Yes | `backend/internal/services/maintenance.go` | Unit is days. `0` retains notifications indefinitely. Expired read and unread notifications are deleted once per day. |
| `auditRetentionDays` | `365` | Yes | Yes | `backend/internal/services/maintenance.go` | Unit is days. `0` retains audit events indefinitely. Expired audit events are deleted once per day. |
| `sessionDurationMinutes` | `720` | Yes | No | None | Stored only; session lifetime still uses `SESSION_LIFETIME`/default. |
| `maximumFailedLoginAttempts` | `5` | Yes | No | None | Stored only; login limiter still uses code constant. |
| `accountLockoutMinutes` | `15` | Yes | No | None | Stored only; login limiter still uses code constant. |
| `notifyTranscriptionComplete` | `true` | Yes | Yes | `backend/internal/services/notifications.go` | Suppresses notification creation; does not affect processing. |
| `notifyProcessingFailed` | `true` | Yes | Yes | `backend/internal/services/notifications.go` | Suppresses processing-failed notifications. |
| `notifyAnalysisComplete` | `true` | Yes | Yes | `backend/internal/services/notifications.go` | Applies to analysis completed and failed notification types. |
| `notifyTranscriptAssigned` | `true` | Yes | Yes | `backend/internal/services/notifications.go` | Suppresses assignment notifications. |
| `notifyReviewStatusChanged` | `true` | Yes | No | None | Stored only; no review-status notification generator exists. |
| `maintenanceMode` | `false` | Yes | Yes | `backend/internal/handlers/auth.go`, app shell, mutation controls | Backend allows safe reads for standard users and blocks mutations with `maintenance_mode`; frontend displays a banner and disables key mutation controls. |
| `maintenanceMessage` | empty | Yes | Yes | `backend/internal/handlers/auth.go`, app shell | Required when maintenance mode is enabled. |
| `announcementEnabled` | `false` | Yes | Yes | app shell, `publicSystemSettings` | Frontend displays only through public settings; expired announcements are suppressed by public API. |
| `announcementMessage` | empty | Yes | Yes | app shell | Required when announcement is enabled. |
| `announcementExpiresAt` | `null` | Yes | Yes | `backend/internal/services/system_settings.go` | Expiry suppresses public announcement output; admin record remains stored. |
| `organisationName` | empty | Yes | No | None | Stored only. |
| `pdfHeaderText` | empty | Yes | No | None | Stored only; PDF export/generation does not use it yet. |

Deprecated database columns retained for compatibility only: `transcript_retention_days`, `media_retention_days`, and `failed_upload_retention_days`. They are ignored at runtime, not exposed by admin/public APIs, and do not delete transcript or media data.

## Retention Cleanup

Expired audit records and notifications are removed automatically once per day by the backend maintenance scheduler. Cleanup uses UTC cutoffs: records with `created_at` strictly older than `now - retentionDays` are deleted. A retention value of `0` skips cleanup for that category and retains the data indefinitely.

Cleanup uses batched indexed deletes and a PostgreSQL advisory lock so only one backend instance performs cleanup at a time. It records `scheduled_cleanup_completed` only when rows were deleted or when cleanup was manually triggered.

Manual cleanup command:

```sh
cd backend
go run ./cmd/maintenance cleanup
```

Transcript records, transcript segments, analysis results, folders, users, sessions, system settings, and original media are not automatically deleted by retention cleanup.
