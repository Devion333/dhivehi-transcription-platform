# Frontend End-To-End Integration

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Environment

| Item | Value |
| --- | --- |
| Frontend | `http://localhost:3000`, temporary `npm run dev` process. |
| Backend | `http://localhost:8000`, Docker service `backend`. |
| Qdrant | `http://localhost:6333`, Docker service `qdrant`. |
| MinIO | API `http://localhost:9000`, console `http://localhost:9001`, Docker service `minio`. |
| Redis | `localhost:6379`, Docker service `redis`. |
| Analysis | `http://localhost:7861`, Docker service `analysis`. |
| Compose file | `compose.dev.yml` only. |

No real conversion, diarization, transcription, GPU, or model services were started.

## Services Started

Started with:

```cmd
docker compose -f compose.dev.yml up -d
```

Running services:

| Service | Result |
| --- | --- |
| `backend` | Running after rebuild. |
| `redis` | Running, `redis-cli ping` returned `PONG`. |
| `qdrant` | Running, collection `file_metadata` status `green`. |
| `minio` | Running, buckets `uploads` and `audio` present. |
| `mock_convert` | Running, processed integration jobs. |
| `mock_diarization` | Running, created 4 mock segments. |
| `mock_transcription` | Running, wrote Dhivehi mock transcript text. |
| `analysis` | Running on port `7861`, processed analysis request. |

## Integration Record

Final record used for validation:

| Field | Value |
| --- | --- |
| Test media | `C:\Users\Dell\AppData\Local\Temp\opencode\integration-test-audio.wav` |
| Filename | `integration-test-audio.wav` |
| Duration | 20 seconds silent PCM WAV. |
| Size | `320044` bytes. |
| Category | `Integration Test` |
| Reference | `E2E-TEST-001` |
| Notes | `Temporary frontend integration record` |
| Requested speakers | `2` |
| Job ID | `d759bdb3-9e64-4ffb-992c-aa70a32d4622` |

Earlier diagnostic record also exists because the first one-second test media was too short for segment playback validation:

| Job ID | Note |
| --- | --- |
| `22d82490-67c6-44f8-812a-698e0d479d16` | Kept as requested; not deleted. |

## Upload Result

`POST /api/uploads` returned `201 Created` with camelCase job envelope and `job.jobId`.

Observed job status progression through APIs and worker logs:

```text
uploaded -> diarized -> transcribed
```

MinIO object exists and is browser-accessible at:

```text
http://localhost:9000/uploads/d759bdb3-9e64-4ffb-992c-aa70a32d4622_integration-test-audio.wav
```

## Worker Pipeline Result

| Check | Result |
| --- | --- |
| Conversion queue | Drained to `0`. |
| Diarization queue | Drained to `0`. |
| Transcription queue | Drained to `0`. |
| Processing queues | Drained to `0`. |
| Parent Qdrant metadata | Present through backend detail API. |
| Segment count | `4`. |
| Segment statuses | All `transcribed`. |
| Worker restarts | No restart loop observed. |

## Dashboard Result

`/` loaded at desktop and mobile widths with no console errors. Stats loaded from `/api/stats` and reflected the integration records.

Observed final stats:

```json
{"totalTranscripts":6,"uploaded":2,"diarized":0,"transcribed":4,"failed":0,"analysisComplete":4,"totalSegments":16}
```

## List Result

`/Transcripts/List?search=E2E-TEST-001` loaded at desktop and mobile widths.

Verified:

| Check | Result |
| --- | --- |
| Search by filename | Returned integration records. |
| Search by reference | Returned integration records. |
| Search by category | Returned integration records. |
| Status filter | `transcribed` returned final integration record. |
| URL state | Query parameters preserved on page load. |
| Details link | Opens `/Transcripts/Details?job_id=<jobId>`. |
| Browser Qdrant calls | None detected. |

## Details, Audio, And Edit Result

`/Transcripts/Details?job_id=d759bdb3-9e64-4ffb-992c-aa70a32d4622` loaded at desktop and mobile widths.

Verified:

