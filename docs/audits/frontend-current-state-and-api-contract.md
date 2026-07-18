# Frontend Current State and API Contract Audit

Audit date: 2026-07-15

Branch: `frontend-reimplementation`

Source commit for legacy snapshot: `63978c5`

Scope: archive and audit only. No full UI rebuild, backend implementation, worker changes, data mutation, queue mutation, model work, or Docker image work was performed.

## 1. Legacy Snapshot Details

Snapshot location: `legacy/frontend-analysis-baseline/`

Source frontend: `frontend/transcription-frontend/`

Snapshot README: `legacy/frontend-analysis-baseline/README.md`

Preserved paths and files where present:

| Snapshot path | Source path | Notes |
| --- | --- | --- |
| `src/app/` | `frontend/transcription-frontend/src/app/` | Current routes and Next API route reference. |
| `src/components/` | `frontend/transcription-frontend/src/components/` | Shared UI, theme provider, PDF modal. |
| `src/lib/` | `frontend/transcription-frontend/src/lib/` | PDF helper and utility. |
| `src/config.ts` | `frontend/transcription-frontend/src/config.ts` | Current hard-coded service URLs. |
| `package.json` | `frontend/transcription-frontend/package.json` | Dependency reference. |
| `package-lock.json` | `frontend/transcription-frontend/package-lock.json` | Dependency lock reference. |
| `next.config.ts` | `frontend/transcription-frontend/next.config.ts` | Next config reference. |
| `tailwind.config.js` | `frontend/transcription-frontend/tailwind.config.js` | Styling config reference. |
| `postcss.config.mjs` | `frontend/transcription-frontend/postcss.config.mjs` | PostCSS config reference. |
| `components.json` | `frontend/transcription-frontend/components.json` | shadcn/ui config reference. |

Reference-only constraints:

| Constraint | Result |
| --- | --- |
| Not imported by active app | Satisfied. The folder is outside `frontend/transcription-frontend/`. |
| Does not create active Next.js routes | Satisfied. The folder is outside the active app root. |
| Active frontend remains in place | Verified by checking active `src/app`, `src/components`, `src/lib`, and `src/config.ts`. |
| Generated/heavy/secret folders excluded | `.next`, `node_modules`, caches, build output, `.env`, uploaded media, model files, and Git metadata were not copied. |

Features preserved for reference:

| Feature | Preserved source |
| --- | --- |
| Dashboard/stat cards | `/`, `src/app/page.tsx` |
| Upload form | `/Transcripts`, `src/app/Transcripts/page.tsx` |
| Transcript list | `/Transcripts/List`, `src/app/Transcripts/List/page.tsx` |
| Transcript details/edit/playback | `/Transcripts/Details`, `src/app/Transcripts/Details/page.tsx` |
| Analysis view | `/Transcripts/Analysis`, `src/app/Transcripts/Analysis/page.tsx` |
| Search | `/Search`, `src/app/Search/page.tsx` |
| PDF export | `/api/export-pdf`, `src/app/api/export-pdf/route.ts`, `src/lib/pdfGenerator.ts` |
| Theme/shared UI | `src/components/`, `src/app/globals.css`, `src/app/layout.tsx` |

Git branch notes:

| Check | Result |
| --- | --- |
| Current branch | `frontend-reimplementation` |
| Worktree before snapshot | Clean |
| Recent HEAD | `63978c5` |
| Remote baseline branch | `origin/frontend-analysis-baseline` exists |
| `develop` branch | Not listed locally or remotely during audit |

## 2. Current Route Inventory

Active frontend root: `frontend/transcription-frontend/src/app/`

| Route | Source file | Purpose | Current UI states | Data dependencies | Backend calls | Direct Qdrant calls | MinIO use | Known bugs | Rebuild decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | `src/app/page.tsx` | Landing/dashboard with stat cards and navigation. | Loading card spinners, Qdrant connection error, retry via reload, light/dark local theme toggle. | Parent and segment Qdrant points. | None. | `GET /collections`, `POST /points/scroll` parents, `POST /points/scroll` segments. | None. | Uses direct Qdrant, no pagination for 10,000 segment cap, local theme state does not update `next-themes`. | Retain workflow, redesign behind `GET /api/stats` or list summary endpoint. |
| `/Transcripts` | `src/app/Transcripts/page.tsx` | Upload audio/video with category, reference, notes, speaker count. | Hydration skeleton, drag-active file drop, selected-file state, success/warning/error toast, delayed navigation. | Form data and backend upload response. | `POST ${BACKEND_URL}/upload`. | None. | Looks for `job_id` but backend returns `file_id`, so details redirect usually falls back to list. `job_id` query param is only displayed. | Retain and point to `POST /api/uploads`. |
| `/Transcripts/List` | `src/app/Transcripts/List/page.tsx` | Transcript list, infinite scroll, filters, local search, delete. | Initial skeleton, error/retry, no results, loading more, delete confirmation, deleting spinner. | Parent points, per-parent segment duration. | None. | Collection check, parent scroll, N+1 segment scrolls, segment delete, parent delete. | None. | Direct delete only removes Qdrant, leaves MinIO objects; client-side sorting/filtering over loaded pages; reads `segments` while workers write `segment_count`; status color misses `transcribed`. | Retain, redesign behind `GET /api/transcripts`; defer delete unless explicitly in rebuild scope. |
| `/Transcripts/Details?job_id=...` | `src/app/Transcripts/Details/page.tsx` | Parent metadata, segments, transcript editing, segment playback, source download, analysis link, PDF export. | Missing job ID, loading skeleton, not found/error, no segments, per-segment saving/saved, audio loading/playing/progress, PDF loading. | Parent payload, segment payloads, MinIO URLs. | None for data; imports `BACKEND_URL` but does not use it. | Parent scroll, paginated segment scroll, payload update for `transcript_text`. | Rewrites `http://minio:9000` to `MINIO_URL` for playback/download. | Direct segment edits bypass validation/audit/embedding refresh; segment fetch capped at 5,000; audio assumes segment URL points to full source file when seeking to original timestamps. | Retain and redesign behind `GET /api/transcripts/{jobId}` and `PATCH /api/transcripts/{jobId}/segments/{segmentId}`. |
| `/Transcripts/Analysis?job_id=...` | `src/app/Transcripts/Analysis/page.tsx` | Analysis trigger/results and PDF export with analysis. | Missing job ID, loading, not found/error, not-ready, analysing, analysis error/retry, animated result reveal, show/hide translation. | Parent analysis payload, segments for PDF. | `POST ${BACKEND_URL}/transcripts/${jobId}/analyse`. | Parent scroll and paginated segment scroll. | None directly. | Reads cached analysis directly from Qdrant; backend analysis persistence is async and may not be immediately visible. | Retain behind `GET /api/transcripts/{jobId}/analysis` and `POST /api/transcripts/{jobId}/analyse`. |
| `/Search` | `src/app/Search/page.tsx` | Search transcript text and group matching segments by parent. | Idle, loading, error, results summary, no-results. | Segment `transcript_text`, parent metadata. | None. | Segment text match scroll and parent lookup scroll. | None. | Qdrant filter uses likely-invalid nested `should`; `match.value` may not be full-text search; no pagination; capped at 50 segments. | Not in requested rebuild scope. Preserve later as optional, do not implement now unless needed. |
| `/api/export-pdf` | `src/app/api/export-pdf/route.ts` | Server-side PDF generation using Puppeteer. | API only: returns PDF or 500 JSON. | Posted parent, segments, format, optional analysis. | None. | None. | None. | Runtime depends on Puppeteer/browser; loads Google Font CSS remotely; generated footer says confidential law enforcement use. | Retain initially; feed structured data from backend and current Next route. |

