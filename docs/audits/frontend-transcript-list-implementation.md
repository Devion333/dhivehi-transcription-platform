# Frontend Transcript List Implementation

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Files Created Or Modified

- `frontend/transcription-frontend/src/app/Transcripts/List/page.tsx`
- `frontend/transcription-frontend/src/app/Transcripts/List/transcript-list-client.tsx`
- `frontend/transcription-frontend/src/lib/api/client.ts`
- `frontend/transcription-frontend/src/lib/api/transcripts.ts`
- `frontend/transcription-frontend/src/lib/transcript-list-utils.ts`
- `docs/api/frontend-backend-contract.md`
- `docs/audits/frontend-transcript-list-implementation.md`

## Endpoint And Query Parameters

The rebuilt list uses `GET /api/transcripts` through `src/lib/api/transcripts.ts`.

Supported query parameters confirmed from backend implementation:

- `page`
- `pageSize`
- `search`
- `status`

The contract documentation was updated to remove the previously documented but unimplemented `sort` parameter.

## URL-State Behavior

URL query parameters are the source of truth for:

- `page`
- `search`
- `status`

Rules implemented:

- invalid or negative pages normalize to `1`;
- empty search is omitted from URLs and API calls;
- `all` status is omitted from API calls;
- search submit resets page to `1`;
- status changes reset page to `1`;
- browser refresh and back/forward preserve list state.

## Responsive List Design

Desktop uses a structured table with columns for filename, reference, category, status, segments, analysis, created date, and action.

Mobile uses compact transcript cards with filename, status badges, reference, category, segment count, created date, and a semantic view link.

## Search Behavior

Search is submitted explicitly from the filter bar. It is sent to the backend `search` query parameter.

Backend-supported fields are filename, reference number, and category. Transcript-content search remains out of scope.

## Status Filtering

The UI sends only backend-supported public status values:

- `uploaded`
- `processing`
- `diarized`
- `transcribed`
- `failed`

The filter also includes `all`, which is not sent to the API.

## Loading, Empty, And Error States

- Loading preserves the app shell, page header, and filter controls.
- No-transcripts empty state suggests uploading a transcript.
- Filtered-empty state suggests clearing filters.
- Error state preserves current filters and provides retry.
- Request cancellation prevents stale responses from overwriting newer search/filter/page results.

## Pagination

Pagination uses the backend `pagination` object:

- previous page;
- next page;
- current page;
- total pages;
- total result count.

The page size is fixed at `20` for this stage. Infinite scroll was not carried forward.

## Direct Qdrant Removal

The active list route no longer uses:

- `QDRANT_URL`
- `/collections/`
- `/points/scroll`
- `/points/delete`

Deletion from the legacy list was intentionally not implemented.

## Tests

No frontend test framework is configured in `package.json`; helper logic was kept pure for future tests. No backend code was changed in this stage, so no new backend tests were added.

## Validation Results

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `go test ./...` passed from `backend/`.
- `go vet ./...` passed from `backend/`.
- `docker compose -f compose.dev.yml config --quiet` passed with the known warning that the Compose `version` attribute is obsolete.

## Deferred List Features

- Transcript deletion.
- Bulk actions.
- Category-specific filtering beyond backend search.
- Segment full-text search.
- Inline processing progress timeline.
- Details/editor integration beyond route links.

## Next Frontend Stage

The next recommended stage is rebuilding `/Transcripts/Details` against `GET /api/transcripts/{jobId}` and `PATCH /api/transcripts/{jobId}/segments/{segmentId}`.