| Check | Result |
| --- | --- |
| Metadata | Matches upload input. |
| Segment ordering | `0, 1, 2, 3`. |
| Segment count | `4`. |
| Dhivehi text | Native Thaana rendered in page. |
| RTL scope | Applied to transcript content only. |
| Media URL | Browser-safe `localhost:9000` URL. |
| Audio metadata | `readyState=4`, `duration=20`. |
| Segment play | Last segment button sought to `14.6s` and started playback. |
| Edit payload | `PATCH` sent only `transcriptText`. |
| Edit persistence | Refreshing detail API preserved `[E2E EDIT FINAL]`. |
| Failed-save draft behavior | Not fully browser-click tested; API validation errors are safe. |

The segment edit is clearly marked and reversible:

```text
[E2E EDIT FINAL]
```

## Analysis Result

`/Transcripts/Analysis?job_id=d759bdb3-9e64-4ffb-992c-aa70a32d4622` loaded at desktop and mobile widths.

Verified:

| Check | Result |
| --- | --- |
| Stored analysis GET before run | Returned `not_started`. |
| Analyse readiness | Final transcript status was `transcribed`. |
| Trigger route | `POST /api/transcripts/:jobId/analyse`. |
| Analysis service | `analysis` service received `POST /run/predict`. |
| Stored result | Reopening analysis endpoint returned `complete`. |
| Rendered fields | Summary, translation, classification, keywords, and entities present. |

The analysis service had `GEMINI_API_KEY` available in the lightweight dev environment and returned a completed analysis.

## Search Result

`/Search?q=E2E%20EDIT%20FINAL` loaded at desktop and mobile widths.

Verified:

| Query | Result |
| --- | --- |
| `E2E EDIT FINAL` | Found final edited segment. |
| Dhivehi term `ހެނދުނު` | Found expected Dhivehi segment matches. |
| `no-such-e2e-term-xyz` | Returned empty result set. |
| `integration-test-audio.wav` | Returned no result because search is segment-text only. |
| Status/category filters | `status=transcribed&category=Integration Test` returned final match. |
| Result link | Opens transcript details. |
| Browser Qdrant calls | None detected. |

Qdrant text index status after startup:

```json
"payload_schema":{"transcript_text":{"data_type":"text","points":8}}
```

The collection stayed green and no points were recreated or deleted.

## PDF Result

Generated final PDFs through `POST /api/export-pdf` on the Next.js server:

| Mode | Result |
| --- | --- |
| Details segmented without analysis | `200 application/pdf`, 1 page, safe filename. |
| Details paragraph without analysis | `200 application/pdf`, 1 page, safe filename. |
| Details segmented with analysis | `200 application/pdf`, 2 pages, safe filename. |
| Details paragraph with analysis | `200 application/pdf`, 2 pages, safe filename. |
| Analysis segmented with analysis | `200 application/pdf`, 2 pages, safe filename. |

Chromium PDF viewer screenshots confirmed paragraph and segmented layouts are visibly different, English metadata remains LTR, speaker labels and timestamps are LTR, analysis appears only when included, and page numbers render.

Limitations:

| Limitation | Note |
| --- | --- |
| Thaana visual certainty | Chromium screenshots show Thaana glyphs, but automated text extraction reports visual RTL order rather than logical Unicode order. Manual human PDF review is still recommended before release. |
| Viewer screenshot timing | One no-analysis segmented screenshot initially captured a blank viewer page; parsing the PDF confirmed the content and page count. |

## Desktop And Mobile Review

Puppeteer visited these routes at `1366x900` and `390x844`:

```text
/
/Transcripts
/Transcripts/List?search=E2E-TEST-001
/Transcripts/Details?job_id=d759bdb3-9e64-4ffb-992c-aa70a32d4622
/Transcripts/Analysis?job_id=d759bdb3-9e64-4ffb-992c-aa70a32d4622
/Search?q=E2E%20EDIT%20FINAL
```

No console errors, page errors, hydration warnings, or direct Qdrant browser calls were detected. Audio request aborts were observed when Puppeteer navigated away from Details before the media request completed; a dedicated Details check loaded the same media successfully with `readyState=4`.

## Contract Consistency