Navigation and layout observations:

| Area | Current behavior | Rebuild note |
| --- | --- | --- |
| Shared layout | `src/app/layout.tsx` wraps `ThemeProvider`; pages repeat header markup. | Create shared app shell/header once. |
| Theme | Most pages use `next-themes`; dashboard uses local theme state. | Use one global theme toggle. |
| Visual direction | Stone/neutral palette, card-based layout, dark mode, simple headers. | Preserve with cleaner spacing, typography, hierarchy. |
| Dhivehi rendering | Details textarea uses `text-right font-faruma`; PDF uses Noto Sans Thaana and RTL CSS for transcript text. | Keep English UI; render transcript content with Thaana font and `dir="rtl"` where appropriate. |
| Query params | Details and Analysis require `job_id`; Upload displays optional `job_id` only. | Use `/transcripts/{jobId}` route shape later if desired, but API uses path params. |

## 3. Direct Qdrant Access Inventory

Current config: `src/config.ts` exports `QDRANT_URL = 'http://localhost:6333'`.

Every browser-side or Next-side direct Qdrant access found:

| File | Operation class | Endpoint | Method | Request body/filter | Expected response and fields used | Read/write | Replacement Go endpoint |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/app/page.tsx` | Other/readiness | `/collections` | GET | None. | `result.collections[].name` to confirm `file_metadata`. | Read | `GET /api/health` or hide inside `GET /api/stats`. |
| `src/app/page.tsx` | List parent transcript jobs for stats | `/collections/file_metadata/points/scroll` | POST | `limit:1000`, `with_payload:true`, `with_vector:false`, filter `type=parent`. | Parent payload `type`, `status`, `job_id`. | Read | `GET /api/stats` or `GET /api/transcripts?summary=true`. |
| `src/app/page.tsx` | List segment points for duration stats | `/collections/file_metadata/points/scroll` | POST | `limit:10000`, filter `type=segment`. | Segment payload `parent_job_id`, `end_time`. | Read | `GET /api/stats`, computed server-side with pagination. |
| `src/app/Transcripts/List/page.tsx` | Other/readiness | `/collections` | GET | None. | Collection names for error message. | Read | `GET /api/health` or list endpoint handles errors. |
| `src/app/Transcripts/List/page.tsx` | List parent transcript jobs | `/collections/file_metadata/points/scroll` | POST | `limit:10`, optional `offset`, filter `type=parent`. | `result.points[].payload`, `next_page_offset`; fields `job_id`, `filename`, `category`, `reference_number`, `status`, `timestamp`, `speakers`, `segments`, `notes`. | Read | `GET /api/transcripts?page=&pageSize=&search=&status=`. |
| `src/app/Transcripts/List/page.tsx` | List segment points for each parent | `/collections/file_metadata/points/scroll` | POST | `limit:1000`, filter `type=segment` and `parent_job_id=<job_id>`. | Segment `segment_index`, `end_time`. | Read | Include `durationSeconds` and `segmentCount` in `GET /api/transcripts`. |
| `src/app/Transcripts/List/page.tsx` | Delete segment points | `/collections/file_metadata/points/delete` | POST | Filter `type=segment` and `parent_job_id=<job_id>`. | Uses HTTP OK only. | Write/delete | Future `DELETE /api/transcripts/{jobId}` if deletion is retained. Not in requested rebuild scope. |
| `src/app/Transcripts/List/page.tsx` | Delete parent transcript details | `/collections/file_metadata/points/delete` | POST | Filter `type=parent` and `job_id=<job_id>`. | Uses HTTP OK only. | Write/delete | Future `DELETE /api/transcripts/{jobId}` with MinIO cleanup policy. Not in requested rebuild scope. |
| `src/app/Transcripts/Details/page.tsx` | Get parent transcript details | `/collections/file_metadata/points/scroll` | POST | `limit:1`, filter `type=parent` and `job_id=<job_id>`. | Parent payload `job_id`, `filename`, `category`, `reference_number`, `notes`, `minio_url`, `status`, `timestamp`, `speakers`, `local_path`, analysis fields. | Read | `GET /api/transcripts/{jobId}`. |
| `src/app/Transcripts/Details/page.tsx` | List segment points | `/collections/file_metadata/points/scroll` | POST | Loop with `limit:100`, optional `offset`, filter `type=segment` and `parent_job_id=<job_id>`. | Segment payload `segment_index`, `speaker`, `start_time`, `end_time`, `minio_url`, `transcript_text`, `embedding_generated`, `timestamp`, `status`; `next_page_offset`. | Read | `GET /api/transcripts/{jobId}` returns ordered segments, or `GET /api/transcripts/{jobId}/segments`. |
| `src/app/Transcripts/Details/page.tsx` | Update segment transcript text | `/collections/file_metadata/points/payload?wait=true` | POST | Filter `type=segment`, `parent_job_id=<job_id>`, `segment_index=<n>`; payload `{transcript_text}`. | Response logged; UI trusts OK. | Write/update | `PATCH /api/transcripts/{jobId}/segments/{segmentId}`. |
| `src/app/Transcripts/Analysis/page.tsx` | Get analysis fields | `/collections/file_metadata/points/scroll` | POST | `limit:1`, filter `type=parent` and `job_id=<job_id>`. | Parent analysis fields `analysis_status`, `analysis_keywords`, `analysis_entities`, `analysis_summary`, `analysis_classification`, `analysis_english_translation`. | Read | `GET /api/transcripts/{jobId}/analysis`. |
| `src/app/Transcripts/Analysis/page.tsx` | List segment points for export | `/collections/file_metadata/points/scroll` | POST | Loop with `limit:100`, optional `offset`, filter `type=segment` and `parent_job_id=<job_id>`. | Segment `speaker`, `start_time`, `end_time`, `transcript_text`, `segment_index`. | Read | `GET /api/transcripts/{jobId}` or `GET /api/transcripts/{jobId}/export-data`. |
| `src/app/Search/page.tsx` | Other/search | `/collections/file_metadata/points/scroll` | POST | `limit:50`, filter `type=segment` and `transcript_text match value=<term>`. | Segment `parent_job_id`, `speaker`, `start_time`, `end_time`, `transcript_text`, `segment_index`. | Read | Future `GET /api/search?q=&page=&pageSize=`. Out of current rebuild scope unless kept. |
| `src/app/Search/page.tsx` | Get parent transcript details for search | `/collections/file_metadata/points/scroll` | POST | Filter `type=parent` and intended OR over `job_id` values using nested `should` inside `must`; `limit=jobIds.length`. | Parent `job_id`, `filename`, `reference_number`, `category`. | Read | Future `GET /api/search` joins parent metadata server-side. |

Classified Qdrant operations:

| Class | Current locations |
| --- | --- |
| List parent transcript jobs | Dashboard, List. |
| Get parent transcript details | Details, Analysis, Search parent lookup. |
| List segment points | Dashboard, List duration queries, Details, Analysis, Search segment lookup. |
| Update segment transcript text | Details. |
| Get analysis fields | Analysis and Details for PDF inclusion. |
| Update metadata | No browser metadata update except segment `transcript_text`; backend analysis updates parent asynchronously. |
| Other | Collection readiness checks and direct Qdrant delete. |

## 4. Current Backend Endpoint Inventory

Active backend root: `backend/`

Reachable Gin routes:

| Method | Route | Handler | Request schema | Response schema | Auth assumptions | Qdrant operation | MinIO operation | Redis operation | Current frontend consumer | Missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/upload` | `handlers.UploadFile` in `backend/internal/handlers/upload.go` | Multipart `file`; optional `category`, `reference_number`, `notes`, `speakers`. | `file_id`, `filename`, `minio_url`, `local_path`, `status`, `category`, `reference_number`, `notes`, `speakers`. | None; CORS allows `*`. | Inserts parent point into `file_metadata` with zero vector; logs Qdrant failure but still returns success. | Saves to `/tmp`, uploads to `uploads/{uuid}_{filename}`; public bucket policy comes from startup. | `LPUSH conversion_queue` with `file_id`, `minio_url`, `filename`; logs failure but still returns success. | `/Transcripts` upload page. | Should return canonical `jobId`, fail atomically if Qdrant/Redis critical steps fail, validate upload, remove temp file, avoid browser-internal MinIO URL leakage. |
| POST | `/transcripts/:job_id/analyse` | `handlers.AnalyseTranscript` in `backend/internal/handlers/analyse.go` | Path `job_id`, no body. | `keywords`, `entities`, `summary`, `classification`, `english_translation`. | None; CORS allows `*`. | Scrolls up to 1000 segments; async parent payload update with analysis fields. | None. | None. | `/Transcripts/Analysis`. | Analysis URL hard-coded, no timeout, no parent existence check, no pagination beyond 1000, persistence can fail after success, no `GET` cached analysis endpoint. |

