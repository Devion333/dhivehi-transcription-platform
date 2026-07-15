# Frontend Backend API Contract

Date: 2026-07-15

Status: implemented for backend auth, read/update/upload/analysis/search support. Implemented endpoints include auth (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`), `POST /api/uploads`, `GET /api/health`, `GET /api/stats`, `GET /api/transcripts`, `GET /api/search/transcripts`, `GET /api/transcripts/{jobId}`, `PATCH /api/transcripts/{jobId}/segments/{segmentId}`, `GET /api/transcripts/{jobId}/analysis`, and `POST /api/transcripts/{jobId}/analyse`.

Current legacy routes preserved and protected by the same authentication middleware: `POST /upload`, `GET /transcripts`, `GET /transcripts/stats`, and `POST /transcripts/:job_id/analyse`.

Base URL: `/api`

JSON style: camelCase for frontend-facing request and response bodies.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Create a server-managed session cookie from valid credentials. |
| POST | `/api/auth/logout` | Revoke the current session and clear the session cookie. |
| GET | `/api/auth/me` | Return the current authenticated user. |
| POST | `/api/uploads` | Upload media using the existing upload flow and return a frontend-friendly job envelope. |
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

Auth error codes are uppercase in the implemented auth handlers: `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`. Unauthenticated protected requests return `401`; role failures return `403`.

## Authentication

Public backend endpoints:

| Method | Path |
| --- | --- |
| GET | `/api/health` |
| POST | `/api/auth/login` |

All other Go backend workflow endpoints require authentication, including transcript, search, stats, upload, analysis, and preserved legacy routes.

Sessions use an opaque server-generated token. The browser receives only an HttpOnly cookie named `transcript_session` by default. The backend stores only the SHA-256 hash of the token in PostgreSQL. Session cookies use `Path=/`, `SameSite=Lax`, `HttpOnly=true`, and `Secure=false` locally unless `SESSION_SECURE=true`.

CORS is credentialed and must use an explicit origin. The local default is `FRONTEND_ORIGIN=http://localhost:3000`; wildcard origins are not valid with credentials.

Roles currently supported: `user` and `admin`. Existing workflow endpoints are accessible to both roles; admin-only workflow is deferred.

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
| `429` | `RATE_LIMITED` | Too many attempts for the same IP/email window. |

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

## POST /api/uploads

Implementation status: implemented as a compatibility alias that reuses the existing upload flow. The existing `POST /upload` route is preserved for legacy compatibility.

Authentication: required.

Request: `multipart/form-data`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | file | yes | Audio/video file. |
| `category` | string | no | Current values include `meeting`, `interview`, `lecture`, `podcast`, `presentation`, `conference`, `webinar`, `other`. |
| `referenceNumber` | string | no | New camelCase field. Backend also accepts `reference_number` during migration. |
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
