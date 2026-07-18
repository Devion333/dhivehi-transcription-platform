# Workflow Review and Notifications

Date: 2026-07-18

Branch: `feature/workflow-review-notifications`

## Transcript Review

The frontend presents review states as Transcript Review because the reviewer is assessing transcript accuracy and completeness. The persisted backend fields and endpoint retain their existing `analysis_review_*` names to avoid migration risk. Supported states are `unreviewed`, `reviewed`, `approved`, and `rejected`.

Review metadata is stored on the parent transcript payload in Qdrant:

| Field | Purpose |
| --- | --- |
| `analysis_review_status` | Normalized review state. Missing values map to `unreviewed`. |
| `analysis_reviewed_by_user_id` | Authenticated reviewer ID snapshot. |
| `analysis_reviewed_by_display_name` | Authenticated reviewer display-name snapshot. |
| `analysis_reviewed_at` | UTC review timestamp. |
| `analysis_review_note` | Optional reviewer note. |

Endpoint: `PATCH /api/transcripts/:jobId/analysis/review`.

Only the transcript owner or an administrator can update review state. Ownerless transcripts remain admin-only. Setting status to `unreviewed` clears reviewer identity, timestamp, and note. Review audit metadata excludes notes and analysis content.

PDF export obtains review metadata from the protected backend analysis response before rendering, not from browser-supplied review fields.

## Notifications Table

Durable in-app notifications are stored in PostgreSQL table `notifications` from migration `backend/migrations/003_notifications.sql`.

| Column | Notes |
| --- | --- |
| `id` | UUID primary key. |
| `user_id` | UUID foreign key to `users(id)`, cascade delete. |
| `type` | Notification type. |
| `title` | Safe concise title. |
| `message` | Safe concise message. |
| `resource_type` | Currently `transcript`. |
| `resource_id` | Transcript job ID. |
| `event_key` | Stable idempotency key. |
| `is_read` | Per-user read state. |
| `created_at` | Creation timestamp. |
| `read_at` | First read timestamp. |

Indexes and constraints:

| Name | Purpose |
| --- | --- |
| `notifications_user_created_at_idx` | Newest-first per-user listing. |
| `notifications_user_unread_idx` | Efficient unread count/listing. |
| `UNIQUE (user_id, event_key)` | Idempotent notification creation. |

## Notification APIs

All endpoints require authentication and always operate on the current user. Administrators do not automatically access other users' notifications.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/notifications?page=&pageSize=&unreadOnly=` | Newest-first paginated list. `pageSize` is bounded to 100. |
| `GET` | `/api/notifications/unread-count` | Current user's unread count. |
| `POST` | `/api/notifications/:notificationId/read` | Mark one current-user notification read. Repeated calls are safe. |
| `POST` | `/api/notifications/read-all` | Mark all current-user unread notifications read. |

List response shape:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

## Event Sources

Notification creation happens in backend code only. The frontend never creates workflow notifications.

| Event | Source | Title | Destination |
| --- | --- | --- | --- |
| Transcript processing completed | `GET /api/transcripts/:jobId/status` observes `transcribed`. | `Transcript ready` | `/Transcripts/Details?job_id=<jobId>` |
| Transcript processing failed | `GET /api/transcripts/:jobId/status` observes `failed`. | `Transcript processing failed` | `/Transcripts/Details?job_id=<jobId>` |
| Analysis completed | Analysis persistence succeeds after backend analysis run or admin retry. | `Analysis complete` | `/Transcripts/Analysis?job_id=<jobId>` |
| Analysis failed | Backend analysis run or admin retry fails. | `Analysis failed` | `/Transcripts/Analysis?job_id=<jobId>` |
| Transcript assigned | Admin reassignment succeeds after Qdrant owner update. | `Transcript assigned to you` | `/Transcripts/Details?job_id=<jobId>` |

Known limitation: conversion, diarization, and transcription workers currently update Qdrant directly and do not call the backend. Therefore transcript processing complete/failure notifications are generated at the safest existing backend observation point: the protected status endpoint. Repeated polling or repeated status observation is deduplicated by `event_key`.

## Idempotency

Creation uses `INSERT ... ON CONFLICT (user_id, event_key) DO NOTHING`.

Current event key strategy:

| Event | Key |
| --- | --- |
| Transcript completed | `transcript-complete:<jobId>:<finalStatus>` |
| Transcript failed | `transcript-failed:<jobId>:<updatedAt-or-failureCode>` |
| Analysis completed | `analysis-complete:<jobId>:<analysisCompletedAt>` |
| Analysis failed | `analysis-failed:<jobId>:<failureTimestamp>` |
| Transcript assigned | `transcript-assigned:<jobId>:<newOwnerUserId>:<updatedAt>` |

Notification text intentionally excludes transcript content, analysis content, raw worker/provider errors, credentials, and infrastructure details.

## Frontend Behavior

The authenticated top bar includes a notification bell. It shows an unread badge, compact popover, newest notifications first, unread visual distinction, explicit mark-one-read through opening a notification, and mark-all-read.

Unread count polling interval: 45 seconds.

Polling is mounted only for authenticated sessions, stops on unmount/logout, and avoids overlapping requests.

If a notification points to a transcript that no longer exists, the destination page shows the existing safe not-found/unavailable state. The notification itself remains safe and durable.

## Retention

Default retention: 90 days, configured by `NOTIFICATION_RETENTION_DAYS`.

Cleanup command:

```sh
cd backend
go run ./cmd/notification-cleanup
```

The cleanup deletes only read notifications older than the retention window. Newer unread notifications are preserved.