Defined but unreachable routes:

| Method | Route | Handler | Why unreachable | Notes |
| --- | --- | --- | --- | --- |
| GET | `/transcripts` | `handleListTranscripts` in `cmd/backend/main.go` | Registered after blocking `r.Run`; uses default `net/http` mux, not Gin. | Optional `status` query; Qdrant parent scroll limit 100; no pagination; CORS preflight order is wrong. |
| GET | `/transcripts/stats` | `handleTranscriptStats` in `cmd/backend/main.go` | Registered after blocking `r.Run`; uses default `net/http` mux, not Gin. | Counts `completed`, `processing`, `uploaded`, `error`, but workers use `transcribed` and failure statuses. |

Unregistered handlers:

| Intended route | Handler | Notes |
| --- | --- | --- |
| `GET /api/stats` | `handlers.GetStatsHandler` | Not registered. |
| `GET /api/transcripts` | `handlers.GetAllTranscriptsHandler` | Not registered. |
| `GET /api/transcripts?status=completed` | `handlers.GetTranscriptsByStatusHandler` | Not registered. |

Health/media endpoints:

| Endpoint type | Current state |
| --- | --- |
| Backend health/readiness | None. |
| Backend media streaming/proxy | None. Browser reads MinIO directly after URL rewrite. |
| File/media access | MinIO public read URLs only. |

Backend initialization behavior:

| System | Current behavior | Rebuild note |
| --- | --- | --- |
| MinIO | Creates `uploads` and `audio`, sets public read policy. | Decide whether to keep public-read for FYP/demo or move to presigned/backend media paths. |
| Qdrant | Creates `file_metadata` collection if missing with 512-dim cosine vectors. | Keep djb2 ID scheme synchronized with workers. |
| Redis | Connects and pings at startup. | Upload endpoint should treat enqueue failure as an upload failure or explicit degraded state. |

## 5. Missing Endpoints

Required for the rebuilt current scope:

