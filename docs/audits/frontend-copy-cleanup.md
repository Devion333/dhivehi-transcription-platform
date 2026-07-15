# Frontend Copy Cleanup

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Files Modified

| File | Change |
| --- | --- |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Removed sidebar subtitle and replaced top-bar foundation copy with app name. |
| `frontend/transcription-frontend/src/components/app/page-header.tsx` | Tightened header spacing. |
| `frontend/transcription-frontend/src/components/app/states.tsx` | Reduced loading and empty-state padding; shortened default loading copy. |
| `frontend/transcription-frontend/src/app/page.tsx` | Removed dashboard subtitle and shortened actions/loading copy. |
| `frontend/transcription-frontend/src/app/Transcripts/page.tsx` | Removed pipeline/development explainer cards and shortened upload copy, hints, and success state. |
| `frontend/transcription-frontend/src/app/Transcripts/List/transcript-list-client.tsx` | Removed page subtitle, shortened filter/result/empty-state copy. |
| `frontend/transcription-frontend/src/app/Transcripts/Details/transcript-details-client.tsx` | Removed page subtitle, shortened processing/no-segment/media/back copy. |
| `frontend/transcription-frontend/src/app/Transcripts/Analysis/transcript-analysis-client.tsx` | Shortened missing/loading/not-ready/not-started copy. |
| `frontend/transcription-frontend/src/app/Search/page.tsx` | Replaced foundation placeholder prose with concise unavailable state. |
| `frontend/transcription-frontend/src/components/transcripts/pdf-export-dialog.tsx` | Shortened format and analysis option copy. |
| `frontend/transcription-frontend/src/components/PdfExportModal.tsx` | Shortened legacy modal copy for consistency. |

## Copy Removed Or Shortened

| Area | Example change |
| --- | --- |
| Dashboard | Removed backend/foundation explanation under `Dashboard`. |
| Upload | Removed permanent pipeline and dev-stack explanation cards. |
| List | Replaced long backend/API description with just `Transcripts`. |
| Details | Replaced processing paragraph with `Transcript is still processing.` |
| Analysis | Replaced analysis explanation with `Analysis has not been run`. |
| PDF | Replaced format paragraphs with `Speaker and timestamps` and `Grouped by speaker`. |

## Retained Descriptions

| Copy | Reason |
| --- | --- |
| Validation errors | Needed to correct upload form input. |
| Backend/API error details | Needed for retry and diagnosis without exposing internals. |
| Missing ID states | Needed when opening deep links without `job_id`. |
| Disabled analysis hint | Explains why PDF analysis inclusion is unavailable. |

## Accessibility And Density

- Kept `aria-label` values on navigation, audio, and dialog controls.
- Kept visible form labels and validation messages.
- Reduced header, loading, empty-state, upload, and filter vertical space after removing paragraphs.
- Preserved mobile card layouts and responsive filter stacking.

## Validation

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `go test ./...` passed from `backend/`.
- `go vet ./...` passed from `backend/`.
- `docker compose -f compose.dev.yml config --quiet` passed with the known obsolete `version` warning.
- Built app was reviewed at desktop `1366x900` and mobile `390x844` widths through a temporary `npm start` server on port `3011`; the server was stopped afterward.