Verified API responses use camelCase DTOs, standardized error envelopes, no vectors, no numeric Qdrant IDs, and browser-safe MinIO URLs.

Invalid request checks:

| Request | Result |
| --- | --- |
| `GET /api/search/transcripts` | `400 SEARCH_QUERY_REQUIRED`. |
| `GET /api/transcripts/invalid-job-id` | `404 TRANSCRIPT_NOT_FOUND`. |
| `PATCH` nonexistent segment | `404` observed. |
| `POST /api/uploads` without file | `400 BAD_REQUEST`. |

## Status Mapping

Canonical public mapping confirmed/documented:

| Source status | Public handling |
| --- | --- |
| `uploaded` | `uploaded`. |
| `converting`, `diarizing`, `transcribing`, `processing` | `processing`. |
| `diarized` | `diarized`. |
| `transcribed`, `completed`, `complete` | `transcribed`. |
| `conversion_failed`, `diarization_failed`, `transcription_failed`, `error`, `failed` | `failed`. |
| `not_started` | `not_started`. |
| `analysis_pending`, `processing` | `processing` for analysis. |
| `analysis_complete`, `completed`, `complete` | `complete` for analysis. |

Unknown values render with a safe fallback badge and raw readable label.

## Defects Found And Fixes Applied

| Defect | Root cause | Fix | Files |
| --- | --- | --- | --- |
| `/api/*` unavailable in running backend | Existing Docker image was stale after source changes. | Rebuilt/recreated only `backend` service. | Runtime only. |
| Segment editing would fail browser preflight | CORS allowed `POST, GET, OPTIONS` but not `PATCH`. | Added `PATCH` to CORS methods. | `backend/cmd/backend/main.go` |
| Compose warning repeated | Obsolete top-level `version` key. | Removed only that key. | `compose.dev.yml` |
| Status aliases incomplete | Possible worker/legacy statuses were not explicitly canonicalized. | Added backend public status mapping and frontend safe badge/type handling. | `backend/internal/services/transcript_api.go`, `frontend/transcription-frontend/src/components/app/status-badge.tsx`, `frontend/transcription-frontend/src/lib/api/types.ts`, `frontend/transcription-frontend/src/lib/transcript-details-utils.ts`, `docs/api/frontend-backend-contract.md` |
| Initial test media too short for segment seeking | One-second WAV could not validate mock segment timestamps through `18.9s`. | Created/uploaded final 20-second WAV. | Runtime test data only. |

## Remaining Limitations

| Limitation | Impact |
| --- | --- |
| Duplicate `E2E-TEST-001` records | The first diagnostic upload remains by instruction; list search shows two integration records. |
| Analysis used configured Gemini key | Lightweight analysis service was used, but it called Gemini because the environment provided `GEMINI_API_KEY`. |
| No full manual GUI review | Browser and PDF checks were automated/headless. |
| No frontend unit tests | No frontend test framework exists. |
| Qdrant index startup timeout log | First startup logged a timeout while waiting for index creation, but the index was created and collection stayed green. |

## Final Validation

| Command | Result |
| --- | --- |
| `npm run lint` | Passed. |
| `npx tsc --noEmit` | Passed. |
| `npm run build` | Passed with a slow-filesystem warning only. |
| `cd backend && go test ./...` | Passed. |
| `cd backend && go vet ./...` | Passed. |
| `docker compose -f compose.dev.yml config --quiet` | Passed with no obsolete-version warning. |

## Cleanup Performed

| Item | Result |
| --- | --- |
| Temporary Next.js dev server | Stopped; port `3000` clear. |
| Temporary PDF files/screenshots | Removed from `C:\Users\Dell\AppData\Local\Temp\opencode`. |
| Compose stack | Stopped with `docker compose -f compose.dev.yml down`. |
| Qdrant/MinIO data | Preserved integration records and objects. No volumes deleted. |
| Docker images | Not removed. |
| Model caches | Not touched. |

## Next Recommended Stage

Add a small automated smoke-test script for the dev stack that uploads a generated 20-second WAV, waits for mock completion, validates API contracts, and optionally generates one PDF. Keep deletion, auth, deployment, and real workers out of that stage unless explicitly requested.