| Need | Current source workaround | Required endpoint |
| --- | --- | --- |
| Upload with canonical job summary | `POST /upload` returns `file_id`; frontend guesses job key. | `POST /api/uploads`. |
| Paginated transcript list | Browser Qdrant scroll and client filters. | `GET /api/transcripts`. |
| Dashboard stats | Browser Qdrant aggregate. | `GET /api/stats` or stats included in list response. |
| Transcript details with ordered segments | Browser parent and segment scrolls. | `GET /api/transcripts/{jobId}`. |
| Segment edit | Browser Qdrant payload update. | `PATCH /api/transcripts/{jobId}/segments/{segmentId}`. |
| Cached analysis read | Browser reads parent analysis fields. | `GET /api/transcripts/{jobId}/analysis`. |
| Run analysis | Existing route lacks `/api`, timeout/config, persistence guarantees. | `POST /api/transcripts/{jobId}/analyse`. |
| PDF export data | UI posts current in-memory Qdrant data to Next route. | Use `GET /api/transcripts/{jobId}` or dedicated export-data endpoint before calling Next PDF route. |
| Safe media URL | Browser rewrites internal MinIO host. | Return `mediaUrl` as presigned URL or backend media path. |

Deletion/search are current features, but they are not listed in this rebuild stage. If retained later, add `DELETE /api/transcripts/{jobId}` and `GET /api/search` only after cleanup/search semantics are decided.

## 6. Proposed API Contract

Base path: `/api`

Endpoint list:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/uploads` | Accept media upload and metadata, write MinIO, create parent Qdrant point, enqueue conversion, return created job summary. |
| POST | `/api/auth/change-password` | Authenticated self-service password change for the current user; revokes other sessions and preserves current session. |
| GET | `/api/transcripts` | Return paginated parent transcript jobs only, with search/status/newest-first support. |
| GET | `/api/transcripts/{jobId}` | Return parent metadata, ordered segments, media access path, processing status, speaker data, and analysis summary status. |
| PATCH | `/api/transcripts/{jobId}/speakers` | Persist a display name mapping for a generated speaker key on the parent transcript payload. |
| PATCH | `/api/transcripts/{jobId}/segments/{segmentId}` | Update editable segment fields, initially only `transcript_text`, after validating ownership. |
| GET | `/api/admin/transcripts/{jobId}/deletion-preview` | Admin-only safe preview for transcript deletion, including counts and blocking state. |
| DELETE | `/api/admin/transcripts/{jobId}` | Admin-only confirmed deletion of transcript Qdrant points, referenced media objects, and safe job-scoped queue metadata. |
| POST | `/api/transcripts/{jobId}/analyse` | Run analysis for transcribed transcript and persist result. |
| GET | `/api/transcripts/{jobId}/analysis` | Return stored analysis without rerunning analysis worker. |
| GET | `/api/stats` | Optional dashboard endpoint for counts and total duration. |
| GET | `/api/health` | Optional backend readiness endpoint for frontend/developer diagnostics. |

Password change request:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `currentPassword` | string | yes | Existing password for authenticated user. |
| `newPassword` | string | yes | Must satisfy backend password policy and differ from current password. |
| `confirmPassword` | string | yes | Must exactly match `newPassword`. |

Password change response:

| Field | Type | Notes |
| --- | --- | --- |
| `message` | string | Success message. |
| `reauthenticationRequired` | boolean | Current implementation returns `false`; current session is preserved while other sessions are revoked. |

Password change errors use the standard API error envelope and may return `INVALID_CURRENT_PASSWORD`, `PASSWORD_CONFIRMATION_MISMATCH`, `PASSWORD_POLICY_FAILED`, `PASSWORD_UNCHANGED`, `TOO_MANY_LOGIN_ATTEMPTS`, `BAD_REQUEST`, or `UNAUTHENTICATED`.

Speaker rename request:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `speakerKey` | string | yes | Generated stable speaker key, such as `SPEAKER_00`; must exist on the transcript's segments. |
| `displayName` | string | yes | Trimmed display label, 1-80 characters, no control characters. Set equal to `speakerKey` to reset. |

Speaker rename response:

| Field | Type | Notes |
| --- | --- | --- |
| `speakerKey` | string | Stable generated key that was updated. |
| `displayName` | string | Normalized display name after update, or generated key after reset. |
| `speakerNames` | object | Full parent transcript speaker mapping after update. |
| `reset` | boolean | `true` when the mapping was removed and rendering should fall back to the generated label. |

Speaker names are stored as `speaker_names` on the parent transcript payload. Segment payload `speaker` values remain unchanged.

Admin transcript deletion preview response:

| Field | Type | Notes |
| --- | --- | --- |
| `jobId` | string | Transcript job ID. |
| `filename` | string | Parent transcript filename. |
| `owner` | object | Safe owner display name and email when present. |
| `segmentCount` | number | Number of segment points found for the transcript. |
| `mediaObjects` | number | Count of validated referenced media objects. |
| `status` | string | Public/admin transcript status. |
| `canDelete` | boolean | `false` when transcript is processing or queued/processing. |
| `blockingReason` | string/null | `TRANSCRIPT_PROCESSING` when deletion is blocked. |

Admin transcript delete request:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `confirmation` | string | yes | Must exactly equal the `jobId`; mismatches return `DELETE_CONFIRMATION_MISMATCH`. |

Deletion removes referenced MinIO objects, Qdrant segments, Qdrant parent, and narrow job-scoped queued/failed Redis metadata. Partial failures return `TRANSCRIPT_DELETION_PARTIAL` with safe cleanup category names only.

Upload request:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `file` | file | yes | Audio/video media. |
| `category` | string | no | Existing categories remain English. |
| `referenceNumber` or `reference_number` | string | no | Prefer camelCase in new API; accept snake_case during transition if needed. |
| `notes` | string | no | Free text metadata. |
| `requestedSpeakers` | number | no | Maps from existing `speakers`; diarization may ignore initially. |

Transcript list query:

| Query | Type | Default | Notes |
| --- | --- | --- | --- |
| `page` | integer | `1` | 1-based page for frontend simplicity. |
| `pageSize` | integer | `20` | Clamp to sane max, such as 100. |
| `search` | string | empty | Search parent filename/reference/notes initially. Full transcript search can be later endpoint. |
| `status` | string | empty | Canonical public statuses. |
| `sort` | string | `newest` | Newest-first ordering by created timestamp. |

Segment update request:

```json
{
  "transcriptText": "މިއީ އެޑިޓް ކުރެވުނު ޓެކްސްޓެއް"
}
```

Analysis endpoints:

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/transcripts/{jobId}/analyse` | Trigger analysis using existing analysis service; set `analysisStatus` to `processing` then `complete`/`failed` if implemented. |
| GET | `/api/transcripts/{jobId}/analysis` | Return stored parent analysis fields only; never rerun worker. |

