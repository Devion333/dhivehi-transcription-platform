# Frontend Backend API Contract

Date: 2026-07-15

Status: implemented for backend auth, read/update/upload/analysis/search/settings support. Implemented endpoints include auth (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`), settings (`GET /api/settings/public`, `GET /api/admin/settings`, `PUT /api/admin/settings`, `POST /api/admin/settings/restore-defaults`), `POST /api/uploads`, `GET /api/health`, `GET /api/stats`, `GET /api/transcripts`, `GET /api/search/transcripts`, `GET /api/transcripts/{jobId}`, `PATCH /api/transcripts/{jobId}/segments/{segmentId}`, `GET /api/transcripts/{jobId}/analysis`, and `POST /api/transcripts/{jobId}/analyse`.

Current legacy routes preserved and protected by the same authentication middleware: `POST /upload`, `GET /transcripts`, `GET /transcripts/stats`, and `POST /transcripts/:job_id/analyse`.

Base URL: `/api`

JSON style: camelCase for frontend-facing request and response bodies.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Create a server-managed session cookie from valid credentials. |
| POST | `/api/auth/logout` | Revoke the current session and clear the session cookie. |
| GET | `/api/auth/me` | Return the current authenticated user. |
| GET | `/api/admin/users` | Admin-only user list with pagination and filters. |
| POST | `/api/admin/users` | Admin-only user creation. |
| GET | `/api/admin/users/{userId}` | Admin-only user detail. |
| PATCH | `/api/admin/users/{userId}` | Admin-only name/role update. |
| POST | `/api/admin/users/{userId}/activate` | Admin-only account activation. |
| POST | `/api/admin/users/{userId}/deactivate` | Admin-only account deactivation and session revocation. |
| POST | `/api/admin/users/{userId}/reset-password` | Admin-only password reset and session revocation. |
| GET | `/api/admin/audit` | Admin-only audit event list with filters and pagination. |
| GET | `/api/admin/audit/{eventId}` | Admin-only audit event detail. |
| GET | `/api/admin/jobs` | Admin-only system job list with filters and pagination. |
| GET | `/api/admin/jobs/{jobId}` | Admin-only job detail with pipeline and queue state. |
| POST | `/api/admin/jobs/{jobId}/retry` | Admin-only controlled retry for supported failed stages. |
| GET | `/api/admin/jobs/health` | Admin-only safe dependency and queue health summary. |
| GET | `/api/settings/public` | Public-safe runtime settings for upload rules and banners. |
| GET | `/api/admin/settings` | Admin-only full system settings read. |
| PUT | `/api/admin/settings` | Admin-only full system settings update. |
| POST | `/api/admin/settings/restore-defaults` | Admin-only restore defaults action. |
| POST | `/api/audit/pdf-export` | Authenticated controlled PDF export audit recording endpoint. |
| POST | `/api/uploads` | Upload media using the existing upload flow and return a frontend-friendly job envelope. New uploads require `referenceNumber`. |
| GET | `/api/transcripts` | List parent transcript jobs with pagination/filtering. |
| GET | `/api/search/transcripts` | Literal transcript segment text search with parent context. |
| GET | `/api/transcripts/{jobId}` | Get one transcript with ordered segments. |
| PATCH | `/api/transcripts/{jobId}/segments/{segmentId}` | Update editable segment fields. |
| POST | `/api/transcripts/{jobId}/analyse` | Trigger analysis through the existing analysis worker and return a frontend-friendly envelope. |
| GET | `/api/transcripts/{jobId}/analysis` | Read stored analysis without rerun. |
| GET | `/api/stats` | Dashboard summary. |
| GET | `/api/health` | Backend readiness. |

## Common Error Format

```json
{
  "error": {
    "code": "not_found",
    "message": "Transcript not found",
    "details": null
  }
}
```

Common error codes: `bad_request`, `not_found`, `conflict`, `validation_error`, `upstream_unavailable`, `internal_error`.

Auth error codes are uppercase in the implemented auth handlers: `UNAUTHENTICATED`, `FORBIDDEN`, `TOO_MANY_LOGIN_ATTEMPTS`. Unauthenticated protected requests return `401`; role failures return `403`.

Maintenance-mode mutation failures use a flat response for compatibility with route-aware middleware:

```json
{
  "error": "maintenance_mode",
  "message": "The system is currently in maintenance mode. Viewing existing content is available, but changes are temporarily disabled."
}
```

During maintenance mode, standard-user `GET`, `HEAD`, and `OPTIONS` requests remain available. Standard-user mutations such as upload, edit, speaker rename, folder changes, analysis trigger, review status change, delete, and reassignment return `503`. Existing transcript downloads remain allowed because they are read-only.

`GET /api/admin/settings` and `PUT /api/admin/settings` no longer expose or accept transcript, original media, or failed-upload retention fields. Existing database columns named `transcript_retention_days`, `media_retention_days`, and `failed_upload_retention_days` are deprecated compatibility columns and are ignored at runtime. The active retention payload contains only `auditRetentionDays` and `notificationRetentionDays`, both measured in days. `0` means retain indefinitely.

The backend maintenance scheduler reads `auditRetentionDays` and `notificationRetentionDays` from the current System Settings record once per cleanup run. Records with `created_at` strictly older than the UTC cutoff are deleted. Cleanup affects only audit events and notifications.

After admin Save changes or Restore defaults succeeds, the frontend refreshes `GET /api/settings/public` through the shared public settings provider so maintenance and announcement banners update immediately.

## Authentication

Public backend endpoints:

| Method | Path |
| --- | --- |
| GET | `/api/health` |
| POST | `/api/auth/login` |
| GET | `/api/settings/public` |

All other Go backend workflow endpoints require authentication, including transcript, search, stats, upload, analysis, and preserved legacy routes.

Sessions use an opaque server-generated token. The browser receives only an HttpOnly cookie named `transcript_session` by default. The backend stores only the SHA-256 hash of the token in PostgreSQL. Session cookies use `Path=/`, `SameSite=Lax`, `HttpOnly=true`, and `Secure=false` locally unless `SESSION_SECURE=true`.

Fresh successful frontend login always navigates to dashboard `/`. The Login page ignores stale `returnTo` values so a new user is not sent back to a prior user's admin route. Logout clears known redirect/return-location browser storage keys and navigates to `/Login` with route replacement.

CORS is credentialed and must use an explicit origin. The local default is `FRONTEND_ORIGIN=http://localhost:3000`; wildcard origins are not valid with credentials.

Roles currently supported: `user` and `admin`. Existing transcript workflow endpoints are accessible to both roles. `/api/admin/*` routes require an authenticated `admin` user in the Go backend.

### AuthUser

```json
{
  "id": "9bd45010-9d75-48eb-b46d-05839d636d6f",
  "name": "Runtime Validation Admin",
  "email": "admin.local@example.com",
  "role": "admin"
}
```

Password hashes and session tokens are never returned in DTOs.

## Pagination Format

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false
  }
}
```

The implemented UI-facing list endpoint uses `page` and `pageSize` with an exact `total` after filtering.

## Status Values

Parent transcript statuses:

| Status | Meaning |
| --- | --- |
| `uploaded` | Parent job created and conversion queued. |
| `processing` | Generic public state for conversion/diarization/transcription in progress when a more specific state is not exposed. |
| `diarized` | Segments created, transcription pending/in progress. |
| `transcribed` | All known segments are transcribed. |
| `converting` | Internal conversion-in-progress alias, exposed as `processing` by current API mapping. |
| `diarizing` | Internal diarization-in-progress alias, exposed as `processing` by current API mapping. |
| `transcribing` | Internal transcription-in-progress alias, exposed as `processing` by current API mapping. |
| `completed` / `complete` | Legacy completion aliases, exposed as `transcribed` by current API mapping. |
| `conversion_failed` | Conversion failed; exposed as `failed` by current API mapping. |
| `diarization_failed` | Diarization failed; exposed as `failed` by current API mapping. |
| `transcription_failed` | Transcription failed; exposed as `failed` by current API mapping. |
| `failed` | Generic public failure state if internal failure source is hidden. |

Segment statuses:

| Status | Meaning |
| --- | --- |
| `pending_transcription` | Segment exists but has not been transcribed. |
| `transcribed` | Segment has transcript text. |
| `transcription_failed` | Segment transcription failed. |

Analysis statuses:

| Status | Meaning |
| --- | --- |
| `not_started` | No stored analysis. |
| `processing` | Analysis is running. |
| `analysis_pending` | Legacy pending alias, exposed as `processing` by current API mapping. |
| `complete` | Stored analysis is available. |
| `analysis_complete` / `completed` | Legacy completion aliases, exposed as `complete` by current API mapping. |
| `failed` | Last analysis attempt failed. |

## DTOs

### TranscriptSummary

```json
{
  "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
  "filename": "recording.wav",
  "category": "meeting",
  "referenceNumber": "REF-001",
  "notes": "Initial upload note",
  "status": "transcribed",
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:10:00Z",
  "segmentCount": 8,
  "analysisStatus": "complete"
}
```

### TranscriptDetail

```json
{
  "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
  "filename": "recording.wav",
  "category": "meeting",
  "referenceNumber": "REF-001",
  "notes": "Initial upload note",
  "status": "transcribed",
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:10:00Z",
  "mediaUrl": "http://localhost:9000/uploads/object.wav",
  "segmentCount": 2,
  "speakers": 2,
  "analysisStatus": "not_started",
  "segments": [
    {
      "id": "7b7d4b3e-0000-0000-0000-000000000000_seg_000",
      "segmentIndex": 0,
      "speaker": "SPEAKER_00",
      "startTime": 0,
      "endTime": 12.4,
      "mediaUrl": "http://localhost:9000/uploads/object.wav",
      "transcriptText": "ޓެކްސްޓް",
      "status": "transcribed"
    }
  ]
}
```

### Analysis

```json
{
  "status": "complete",
  "summary": "Short English summary.",
  "keywords": ["keyword"],
  "entities": {
    "persons": [],
    "locations": [],
    "organizations": [],
    "events": []
  },
  "classification": "general_discussion",
  "englishTranslation": "English translation text."
}
```

### TranscriptSearchResponse

```json
{
  "query": "ދިވެހި",
  "items": [
    {
      "segmentId": "7b7d4b3e-0000-0000-0000-000000000000_seg_000",
      "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
      "filename": "recording.wav",
      "referenceNumber": "REF-001",
      "category": "meeting",
      "transcriptStatus": "transcribed",
      "segmentIndex": 0,
      "speaker": "SPEAKER_00",
      "startTime": 0,
      "endTime": 12.4,
      "transcriptText": "ދިވެހި ޓެކްސްޓް",
      "matchExcerpt": "ދިވެހި ޓެކްސްޓް"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false
  }
}
```

### UploadResult

```json
{
  "job": {
    "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
    "filename": "recording.wav",
    "category": "meeting",
    "referenceNumber": "REF-001",
    "notes": "Initial upload note",
    "status": "uploaded",
    "createdAt": "2026-07-15T00:00:00Z",
    "durationSeconds": 0,
    "speakerCount": 0,
    "segmentCount": 0,
    "analysisStatus": "not_started"
  }
}
```

## POST /api/auth/login

Request:

```json
{
  "email": "admin.local@example.com",
  "password": "correct horse battery staple"
}
```

Success: `200 OK`

The response sets the `transcript_session` HttpOnly cookie and returns the safe user DTO.

```json
{
  "user": {
    "id": "9bd45010-9d75-48eb-b46d-05839d636d6f",
    "name": "Runtime Validation Admin",
    "email": "admin.local@example.com",
    "role": "admin"
  }
}
```

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Request body is not valid JSON. |
| `401` | `UNAUTHENTICATED` | Invalid email/password or inactive user. |
| `429` | `TOO_MANY_LOGIN_ATTEMPTS` | Too many failed attempts for the same IP/email window. |

Failed login attempts are limited to 5 per normalized identifier and IP within 15 minutes. Successful login clears the relevant counter. Redis is used when available, with a local fail-open fallback if Redis is unavailable.

State-changing browser requests must come from the configured frontend origin. The backend validates `Origin` or, when `Origin` is absent, `Referer` for `POST`, `PATCH`, and future `DELETE` requests. Non-browser/internal requests without either header remain allowed.

## POST /api/auth/logout

Authentication: required.

Success: `200 OK`

The backend revokes the stored session row and clears the session cookie.

```json
{
  "message": "Signed out"
}
```

## GET /api/auth/me

Authentication: required.

Success: `200 OK`

```json
{
  "user": {
    "id": "9bd45010-9d75-48eb-b46d-05839d636d6f",
    "name": "Runtime Validation Admin",
    "email": "admin.local@example.com",
    "role": "admin"
  }
}
```

Unauthenticated response: `401 UNAUTHENTICATED`.

## Admin User DTOs

### AdminUserSummary

```json
{
  "id": "22222222-2222-2222-2222-222222222222",
  "name": "Analyst Name",
  "email": "analyst@example.com",
  "role": "user",
  "isActive": true,
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:00:00Z",
  "lastLoginAt": null
}
```

`AdminUserDetail` currently contains the same fields as `AdminUserSummary`. Admin user DTOs never include password hashes, passwords, session tokens, or session token hashes.

## GET /api/admin/users

Authentication: required, role `admin`.

Query parameters:

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | `1` | Invalid or less-than-one values normalize to `1`. |
| `pageSize` | integer | `20` | Maximum `100`. |
| `search` | string | empty | Matches `name` and `email`. |
| `role` | string | empty/all | `user` or `admin`. |
| `status` | string | empty/all | `active` or `inactive`. |

Success: `200 OK`

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false
  }
}
```

Ordering is deterministic: newest `createdAt` first, then stable `id` fallback.

## POST /api/admin/users

Authentication: required, role `admin`.

Request:

```json
{
  "name": "Analyst Name",
  "email": "analyst@example.com",
  "role": "user",
  "password": "temporary password"
}
```

Success: `201 Created`

Returns `{ "user": AdminUserDetail }`. New users are active by default. Email is normalized and unique. Passwords use the existing Argon2id hashing policy and are never returned.

Common errors: `INVALID_USER_INPUT`, `EMAIL_ALREADY_EXISTS`, `INVALID_ROLE`, `WEAK_PASSWORD`.

## GET /api/admin/users/{userId}

Authentication: required, role `admin`.

Success: `200 OK`

Returns `{ "user": AdminUserDetail }`. Missing or invalid IDs return `USER_NOT_FOUND`.

## PATCH /api/admin/users/{userId}

Authentication: required, role `admin`.

Request fields are limited to `name` and `role`; unknown fields are rejected. Email, activation, and password cannot be changed through this endpoint.

```json
{
  "name": "Updated Name",
  "role": "admin"
}
```

Success: `200 OK`

Returns `{ "user": AdminUserDetail }` with `updatedAt` changed. Backend safeguards reject demoting the last active administrator with `LAST_ACTIVE_ADMIN`.

## POST /api/admin/users/{userId}/activate

Authentication: required, role `admin`.

Sets `isActive=true`, updates `updatedAt`, and returns `{ "user": AdminUserDetail }`.

## POST /api/admin/users/{userId}/deactivate

Authentication: required, role `admin`.

Sets `isActive=false`, updates `updatedAt`, revokes all active sessions for the target user, and returns `{ "user": AdminUserDetail }`.

Safeguards: administrators cannot deactivate their own current account, and the last active administrator cannot be deactivated. Deactivated users cannot authenticate and existing sessions stop working immediately.

Common errors: `CANNOT_DEACTIVATE_SELF`, `LAST_ACTIVE_ADMIN`, `USER_NOT_FOUND`.

## POST /api/admin/users/{userId}/reset-password

Authentication: required, role `admin`.

Request:

```json
{
  "newPassword": "new temporary password"
}
```

Success: `200 OK`

```json
{
  "message": "Password updated"
}
```

The password is hashed with the existing Argon2id implementation and all active sessions for the target user are revoked. Self-reset is allowed and revokes the current session, requiring sign-in again.

## Audit DTOs

### AuditEventSummary

```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "createdAt": "2026-07-15T00:00:00Z",
  "actor": {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Admin",
    "email": "admin@example.com",
    "role": "admin"
  },
  "action": "admin.user_created",
  "category": "user_management",
  "outcome": "success",
  "resourceType": "user",
  "resourceId": "22222222-2222-2222-2222-222222222222",
  "ipAddress": "127.0.0.1"
}
```

For unauthenticated failed-login events, `actor` is `null`.

### AuditEventDetail

Adds:

```json
{
  "userAgent": "Mozilla/5.0 ...",
  "metadata": {
    "targetUserId": "22222222-2222-2222-2222-222222222222",
    "targetRole": "user"
  }
}
```

Metadata is action-specific and allowlisted. Passwords, session tokens, cookies, authorization headers, transcript text, search queries, analysis text, provider responses, API keys, database connection strings, Qdrant payloads, and MinIO credentials must not be present.

Job-management audit category: `job_management`. Actions: `admin.job_retry_requested`, `admin.job_retry_succeeded`, `admin.job_retry_failed`. Metadata is limited to `jobId`, `stage`, `previousStatus`, `newStatus`, `retryCount`, and `failureCode`.

## GET /api/admin/audit

Authentication: required, role `admin`.

Query parameters:

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | `1` | Invalid or less-than-one values normalize to `1`. |
| `pageSize` | integer | `50` | Maximum `100`. |
| `search` | string | empty | Matches actor name, actor email, action, and resource ID. |
| `category` | string | empty/all | `authentication`, `user_management`, `transcript`, `analysis`, `search`, `export`. |
| `action` | string | empty/all | Must be a known audit action. |
| `outcome` | string | empty/all | `success` or `failure`. |
| `actorUserId` | UUID | empty/all | Exact actor ID match. |
| `resourceType` | string | empty/all | Exact resource type match. |
| `resourceId` | string | empty/all | Exact resource ID match. |
| `dateFrom` | RFC3339 | empty | Inclusive lower bound. |
| `dateTo` | RFC3339 | empty | Inclusive upper bound. |

Success: `200 OK`

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 0,
    "totalPages": 0,
    "hasNextPage": false
  }
}
```

Ordering is newest first: `createdAt DESC`, then stable event ID fallback.

Audit APIs are read-only. There is no browser-accessible audit deletion, edit, clear, or retention-cleanup endpoint.

## GET /api/admin/audit/{eventId}

Authentication: required, role `admin`.

Success: `200 OK`

Returns `{ "event": AuditEventDetail }`. Missing or invalid IDs return `AUDIT_EVENT_NOT_FOUND`.

Audit retention is handled only by explicit backend maintenance command execution, not by this API surface.

## Admin Job DTOs

### AdminJobSummary

```json
{
  "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
  "filename": "recording.wav",
  "referenceNumber": "REF-001",
  "category": "meeting",
  "status": "transcription_failed",
  "currentStage": "transcription",
  "segmentCount": 4,
  "analysisStatus": "not_started",
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:10:00Z",
  "failureCode": "TRANSCRIPTION_FAILED",
  "failureMessage": "model transcription failed",
  "retryable": true
}
```

### AdminJobDetail

Adds safe operational fields:

```json
{
  "notes": "Initial upload note",
  "requestedSpeakers": 2,
  "mediaAvailable": true,
  "retryCount": 1,
  "queueState": { "queued": false, "processing": false, "failed": true },
  "pipelineStages": [
    { "name": "conversion", "status": "complete", "startedAt": "", "completedAt": "", "retryCount": 0, "failureMessage": "" },
    { "name": "diarization", "status": "complete", "startedAt": "", "completedAt": "2026-07-15T00:05:00Z", "retryCount": 0, "failureMessage": "" },
    { "name": "transcription", "status": "failed", "startedAt": "", "completedAt": "", "retryCount": 0, "failureMessage": "model transcription failed" }
  ]
}
```

Admin job DTOs never return raw Redis payloads, worker URLs, MinIO credentials, Qdrant numeric IDs, stack traces, provider responses, model tokens, or transcript text.

## GET /api/admin/jobs

Authentication: required, role `admin`.

Query parameters:

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | `1` | Invalid or less-than-one values normalize to `1`. |
| `pageSize` | integer | `20` | Maximum `100`. |
| `search` | string | empty | Matches filename, reference number, category, and job ID. |
| `status` | string | empty/all | Canonical job status, including stage-specific failures. |
| `stage` | string | empty/all | `conversion`, `diarization`, `transcription`, or `analysis`. |
| `failedOnly` | boolean | `false` | Limits to failed canonical statuses. |
| `dateFrom` | RFC3339 | empty | Inclusive created-at lower bound. |
| `dateTo` | RFC3339 | empty | Inclusive created-at upper bound. |

Ordering is `updatedAt DESC`, `createdAt DESC`, then `jobId` fallback.

## GET /api/admin/jobs/{jobId}

Authentication: required, role `admin`.

Success returns `{ "job": AdminJobDetail }`. Missing parents return `404 JOB_NOT_FOUND`. GET requests do not mutate job or queue state.

## POST /api/admin/jobs/{jobId}/retry

Authentication: required, role `admin`.

Optional request:

```json
{ "stage": "transcription" }
```

If omitted, the backend derives the stage from current failed state. The browser cannot supply queue names or payloads.

Retryable stages: `conversion_failed`, `diarization_failed`, failed transcription segments or `transcription_failed`, and `analysis_failed`/analysis status `failed`.

Conflict errors include `JOB_NOT_FAILED`, `JOB_NOT_RETRYABLE`, `JOB_ALREADY_QUEUED`, `JOB_RETRY_LIMIT_REACHED`, `JOB_QUEUE_UNAVAILABLE`, and `WORKER_UNAVAILABLE`.

Conversion, diarization, and transcription retry enqueue reconstructed existing worker payloads through focused backend code. Analysis retry calls the existing synchronous analysis flow and does not publish to Redis.

## GET /api/admin/jobs/health

Authentication: required, role `admin`.

Returns safe dependency and queue counts:

```json
{
  "backend": "healthy",
  "redis": "healthy",
  "qdrant": "healthy",
  "minio": "healthy",
  "queues": {
    "conversion": { "queued": 0, "processing": 0, "failed": 0 },
    "diarization": { "queued": 0, "processing": 0, "failed": 0 },
    "transcription": { "queued": 0, "processing": 0, "failed": 0 }
  },
  "workers": {
    "conversion": { "status": "available", "instances": 1, "lastHeartbeatAt": "2026-07-16T12:00:00Z" },
    "diarization": { "status": "available", "instances": 1, "lastHeartbeatAt": "2026-07-16T12:00:00Z" },
    "transcription": { "status": "available", "instances": 1, "lastHeartbeatAt": "2026-07-16T12:00:00Z" },
    "analysis": { "status": "unknown", "instances": 0, "lastHeartbeatAt": null }
  }
}
```

Worker `status` is one of `available`, `unavailable`, or `unknown`. Backend reads Redis heartbeat keys shaped as `worker_heartbeat:<workerType>:<instanceId>` via per-type Redis sets, not `KEYS *`. A missing fresh heartbeat for an expected worker is `unavailable`; Redis read failure or non-expected workers are `unknown`. Internal service URLs are not returned.

## POST /api/audit/pdf-export

Authentication: required.

This endpoint is only for the Next.js PDF export route to record export events. It is not a public generic audit-ingestion API.

Request:

```json
{
  "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
  "format": "segmented",
  "includeAnalysis": true,
  "outcome": "success"
}
```

Rules:

| Field | Rule |
| --- | --- |
| `jobId` | Required transcript/job ID. |
| `format` | Must be `segmented` or `paragraph`. |
| `includeAnalysis` | Boolean only. |
| `outcome` | Must be `success` or `failure`; maps to `export.pdf_generated` or `export.pdf_failed`. |

Arbitrary action names and arbitrary metadata are rejected or ignored.

## POST /api/uploads

Implementation status: implemented as a compatibility alias that reuses the existing upload flow. The existing `POST /upload` route is preserved for legacy compatibility.

Authentication: required.

Request: `multipart/form-data`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | file | yes | Audio/video file. |
| `category` | string | no | Current values include `meeting`, `interview`, `lecture`, `podcast`, `presentation`, `conference`, `webinar`, `other`. |
| `referenceNumber` | string | yes | Primary transcript identifier. Trimmed, required, max 100 characters. Backend also accepts `reference_number` during migration. |
| `notes` | string | no | Free text. |
| `requestedSpeakers` | integer | no | Existing speaker metadata value. Backend also accepts legacy `speakers`. |

Success: `201 Created`

```json
{
  "job": {
    "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
    "filename": "recording.wav",
    "category": "meeting",
    "referenceNumber": "REF-001",
    "notes": "Initial upload note",
    "status": "uploaded",
    "createdAt": "2026-07-15T00:00:00Z",
    "durationSeconds": 0,
    "speakerCount": 0,
    "segmentCount": 0,
    "analysisStatus": "not_started"
  },
  "message": "Upload accepted for processing"
}
```

Rules:

| Rule | Requirement |
| --- | --- |
| MinIO write | Must succeed before success response. |
| Qdrant parent creation | Current compatibility behavior logs failures but preserves legacy success behavior. A later hardening stage should make this atomic. |
| Redis enqueue | Current compatibility behavior logs failures but preserves legacy success behavior. A later hardening stage should make this atomic or return an explicit degraded state. |
| Response identity | Must return `job.jobId`. |
| Secrets | Do not return MinIO credentials or local temp paths. |

## GET /api/transcripts

Authentication: required.

Query parameters:

| Query | Type | Default |
| --- | --- | --- |
| `page` | integer | `1` |
| `pageSize` | integer | `20` |
| `search` | string | empty |
| `status` | string | empty |

Success: `200 OK`

```json
{
  "items": [
    {
      "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
      "filename": "recording.wav",
      "category": "meeting",
      "referenceNumber": "REF-001",
      "notes": "Initial upload note",
      "status": "transcribed",
      "createdAt": "2026-07-15T00:00:00Z",
      "updatedAt": "2026-07-15T00:10:00Z",
      "segmentCount": 8,
      "analysisStatus": "complete"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false
  }
}
```

Rules:

| Rule | Requirement |
| --- | --- |
| Parent only | Return only `type=parent` jobs. |
| Ordering | Newest first by `createdAt`/`timestamp`. |
| Search | Search filename, reference number, and category initially. Transcript-content search can be separate later. |
| Counts | Map `segment_count` and legacy `segments`; fall back to counting segment points if needed. |

## GET /api/transcripts/{jobId}

Authentication: required.

Success: `200 OK`

Returns `TranscriptDetail`.

Rules:

| Rule | Requirement |
| --- | --- |
| Ownership | Every returned segment must have `parent_job_id == jobId`. |
| Ordering | Segments sorted by `segmentIndex` ascending. |
| Media | Return browser-safe `mediaUrl`; frontend must not rewrite MinIO hostnames. |
| Qdrant internals | Do not return vectors or numeric point IDs. |

## GET /api/search/transcripts

Authentication: required.

Query parameters:

| Query | Type | Required | Default |
| --- | --- | --- | --- |
| `q` | string | yes | none |
| `page` | integer | no | `1` |
| `pageSize` | integer | no | `20`, max `100` |
| `status` | string | no | empty/all |
| `category` | string | no | empty |

Success: `200 OK`

Returns `TranscriptSearchResponse`.

Errors:

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `SEARCH_QUERY_REQUIRED` | Trimmed `q` is empty. |
| `500` | `SEARCH_UNAVAILABLE` | Qdrant/search dependency failed. |

Rules:

| Rule | Requirement |
| --- | --- |
| Search method | Literal service-side `transcriptText` substring matching over segment payloads. |
| Case | Latin text is case-insensitive where practical; Dhivehi Unicode is preserved. |
| Parent context | Results are enriched from parent points in one request-scope lookup. Missing parent data uses safe fallbacks. |
| Ordering | Newest parent timestamp first, then job ID fallback, then segment index ascending within the same job. |
| Pagination | Uses the common pagination envelope after filtering and ordering. |
| Qdrant internals | Do not return vectors, numeric point IDs, MinIO URLs, or raw payloads. |
| Index | Backend startup attempts to ensure a Qdrant text payload index on `transcript_text`; current search does not depend on the index for correctness. |

## PATCH /api/transcripts/{jobId}/segments/{segmentId}

Authentication: required.

Request:

```json
{
  "transcriptText": "އެޑިޓް ކުރެވުނު ޓެކްސްޓް"
}
```

Success: `200 OK`

```json
{
  "segment": {
    "id": "7b7d4b3e-0000-0000-0000-000000000000_seg_000",
    "segmentIndex": 0,
    "speaker": "SPEAKER_00",
    "startTime": 0,
    "endTime": 12.4,
    "mediaUrl": "http://localhost:9000/uploads/object.wav",
    "transcriptText": "އެޑިޓް ކުރެވުނު ޓެކްސްޓް",
    "status": "transcribed"
  }
}
```

Update rules:

| Rule | Requirement |
| --- | --- |
| Editable fields | Initially only `transcriptText`. |
| Ownership check | Backend must verify the segment belongs to `{jobId}`. |
| Empty text | Trim for validation; decide whether empty string is allowed before implementation. |
| Status | Do not silently change segment status unless a deliberate rule is added. |
| Embeddings | If embeddings are used later, mark stale or regenerate outside this endpoint. |

## POST /api/transcripts/{jobId}/analyse

Authentication: required.

Implementation status: implemented as an API alias that reuses the existing analysis flow. The existing `POST /transcripts/:job_id/analyse` route is preserved for legacy compatibility.

Request: no body initially.

Success: `200 OK`

Returns an analysis envelope.

```json
{
  "analysis": {
    "status": "complete",
    "summary": "Short English summary.",
    "keywords": ["keyword"],
    "entities": {
      "persons": [],
      "locations": [],
      "organizations": [],
      "events": []
    },
    "classification": "general_discussion",
    "englishTranslation": "English translation text."
  },
  "message": "Analysis completed"
}
```

Rules:

| Rule | Requirement |
| --- | --- |
| Readiness | Transcript should be `transcribed` or have at least one non-empty transcribed segment. |
| Transcript construction | Sort segments by `segmentIndex`; skip empty/pending text. |
| Persistence | Current compatibility behavior stores the result on the parent payload asynchronously after the analysis worker returns. The response includes the fresh analysis result so the UI can render immediately. |
| Upstream | Current compatibility behavior uses the existing analysis service URL `http://analysis:7861/run/predict`. A later hardening stage should make this configurable and timeout-protected. |

## GET /api/transcripts/{jobId}/analysis

Authentication: required.

Success with stored analysis: `200 OK`

```json
{
  "status": "complete",
  "summary": "Short English summary.",
  "keywords": ["keyword"],
  "entities": {
    "persons": [],
    "locations": [],
    "organizations": [],
    "events": []
  },
  "classification": "general_discussion",
  "englishTranslation": "English translation text."
}
```

Success without analysis: `200 OK`

```json
{
  "status": "not_started",
  "summary": "",
  "keywords": [],
  "entities": {
    "persons": [],
    "locations": [],
    "organizations": [],
    "events": []
  },
  "classification": "",
  "englishTranslation": ""
}
```

Rule: this endpoint must never call the analysis worker.

## GET /api/stats

Authentication: required.

Success: `200 OK`

```json
{
  "totalTranscripts": 4,
  "uploaded": 1,
  "diarized": 1,
  "transcribed": 2,
  "failed": 0,
  "analysisComplete": 1,
  "totalSegments": 8
}
```

Rules:

| Rule | Requirement |
| --- | --- |
| Completion | Count `transcribed` as transcribed; map legacy `completed` to `transcribed` in DTO status mapping. |
| Failed | Include `diarization_failed`, `transcription_failed`, `error`, and `failed` under `failed`. |
| Segments | Count all Qdrant points where `type=segment` using paginated scroll. |

## GET /api/health

Success: `200 OK`

```json
{
  "status": "ok",
  "dependencies": {
    "qdrant": "ok",
    "redis": "ok",
    "minio": "ok",
    "database": "ok"
  }
}
```

This endpoint is recommended for local diagnostics and readiness checks. The rebuild should not require browser access to Qdrant, Redis, or MinIO health endpoints directly.

If a required dependency is unavailable, this endpoint returns `503` with `status: "degraded"` and dependency values set to `"unavailable"`.

## Media URL Behavior

Backend DTO mapping translates stored MinIO URLs with `MINIO_PUBLIC_URL` when that environment variable is configured. The backend service in both Compose files now sets:

```text
MINIO_PUBLIC_URL=http://localhost:9000
```

This keeps stored internal URLs such as `http://minio:9000/uploads/...` in Qdrant unchanged while returning browser-accessible `mediaUrl` values to the frontend. No MinIO credentials are exposed.

## Field Mapping Summary

| Qdrant key | API key |
| --- | --- |
| `job_id` | `jobId` |
| `filename` | `filename` |
| `category` | `category` |
| `reference_number` | `referenceNumber` |
| `notes` | `notes` |
| `minio_url` | `mediaUrl` |
| `status` | `status` |
| `speakers` | `requestedSpeakerCount` or `speakerCount` fallback |
| `segment_count` / `segments` | `segmentCount` |
| `timestamp` | `createdAt` |
| `analysis_status` | `analysisStatus` |
| `analysis_keywords` | `analysis.keywords` |
| `analysis_entities` | `analysis.entities` |
| `analysis_summary` | `analysis.summary` |
| `analysis_classification` | `analysis.classification` |
| `analysis_english_translation` | `analysis.englishTranslation` |
| `parent_job_id` | ownership check, omitted from nested segment responses |
| `segment_index` | `segmentIndex` |
| `speaker` | `speaker` |
| `start_time` | `startTime` |
| `end_time` | `endTime` |
| `transcript_text` | `transcriptText` |

## Frontend Rules

| Rule | Requirement |
| --- | --- |
| Direct Qdrant access | Forbidden in rebuilt browser/Next UI. |
| Direct Redis access | Forbidden. |
| MinIO credentials | Never exposed. |
| Dhivehi text | Render with Thaana-capable font and RTL direction where transcript content appears. |
| General UI language | English. |
| PDF export | Use backend DTO data, then current Next PDF route unless architecture is changed later. |

## Next.js PDF Export Payload

Route: `POST /api/export-pdf` in the Next.js frontend app.

This is not a Go backend endpoint. The frontend gathers transcript and stored analysis through the typed backend API first, then posts a structured export payload to the Next.js route. The route validates authentication by forwarding the incoming cookie to Go backend `GET /api/auth/me`. The route must not call Qdrant, MinIO, Redis, workers, or the analysis service.

```json
{
  "transcript": {
    "jobId": "7b7d4b3e-0000-0000-0000-000000000000",
    "filename": "recording.wav",
    "category": "meeting",
    "referenceNumber": "REF-001",
    "notes": "Initial upload note",
    "createdAt": "2026-07-15T00:00:00Z",
    "status": "transcribed",
    "speakers": 2,
    "segmentCount": 2,
    "segments": [
      {
        "id": "7b7d4b3e-0000-0000-0000-000000000000_seg_000",
        "segmentIndex": 0,
        "speaker": "SPEAKER_00",
        "startTime": 0,
        "endTime": 12.4,
        "transcriptText": "ޓެކްސްޓް"
      }
    ]
  },
  "format": "segmented",
  "includeAnalysis": true,
  "analysis": {
    "status": "complete",
    "keywords": ["keyword"],
    "entities": ["Persons: Example"],
    "summary": "Short English summary.",
    "classification": "general_discussion",
    "englishTranslation": "English translation text."
  }
}
```

Validation rules:

| Rule | Requirement |
| --- | --- |
| Transcript | Required with non-empty `jobId`, `filename`, and at least one segment. |
| Format | Must be `segmented` or `paragraph`. |
| Segments | Each segment must include `id`, numeric `segmentIndex`, numeric timestamps, and string `transcriptText`. |
| Analysis | If `includeAnalysis=true`, supplied analysis must have `status=complete` and at least one usable analysis field. |
| Authentication | Missing or invalid session returns `401 UNAUTHENTICATED` before PDF generation. |
| Response | Success returns `200 application/pdf`; failures return `{ error: { code, message, details } }`. |
