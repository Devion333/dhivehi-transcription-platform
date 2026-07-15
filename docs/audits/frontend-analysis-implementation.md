# Frontend Analysis Implementation

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Scope

Implemented the active `/Transcripts/Analysis?job_id=<jobId>` workflow against backend `/api` routes only. The legacy frontend snapshot under `legacy/frontend-analysis-baseline/` was not modified or imported.

## Backend Changes

Files changed:

| File | Change |
| --- | --- |
| `backend/internal/handlers/analyse.go` | Extracted shared analysis execution and added `APIAnalyseTranscript`. Legacy `AnalyseTranscript` remains available with its existing snake_case response. |
| `backend/internal/dtos/api.go` | Added `AnalysisTriggerResponse` with camelCase `analysis` envelope plus `message`. |
| `backend/cmd/backend/main.go` | Registered `POST /api/transcripts/:jobId/analyse`. |

API behavior:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/transcripts/:jobId/analysis` | Reads stored analysis from parent Qdrant payload and does not call the worker. |
| `POST /api/transcripts/:jobId/analyse` | Builds transcript text from ordered segments, calls the existing analysis worker, persists the result through existing Qdrant update logic, and returns a camelCase envelope. |
| `POST /transcripts/:job_id/analyse` | Preserved for legacy compatibility. |

## Frontend Changes

Files changed:

| File | Change |
| --- | --- |
| `frontend/transcription-frontend/src/app/Transcripts/Analysis/page.tsx` | Replaced placeholder with Suspense-wrapped dynamic route. |
| `frontend/transcription-frontend/src/app/Transcripts/Analysis/transcript-analysis-client.tsx` | Added loading, error, metadata, stored analysis rendering, explicit trigger, and refresh flow. |
| `frontend/transcription-frontend/src/lib/api/transcripts.ts` | Added `getTranscriptAnalysis()` and `analyseTranscript()`. |
| `frontend/transcription-frontend/src/lib/api/types.ts` | Added `TranscriptAnalysis` and `AnalysisTriggerResponse`. |
| `frontend/transcription-frontend/src/lib/transcript-analysis-utils.ts` | Added readiness, content, entity normalization, and text direction helpers. |

UI behavior:

| Rule | Implementation |
| --- | --- |
| No automatic analysis | Page loads transcript metadata and stored analysis only. The user must click `Analyse`. |
| Backend-only access | Frontend uses `GET /api/transcripts/:jobId`, `GET /api/transcripts/:jobId/analysis`, and `POST /api/transcripts/:jobId/analyse`. No direct Qdrant calls were added. |
| Readiness | Analyse button is disabled unless the transcript status is `transcribed`; backend segment validation remains the final guard. |
| Immediate result display | The trigger response updates the page with the fresh analysis result. |
| Stored result display | Summary, English translation, classification, keywords, and entities render from the API response. |
| Dhivehi handling | Long analysis text reuses transcript text direction detection for RTL/Thaana content. |

## Validation

Commands run successfully:

```sh
npm run lint
npx tsc --noEmit
npm run build
go test ./...
go vet ./...
docker compose -f compose.dev.yml config --quiet
```

Known validation note: Compose still warns that the top-level `version` attribute is obsolete. No Compose changes were made.

## Deferred Work

| Item | Reason |
| --- | --- |
| Component tests | No frontend test framework is currently configured. Helpers were kept pure where practical. |
| Analysis worker timeout/config hardening | Existing legacy behavior uses a fixed internal URL and no explicit client timeout. |
| PDF export | Out of scope for this stage. |