PDF export architecture:

| Decision | Rationale |
| --- | --- |
| Keep current Next.js `/api/export-pdf` initially. | It is already implemented and isolated from Qdrant/MinIO. |
| Feed it structured data from Go backend responses. | Browser no longer needs Qdrant access. |
| Avoid moving PDF generation into Go in this stage. | Puppeteer/browser runtime is already wired in frontend package; moving it increases scope. |

## 7. DTO Definitions

Frontend-facing JSON should use camelCase.

### TranscriptSummary

```json
{
  "jobId": "uuid",
  "filename": "recording.wav",
  "category": "meeting",
  "referenceNumber": "REF-001",
  "notes": "optional note",
  "status": "transcribed",
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:10:00Z",
  "durationSeconds": 83.2,
  "speakerCount": 2,
  "segmentCount": 8,
  "analysisStatus": "complete"
}
```

### TranscriptDetail

```json
{
  "jobId": "uuid",
  "filename": "recording.wav",
  "category": "meeting",
  "referenceNumber": "REF-001",
  "notes": "optional note",
  "status": "transcribed",
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:10:00Z",
  "mediaUrl": "http://localhost:9000/uploads/object.wav",
  "durationSeconds": 83.2,
  "speakerCount": 2,
  "segmentCount": 8,
  "speakers": ["SPEAKER_00", "SPEAKER_01"],
  "analysisStatus": "complete",
  "analysis": null,
  "segments": []
}
```

### Segment

```json
{
  "segmentId": "uuid_seg_000",
  "segmentIndex": 0,
  "speaker": "SPEAKER_00",
  "startTime": 0.0,
  "endTime": 12.4,
  "mediaUrl": "http://localhost:9000/uploads/object.wav",
  "transcriptText": "ޓެކްސްޓް",
  "status": "transcribed",
  "createdAt": "2026-07-15T00:00:00Z",
  "updatedAt": "2026-07-15T00:10:00Z",
  "editable": true
}
```

### Analysis

```json
{
  "status": "complete",
  "summary": "English summary",
  "keywords": ["keyword"],
  "entities": {
    "persons": [],
    "locations": [],
    "organizations": [],
    "events": []
  },
  "classification": "general_discussion",
  "englishTranslation": "English translation",
  "updatedAt": "2026-07-15T00:12:00Z"
}
```

### UploadResult

```json
{
  "job": {
    "jobId": "uuid",
    "filename": "recording.wav",
    "category": "meeting",
    "referenceNumber": "REF-001",
    "notes": "optional note",
    "status": "uploaded",
    "createdAt": "2026-07-15T00:00:00Z",
    "speakerCount": 0,
    "segmentCount": 0,
    "analysisStatus": "not_started"
  }
}
```

### Pagination

```json
{
  "items": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNextPage": false,
    "nextCursor": null
  }
}
```

### Standard API Error

```json
{
  "error": {
    "code": "not_found",
    "message": "Transcript not found",
    "details": null
  }
}
```

## 8. Qdrant to API Field Mapping

Parent fields:

| Qdrant key | API key | Required | Default | Frontend usage | Public | Editable |
| --- | --- | --- | --- | --- | --- | --- |
| `job_id` | `jobId` | yes | none | Route identity, detail/list links, analysis/edit ownership. | yes | no |
| `filename` | `filename` | yes | `Unknown` | Display title, PDF filename, list search. | yes | no |
| `category` | `category` | no | `Uncategorized` | List/detail metadata and filters. | yes | future metadata edit only |
| `reference_number` | `referenceNumber` | no | `N/A` | List/detail/PDF/search metadata. | yes | future metadata edit only |
| `notes` | `notes` | no | empty string | List/detail metadata and search. | yes | future metadata edit only |
| `minio_url` | `mediaUrl` | no | null | Playback/download. | yes, but preferably safe URL/path | no |
| `local_path` | not exposed | no | none | None; internal temp path. | no | no |
| `status` | `status` | yes | `uploaded` | List/detail badges, readiness for analysis. | yes | no |
| `speakers` | `requestedSpeakerCount` or `speakerCount` fallback | no | 0 | Upload metadata and display fallback. | yes | no |
| `segment_count` | `segmentCount` | no | count from segments | List/detail counts. | yes | no |
| `segments` | `segmentCount` legacy fallback | no | count from segments | Legacy list reader only. | yes | no |
| `timestamp` | `createdAt` | yes | upload time | Dates in list/detail/PDF. | yes | no |
| `diarization_completed_at` | `diarizationCompletedAt` | no | null | Processing diagnostics/status. | yes | no |
| `transcription_completed_at` | `transcriptionCompletedAt` | no | null | Processing diagnostics/status. | yes | no |
| `diarization_error` | `processingError` | no | null | Error display if failed. | yes, bounded | no |
| `transcription_error` | `processingError` | no | null | Error display if failed. | yes, bounded | no |
| `analysis_status` | `analysisStatus` | no | `not_started` | Analysis button/result state. | yes | no |
| `analysis_keywords` | `analysis.keywords` | no | `[]` | Analysis results/PDF. | yes | no |
| `analysis_entities` | `analysis.entities` | no | typed empty groups | Analysis results/PDF. | yes | no |
| `analysis_summary` | `analysis.summary` | no | empty string | Analysis results/PDF. | yes | no |
| `analysis_classification` | `analysis.classification` | no | empty string | Analysis results/PDF. | yes | no |
| `analysis_english_translation` | `analysis.englishTranslation` | no | empty string | Analysis results/PDF optional. | yes | no |

Segment fields:

