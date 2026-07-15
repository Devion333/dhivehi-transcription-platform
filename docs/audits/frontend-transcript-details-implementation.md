# Frontend Transcript Details Implementation

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Files Created Or Modified

- `frontend/transcription-frontend/src/app/Transcripts/Details/page.tsx`
- `frontend/transcription-frontend/src/app/Transcripts/Details/transcript-details-client.tsx`
- `frontend/transcription-frontend/src/lib/api/types.ts`
- `frontend/transcription-frontend/src/lib/api/transcripts.ts`
- `frontend/transcription-frontend/src/lib/transcript-details-utils.ts`
- `docs/audits/frontend-transcript-details-implementation.md`

## Endpoints Used

- `GET /api/transcripts/{jobId}` loads transcript metadata, media URL, and ordered segments.
- `PATCH /api/transcripts/{jobId}/segments/{segmentId}` saves segment transcript text.

No direct Qdrant, Redis, or MinIO API calls are made by the frontend.

## Route And Query Handling

The page preserves the existing route shape: `/Transcripts/Details?job_id=<jobId>`.

Behavior:

- trims `job_id`;
- does not fetch when `job_id` is missing;
- shows an invalid-link state for missing IDs;
- URL-encodes IDs in backend requests and analysis links.

## Metadata Presentation

The page displays filename, reference number, category, parent status, analysis status, speaker count, segment count, created date, updated date, and notes.

Safe fallbacks include `No reference`, `Uncategorized`, `No notes`, and `Unknown date`.

## Audio Player Behavior

The page uses one shared hidden `<audio>` element and custom controls for:

- play/pause;
- current time and duration;
- seek bar;
- volume;
- playback rate.

No autoplay is used. Missing or failing media shows a clear message while keeping transcript editing available.

## Segment Seeking

Each segment has a `Play segment` action that seeks the shared audio element to `startTime`, starts playback, and pauses at `endTime` when possible. Active segment highlighting is applied while segment playback is active.

Event listeners are cleaned up on unmount.

## Editing States

Each segment supports independent editing:

- view mode;
- edit mode;
- saving;
- saved;
- error.

Save sends only `transcriptText` to the backend. Cancel restores the last successfully saved value. Failed saves keep the draft text for retry. Speaker, timestamps, status, IDs, and media URLs are not editable.

## Dhivehi And RTL Handling

Transcript text is inspected for Thaana characters. Dhivehi text uses the existing `transcript-text` utility with RTL direction and Thaana-capable font. Metadata and controls remain LTR.

Unicode text is preserved exactly; no transliteration or normalization is performed.

## Loading, Empty, And Error States

- Loading preserves the app shell and shows detail/segment loading states.
- Missing `job_id` shows an invalid-link state.
- Backend failures and not-found responses show safe error messaging and retry/list navigation.
- Empty segments are described differently for processing, failed, and other statuses.

## Processing-State Handling

Processing statuses show a notice that segments or transcript text may still appear later. Manual refresh is provided. Aggressive polling was not implemented.

## Responsive Behavior

Desktop uses a two-column layout for metadata/audio and transcript segments. Mobile stacks all content and keeps segment actions accessible without horizontal overflow.

## Tests

No frontend test framework is configured in `package.json`; formatting, speaker-label, ordering, and text-direction logic were kept in pure helpers for future tests. No backend code was changed in this stage.

## Validation

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `go test ./...` passed from `backend/`.
- `go vet ./...` passed from `backend/`.
- `docker compose -f compose.dev.yml config --quiet` passed with the known warning that the Compose `version` attribute is obsolete.

## Deferred Details-Page Features

- PDF export.
- Download redesign.
- Analysis results display.
- Analysis trigger.
- Transcript deletion.
- Speaker renaming.
- Timestamp editing.
- Segment merge/split.
- Full-text search.

## Next Frontend Stage

The next recommended stage is rebuilding `/Transcripts/Analysis` against `GET /api/transcripts/{jobId}/analysis` and the existing analysis trigger route or a future `/api` trigger endpoint.
