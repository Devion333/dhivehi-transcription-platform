# Frontend Search Implementation

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Files Created Or Modified

| File | Change |
| --- | --- |
| `backend/cmd/backend/main.go` | Registered `GET /api/search/transcripts`. |
| `backend/internal/dtos/api.go` | Added search result and response DTOs. |
| `backend/internal/handlers/api.go` | Added search handler and query validation. |
| `backend/internal/handlers/api_helpers.go` | Added standardized search error mapping. |
| `backend/internal/handlers/api_helpers_test.go` | Added empty-query error test. |
| `backend/internal/services/api_errors.go` | Added search error codes. |
| `backend/internal/services/init.go` | Ensures `transcript_text` payload index at startup when possible. |
| `backend/internal/services/transcript_api.go` | Added literal transcript-text search, parent enrichment, excerpts, pagination, and ordering. |
| `backend/internal/services/transcript_api_test.go` | Added search helper tests. |
| `frontend/transcription-frontend/src/app/Search/page.tsx` | Replaced placeholder with Suspense route. |
| `frontend/transcription-frontend/src/app/Search/search-client.tsx` | Added URL-backed search UI, filters, results, highlighting, and pagination. |
| `frontend/transcription-frontend/src/lib/api/search.ts` | Added typed search API helper. |
| `frontend/transcription-frontend/src/lib/api/types.ts` | Added frontend search DTOs. |
| `frontend/transcription-frontend/src/lib/search-utils.tsx` | Added URL normalization, text direction, and plain-text highlighting helpers. |
| `docs/api/frontend-backend-contract.md` | Documented search endpoint and DTO. |
| `docs/audits/frontend-search-implementation.md` | Added this audit. |

## Endpoint

`GET /api/search/transcripts`

Query parameters: `q`, `page`, `pageSize`, `status`, `category`.

`q` is required. Empty trimmed queries return `400 SEARCH_QUERY_REQUIRED`.

## Search Method

Search is literal transcript segment text search. The backend scrolls segment payloads and performs Unicode-safe substring matching in Go. Latin text is case-insensitive where practical; Dhivehi text is preserved exactly.

No semantic/vector search is implemented or claimed.

## Qdrant Index Behavior

Backend startup attempts an idempotent Qdrant payload text index creation for `transcript_text` using `field_schema=text`. It does not recreate collections, delete points, modify vectors, or mutate transcript text.

Current search correctness does not depend on the index because the service-side fallback is used for reliable Dhivehi literal matching.

## Query And Filters

| Field | Behavior |
| --- | --- |
| `q` | Trimmed and required. |
| `page` | Defaults to `1`; invalid values normalize to `1`. |
| `pageSize` | Defaults to `20`; max `100`. |
| `status` | Optional parent status filter. |
| `category` | Optional exact category filter, case-insensitive. |

## Parent Enrichment

The backend fetches parent transcript points once per request and builds an in-memory lookup by `job_id`. Missing parent records do not fail the search result; safe fallbacks are returned.

## Excerpts And Highlighting

The backend returns plain-text `matchExcerpt` with Unicode-safe rune windows around the match. It does not return HTML.

The frontend highlights exact plain-text matches as React nodes without `dangerouslySetInnerHTML` and without regex injection risk.

## URL State

`/Search` uses URL query parameters as source of truth: `q`, `page`, `status`, and `category`.

Submitting a new query or filter resets page to `1`. Refresh and back/forward preserve state. Empty `q` does not call the backend.

## Pagination And Ordering

Pagination uses the backend envelope with fixed frontend `pageSize=20`.

Ordering is deterministic: newest parent timestamp first, then job ID fallback, then segment index ascending within the same transcript.

## Dhivehi And RTL

Search input uses `dir="auto"`. Result excerpts use Thaana/RTL styling when Dhivehi characters are detected. Metadata remains LTR.

## Tests

Backend tests cover:

| Test area | Coverage |
| --- | --- |
| Empty query | Handler and service error code. |
| Pagination | Search response page slicing. |
| Unicode | Dhivehi query excerpt preservation. |
| Parent enrichment | Parent metadata mapping and missing-parent fallbacks. |
| Ordering | Newest parent then segment index. |
| Errors | Standardized `SEARCH_QUERY_REQUIRED` response. |

No live Qdrant data is read or written by tests.

## Validation

| Command | Result |
| --- | --- |
| `npm run lint` | Passed. |
| `npx tsc --noEmit` | Passed. |
| `npm run build` | Passed. |
| `cd backend && go test ./...` | Passed. |
| `cd backend && go vet ./...` | Passed. |
| `docker compose -f compose.dev.yml config --quiet` | Passed with known obsolete `version` warning. |
| Active frontend grep for `QDRANT_URL`, `/collections/`, `/points/scroll` | No matches. |

## Known Limitations

| Limitation | Notes |
| --- | --- |
| Scale | Search currently scrolls segment payloads and filters in service memory. This is acceptable for current project scale but should move to indexed Qdrant text search if data grows. |
| Category filter | Exact category match only. |
| No segment deep link | Results link to transcript details only; segment scroll/highlight can be added later. |
| No relevance scoring | Results are ordered by transcript recency and segment order, not relevance. |

## Next Recommended Stage

The next recommended stage is adding safe transcript deletion with backend-owned Qdrant and MinIO cleanup semantics, if deletion remains a required feature.