| Qdrant key | API key | Required | Default | Frontend usage | Public | Editable |
| --- | --- | --- | --- | --- | --- | --- |
| point id / deterministic id | `segmentId` | yes | derived from `{jobId}_seg_{index}` if absent | PATCH identity. | yes as opaque string | no |
| `parent_job_id` | `jobId` or omitted in nested detail | yes | none | Ownership validation. | no if nested | no |
| `segment_index` | `segmentIndex` | yes | 0 | Ordering, display, PDF. | yes | no |
| `speaker` | `speaker` | yes | `Unknown` | Segment header, grouping, speaker count. | yes | no |
| `start_time` | `startTime` | yes | 0 | Playback seek, timestamps, PDF. | yes | no |
| `end_time` | `endTime` | yes | 0 | Playback stop, duration, timestamps, PDF. | yes | no |
| `minio_url` | `mediaUrl` | no | parent media URL | Playback. | yes, but preferably safe URL/path | no |
| `transcript_text` | `transcriptText` | no | empty string or pending placeholder at UI layer | Transcript content, edit, PDF, analysis. | yes | yes |
| `status` | `status` | yes | `pending_transcription` | Segment state display/editability. | yes | no |
| `timestamp` | `createdAt` | no | null | Optional diagnostics. | yes | no |
| `transcription_completed_at` | `updatedAt` | no | null | Optional diagnostics. | yes | no |
| `embedding_generated` | not exposed initially | no | false | No current UI need; edits can make embeddings stale. | no | no |
| `transcription_error` | `error` | no | null | Future failed segment display. | yes, bounded | no |

Do not expose:

| Internal value | Reason |
| --- | --- |
| Qdrant numeric IDs | Implementation detail and precision risk in JavaScript. |
| Vectors | Not needed and potentially large/sensitive. |
| Raw MinIO credentials or bucket policies | Secret/security boundary. |
| Raw Redis queue payloads | Internal orchestration detail. |
| Local temp paths | Host/container detail. |

## 9. Backend Architecture Recommendation

Keep the backend simple and focused.

Recommended package structure:

| Package | Responsibility |
| --- | --- |
| `internal/handlers` | Gin HTTP handlers, request binding, response status, error envelope. |
| `internal/services` | Orchestration: upload transaction, transcript detail assembly, analysis workflow. |
| `internal/models` or `internal/dtos` | API request/response structs with camelCase JSON tags. |
| `internal/repositories` or focused Qdrant methods in `services` | Qdrant scroll/filter/upsert/delete helpers and pagination. |
| `internal/storage` optional | MinIO URL/presign/proxy helpers if the service layer becomes crowded. |

Placement of logic:

| Concern | Recommended location |
| --- | --- |
| Pagination parsing/clamping | Handler parses query; service/repository applies Qdrant cursor/limit. |
| Qdrant filters | Repository/Qdrant service methods, not handlers. |
| DTO mapping | Service layer or small mapper functions close to DTO definitions. |
| Request validation | Handler for syntax/required fields; service for ownership/state rules. |
| Error standardization | Handler helper that maps typed service errors to `{error:{code,message,details}}`. |
| MinIO URLs | Service/storage layer returns browser-safe `mediaUrl`; avoid frontend host rewriting. |
| Segment ownership validation | Segment update service fetches/checks `parent_job_id` before update. |

Media URL recommendation:

| Option | Recommendation |
| --- | --- |
| Public MinIO URL | Acceptable short-term for local FYP/demo if already public, but backend should still return browser-safe URLs. |
| Presigned URL | Better near-term if buckets stop being public. Use short expiry and refresh on detail load. |
| Backend streaming | More control and hides MinIO entirely, but higher backend bandwidth. Consider later if access control is added. |

## 10. Frontend Implementation Stages

Do not start the full rebuild in this archive-and-audit stage. When approved, implement in this order.

| Stage | Files/routes to create or replace | Backend endpoints required | Reusable components | States | Test data | Completion criteria |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Shared layout and design system | Replace repeated headers in `src/app/layout.tsx` and page shells; add shared `AppHeader`, `ThemeToggle`, page container components. | Optional `GET /api/health`. | Header, navigation, stat card, status badge, empty/error/loading panels. | Hydration-safe theme, mobile nav, global error style. | Static mocked props. | Visual direction preserved; no direct Qdrant imports introduced. |
| 2. Upload page | Rebuild `/Transcripts` or normalize to `/upload` later; keep current route initially. | `POST /api/uploads`. | File dropzone, metadata form, toast/alert. | Empty, drag, file selected, uploading, success, error. | Small audio/video fixture through mock stack. | Upload returns `job.jobId`; frontend navigates deterministically. |
| 3. Transcript list | Replace `/Transcripts/List` data layer and refine UI. | `GET /api/transcripts`; optional `GET /api/stats`. | List card/table, filters, pagination controls, search input, status badge. | Loading, error/retry, empty, no-filter-results, paginating. | Parent jobs in Qdrant from mock pipeline. | No browser Qdrant calls; page/pageSize/status/search work. |
| 4. Transcript details/editor | Replace `/Transcripts/Details`. | `GET /api/transcripts/{jobId}`, `PATCH /api/transcripts/{jobId}/segments/{segmentId}`. | Metadata card, segment editor, audio player control, save indicator. | Missing ID, loading, not found, no segments, saving/saved/error, playback states. | Mock segments with Dhivehi text and MinIO URL. | Thaana text renders RTL; edits persist through backend; audio controls stable. |
| 5. Analysis | Replace `/Transcripts/Analysis` data layer. | `GET /api/transcripts/{jobId}/analysis`, `POST /api/transcripts/{jobId}/analyse`. | Analysis panel, entity groups, classification badge, translation disclosure. | Not ready, no analysis, analysing, complete, failed/retry. | Transcribed mock transcript and analysis service fallback. | Stored analysis loads without rerun; run action persists and displays result. |
| 6. PDF export | Keep `src/app/api/export-pdf/route.ts`; feed from backend detail/analysis DTOs. | `GET /api/transcripts/{jobId}` and `GET /api/transcripts/{jobId}/analysis`. | Existing `PdfExportModal`, PDF helper, export data mapper. | Modal open, generating, error. | Transcript with Dhivehi content and optional analysis. | PDF exports segmented and paragraph formats with correct Thaana/RTL rendering. |
| 7. End-to-end integration with mocks | Keep active routes; run against dev stack only. | All above. | Shared API client. | Full pipeline loading/status transitions. | Go backend, Qdrant, MinIO, Redis, mock workers, lightweight analysis. | Upload to mock completion to analysis to PDF works without real Gradio ML workers. |

