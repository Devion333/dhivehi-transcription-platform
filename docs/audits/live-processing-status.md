# Live Processing Status Audit

## Scope

Implemented lightweight, authenticated transcript-processing status updates without WebSockets, worker changes, cancellation, notifications, or invented progress percentages.

## Backend API

Added:

```http
GET /api/transcripts/:jobId/status
```

Response shape:

```json
{
  "jobId": "job-123",
  "status": "transcribing",
  "stage": "transcription",
  "isTerminal": false,
  "updatedAt": "2026-07-18T00:00:00Z",
  "failureCode": null,
  "failureMessage": null
}
```

The route uses the existing authenticated transcript access scope. Standard users can only read owned transcript status. Admins can read all transcript status, including legacy ownerless transcripts.

Failure details are safe by role. Admins receive sanitized failure details from existing backend sanitization. Standard users receive a generic failure message and no raw infrastructure/provider detail.

## Status Contract

Frontend-visible status keys:

| Key | Label |
| --- | --- |
| `queued_conversion` | Queued for conversion |
| `converting` | Converting audio |
| `diarizing` | Identifying speakers |
| `transcribing` | Transcribing audio |
| `transcribed` | Transcript ready |
| `analysing` | Analysing transcript |
| `complete` | Complete |
| `failed` | Processing failed |

Terminal statuses are `transcribed`, `complete`, and `failed`.

## Frontend Behavior

Upload, Transcript List, and Transcript Details now show live status updates using polling only.

Polling behavior:

1. Polls approximately every 3 seconds for non-terminal statuses.
2. Uses `AbortController` and aborts on unmount.
3. Avoids overlapping requests.
4. Skips requests while the tab is hidden.
5. Stops once a terminal status is returned.

Transcript List avoids row-level pollers. It refreshes the current list page only while the page contains at least one processing transcript.

Transcript Details disables PDF export, analysis navigation, and transcript text edits until the transcript is ready. When polling observes `transcribed` or `complete`, the page reloads the transcript detail once so newly available segments are displayed.

## Files Changed

| Area | Files |
| --- | --- |
| Backend DTO/API | `backend/internal/dtos/api.go`, `backend/internal/handlers/api.go`, `backend/cmd/backend/main.go` |
| Backend service | `backend/internal/services/transcript_api.go` |
| Backend tests | `backend/internal/services/transcript_api_test.go` |
| Frontend API/types | `frontend/transcription-frontend/src/lib/api/types.ts`, `frontend/transcription-frontend/src/lib/api/transcripts.ts` |
| Frontend status UI | `frontend/transcription-frontend/src/components/app/status-badge.tsx`, `frontend/transcription-frontend/src/lib/transcript-status.ts` |
| Frontend polling | `frontend/transcription-frontend/src/hooks/use-transcript-status-polling.ts` |
| Pages | `Upload`, `Transcripts/List`, `Transcripts/Details` |

## Validation Notes

Static validation and backend unit tests were run from the workspace. Browser DevTools network-panel verification was not directly available from this tool session.