Frontend design constraints:

| Constraint | Plan |
| --- | --- |
| Preserve current visual direction | Keep neutral/stone palette, card layout, dark mode, simple app header. |
| English UI | Keep labels, navigation, buttons, errors in English. |
| Dhivehi transcript content only | Apply Thaana font and RTL to transcript text areas, transcript display, and PDF transcript content. |
| Responsive layout | Use current `max-w-*`, grid, and breakpoint style with more consistent spacing. |
| Accessibility | Use semantic buttons/labels, focus states, disabled states, `aria` where modals/audio controls need it. |

## 11. Local Mock-Based Development Topology

Use lightweight services only for integration.

Recommended topology:

| Service | Source | Port | Purpose |
| --- | --- | --- | --- |
| Next.js frontend | `frontend/transcription-frontend` | `3000` | Browser UI. |
| Go backend | `backend` | `8000` | API boundary for upload/transcripts/analysis. |
| Redis | `redis:7` | `6379` | Pipeline queues. |
| Qdrant | `qdrant/qdrant` | `6333`, `6334` | Metadata store. |
| MinIO | `minio/minio` | `9000`, `9001` | Uploaded media. |
| Mock conversion | `mock_workers/mock_convert.py` | none | Dev conversion stage. |
| Mock diarization | `mock_workers/mock_diarization.py` | none | Dev segment creation. |
| Mock transcription | `mock_workers/mock_transcription.py` | none | Dev Dhivehi transcript text. |
| Lightweight analysis | `gradio/analysis/analysis.py` | `7861` | Gemini/fallback analysis service. |

Compose file:

| File | Use |
| --- | --- |
| `compose.dev.yml` | Recommended for backend integration because it uses mock workers and includes `analysis`. |
| `compose.yml` | Do not use for frontend rebuild integration because it starts real Gradio conversion/diarization/transcription workers and lacks `analysis`. |

Do not run real Gradio ML workers during frontend rebuild integration.

Ports:

| Port | Service |
| --- | --- |
| `3000` | Next.js dev server, run manually with `npm run dev`. |
| `8000` | Go backend. |
| `6379` | Redis. |
| `6333` | Qdrant HTTP. |
| `6334` | Qdrant gRPC. |
| `9000` | MinIO API. |
| `9001` | MinIO console. |
| `7861` | Analysis service. |

Environment variables:

| Variable | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend rebuild | Recommended replacement for hard-coded `BACKEND_URL`; default `http://localhost:8000/api`. |
| `MINIO_ENDPOINT` | Backend | `minio:9000` in Compose. |
| `MINIO_ACCESS_KEY` | Backend | Current dev value `minio`. |
| `MINIO_SECRET_KEY` | Backend | Current dev value `minio123`; do not expose to frontend. |
| `QDRANT_HOST` | Backend/mock workers | `http://qdrant:6333` in Compose. |
| `REDIS_HOST`, `REDIS_PORT` | Backend/mock workers | `redis`, `6379`. |
| `GEMINI_API_KEY` | Analysis | Optional; analysis has fallback behavior. |

Seed/test data strategy:

| Strategy | Notes |
| --- | --- |
| Upload through UI/backend | Preferred because it exercises MinIO, Qdrant parent creation, Redis queue, and mock workers. |
| Mock worker-generated segments | Use dev stack to create schema-compatible segment data. |
| Static frontend fixtures | Use only for isolated component development before API is ready. |
| Avoid direct Qdrant writes from frontend | Required migration goal. |

Media URL behavior:

| Current | Target |
| --- | --- |
| Frontend rewrites `http://minio:9000` to `MINIO_URL`. | Backend returns browser-safe `mediaUrl`, presigned URL, or backend media path. |

Recommended later Compose adjustments:

| Adjustment | Reason |
| --- | --- |
| Add backend `REDIS_HOST`/`REDIS_PORT` to `compose.yml`. | Current backend defaults work, but explicit is clearer. |
| Add backend `depends_on` for Redis and Qdrant in `compose.yml`. | Backend requires both at startup. |
| Add health checks/readiness. | Avoid startup races. |
| Add frontend service/profile later. | Not needed for this audit stage. |
| Keep real workers behind prod-only profile. | Prevent accidental ML worker startup during UI work. |

## 12. Risks and Migration Notes

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Direct Qdrant removal changes all data flows at once. | Rebuild can break list/details/edit/search if endpoint contract is incomplete. | Implement backend endpoints first with DTO tests or curl fixtures; switch one page at a time. |
| Status vocabulary mismatch. | List/stats/analysis readiness can be wrong. | Canonicalize public statuses while preserving raw internal status if needed. |
| `segment_count` vs `segments`. | Segment counts display as zero today. | Backend maps both and falls back to counting segments. |
| Upload response shape mismatch. | Current upload redirects to list instead of details. | New upload returns `job.jobId`. |
| Media URL exposure. | Browser may not resolve Docker hostnames; public MinIO is broad. | Backend returns safe browser URL; later move to presigned/backend streaming. |
| PDF runtime. | Puppeteer may fail in deployment. | Validate separately; keep PDF route isolated. |
| Analysis service topology. | Production Compose lacks `analysis`. | Use dev stack for rebuild; decide production analysis topology later. |
| Search semantics. | Current Qdrant match may not be substring/full-text. | Defer Search because not in requested rebuild scope. |
| Existing unrelated/frontend changes | Worktree may contain user changes in future. | Avoid reverting or rewriting; snapshot is additive. |

## 13. Explicit Out of Scope

Do not add in this stage:

| Feature | Status |
| --- | --- |
| Authentication/authorization | Out of scope. |
| User management | Out of scope. |
| Settings | Out of scope. |
| Dashboards beyond current basic stats | Out of scope. |
| Administration | Out of scope. |
| Full visual redesign | Out of scope. |
| Full UI rebuild | Out of scope for archive-and-audit stage. |
| Real Gradio worker startup | Out of scope. |
| Worker/image/model/cache changes | Out of scope. |
| Qdrant/MinIO/Redis data mutation | Out of scope. |

## 14. Backend API Extension Implemented

Implementation date: 2026-07-15

Files implemented or modified:

| File | Change |
| --- | --- |
| `backend/cmd/backend/main.go` | Fixed route registration order so existing and new routes are registered before the single final `r.Run(":8000")`. |
| `backend/internal/dtos/api.go` | Added frontend-facing DTOs and standard API error envelope. |
| `backend/internal/handlers/api.go` | Added Gin handlers for health, stats, transcript list/detail, segment update, stored analysis, and legacy transcript endpoints. |
| `backend/internal/handlers/api_helpers.go` | Added standardized safe API error responses. |
| `backend/internal/services/api_errors.go` | Added typed service errors for handler mapping. |
| `backend/internal/services/transcript_api.go` | Added focused Qdrant scroll/update methods, DTO mapping, stats calculation, media URL translation, and readiness checks. |
| `backend/internal/services/transcript_api_test.go` | Added focused service tests for pagination, DTO defaults/status mapping, analysis defaults, media URL translation, and segment ownership validation. |
| `backend/internal/handlers/api_helpers_test.go` | Added standard error response test. |
| `backend/go.mod`, `backend/go.sum` | Updated `go-redis` to a Windows-buildable version after `v9.15.1` failed to compile on Windows. |
| `compose.yml`, `compose.dev.yml` | Added backend `MINIO_PUBLIC_URL=http://localhost:9000` for browser-safe media URLs in DTOs. |

Existing components reused:

| Component | Reuse |
| --- | --- |
| Gin router | Preserved. |
| Existing middleware | Preserved CORS behavior and semantics. |
| `POST /upload` | Preserved unchanged. |
| `POST /transcripts/:job_id/analyse` | Preserved unchanged. |
| MinIO global client | Reused for health checks; upload flow unchanged. |
| Redis global client | Reused for health checks; queue logic unchanged. |
| Qdrant HTTP style | Reused and extended with focused helper methods. |
| djb2 ID strategy | Preserved unchanged. |

New routes implemented:

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Returns backend readiness plus Qdrant/Redis/MinIO dependency status; no worker dependency. |
| GET | `/api/stats` | Returns transcript/status/analysis/segment counts from Qdrant. |
| GET | `/api/transcripts` | Returns paginated parent-only transcript summaries with `page`, `pageSize`, `search`, and `status`. |
| GET | `/api/transcripts/:jobId` | Returns parent metadata plus all ordered segments. |
| PATCH | `/api/transcripts/:jobId/segments/:segmentId` | Updates only `transcriptText` after parent, segment, and ownership validation. |
| GET | `/api/transcripts/:jobId/analysis` | Returns stored analysis fields only; does not call the analysis worker. |

Legacy routes now registered before startup:

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/transcripts` | Preserved through Gin handler wrapping existing transcript list service. |
| GET | `/transcripts/stats` | Preserved through Gin handler wrapping existing stats service. |

Remaining endpoints for later stages:

| Endpoint | Reason deferred |
| --- | --- |
| `POST /api/uploads` | Out of scope for this incremental extension; current upload route remains `/upload`. |
| `POST /api/transcripts/:jobId/analyse` | Out of scope for this extension; current analysis trigger remains `/transcripts/:job_id/analyse`. |
| Search endpoint | Out of scope. |
| Delete endpoint | Out of scope. |
| PDF changes | Out of scope. |

Media URL approach:

| Choice | Details |
| --- | --- |
| Configured public URL translation | DTO mapping replaces stored MinIO scheme/host with `MINIO_PUBLIC_URL` when configured. |
| Current Compose value | `MINIO_PUBLIC_URL=http://localhost:9000` for backend service in both Compose files. |
| Data mutation | Stored Qdrant `minio_url` values are not changed by GET requests. |

Validation rules added:

| Area | Rule |
| --- | --- |
| Pagination | Defaults to `page=1`, `pageSize=20`, clamps maximum `pageSize=100`. |
| Segment edit | Request body must contain only `transcriptText`. |
| Segment ownership | Parent must exist, segment must exist, and `parent_job_id` must match `jobId`. |
| Qdrant exposure | DTOs do not expose vectors or numeric point IDs. |
| Analysis GET | Returns stored/default analysis only; no worker call and no Qdrant mutation. |

## 15. Implementation Boundary Confirmation

This backend extension stage added frontend-facing Go API endpoints and documentation updates. It did not modify the active frontend, transcription, diarization, conversion, analysis workers, Docker images, model caches, Redis queues, MinIO data, Qdrant data, or Docker volumes.
## Live Processing Status Addition

Added authenticated transcript status polling API:

```http
GET /api/transcripts/:jobId/status
```

The endpoint returns `jobId`, normalized `status`, `stage`, `isTerminal`, `updatedAt`, and nullable safe failure fields. Standard users can only access owned transcript status; admins can access all transcript status. Upload, Transcript List, and Transcript Details poll this endpoint or refresh the current list page approximately every 3 seconds while work is non-terminal, abort on unmount, skip hidden-tab requests, and stop on terminal status.

## Transcript Discovery And Export Addition

Search endpoint remains `GET /api/search/transcripts` and now accepts optional `q`, `filename`, `reference`, `category`, `status`, `ownerUserId`, `createdFrom`, `createdTo`, `speaker`, `page`, and `pageSize`. Standard users search owned transcripts only. Admins may search all transcripts and use `ownerUserId`. Invalid dates/status values return safe `400` errors.

Search results include public metadata and, for segment matches, `segmentId`, `segmentIndex`, `speaker`, `speakerDisplayName`, `startTime`, `endTime`, and `matchedText`. Metadata-only results omit `segmentId`. Segment result links use `/Transcripts/Details?job_id=<jobId>&segment_id=<segmentId>`; Details scrolls/highlights the stable segment ID once after load without autoplay.

Authenticated downloads are available at `GET /api/transcripts/:jobId/download?format=txt|json|srt|vtt`. The backend generates UTF-8 TXT, JSON, SRT, and WebVTT from authorized transcript data only, with safe filenames and appropriate content types. Download audit actions are `transcript_download_succeeded` and `transcript_download_failed` with safe metadata limited to `jobId` and `format`.
