# Frontend Upload Implementation

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Files Created Or Modified

- `backend/cmd/backend/main.go`
- `backend/internal/dtos/api.go`
- `backend/internal/handlers/upload.go`
- `backend/internal/handlers/upload_test.go`
- `frontend/transcription-frontend/src/app/Transcripts/page.tsx`
- `frontend/transcription-frontend/src/lib/api/types.ts`
- `frontend/transcription-frontend/src/lib/api/uploads.ts`
- `frontend/transcription-frontend/src/lib/upload-validation.ts`
- `docs/api/frontend-backend-contract.md`
- `docs/audits/frontend-upload-implementation.md`

## Endpoint Used

The rebuilt upload page uses `POST /api/uploads` through `src/lib/api/uploads.ts`.

The original `POST /upload` endpoint remains available and keeps its legacy response shape.

## Backend Reuse

`POST /api/uploads` reuses the same backend upload flow as `POST /upload`:

- receives multipart file field `file`;
- saves the uploaded file locally under `/tmp`;
- uploads the object to MinIO bucket `uploads`;
- creates a Qdrant parent point in `file_metadata`;
- pushes a Redis `conversion_queue` job with `file_id`, `minio_url`, and `filename`;
- returns immediately before conversion, diarization, or transcription completes.

The alias does not change worker queue payloads or worker behavior.

## Request And Response Contract

Request: `multipart/form-data`

Fields:

| Field | Required | Notes |
| --- | --- | --- |
| `file` | yes | Uploaded media file. |
| `category` | no | Existing category metadata. |
| `referenceNumber` | no | CamelCase frontend field. Backend also accepts legacy `reference_number`. |
| `notes` | no | Optional free text. |
| `requestedSpeakers` | no | Speaker-count metadata. Backend also accepts legacy `speakers`. |

Success: `201 Created`

```json
{
  "job": {
    "jobId": "uuid",
    "filename": "recording.wav",
    "category": "meeting",
    "referenceNumber": "REF-1",
    "notes": "optional note",
    "status": "uploaded",
    "createdAt": "2026-07-15T00:00:00Z",
    "speakerCount": 2,
    "segmentCount": 0,
    "analysisStatus": "not_started"
  },
  "message": "Upload accepted for processing"
}
```

## Supported Formats

The backend currently does not enforce media extension validation.

The real conversion worker treats these as video: `.mp4`, `.avi`, `.mov`, `.mkv`, `.flv`, `.wmv`, `.webm`, `.m4v`, `.mpeg`, `.mpg`.

The upload UI accepts common audio formats already usable by the pipeline as audio inputs: `.wav`, `.mp3`, `.m4a`, `.ogg`, `.flac`.

Mock workers do not read media contents; they forward uploaded files through the lightweight dev queue flow.

## Metadata Fields

- `category`
- `referenceNumber`
- `notes`
- `requestedSpeakers`

No user, department, classification, or case-management fields were added.

## Validation Behavior

Client-side validation checks:

- a file is selected;
- filename is non-empty;
- extension or MIME type is supported;
- file size is non-zero;
- reference number is at most 80 characters;
- notes are at most 1000 characters;
- requested speakers is an integer from 1 to 10.

No backend maximum file size is confirmed. The UI warns for files larger than 2 GB but does not claim hard server enforcement.

## Upload States

- `idle`
- `validating`
- `uploading`
- `accepted`
- `error`

Upload progress is indeterminate because native `fetch` does not expose upload-progress percentages. The UI does not display fake progress.

## Success And Error Flows

On success, the page shows filename, job ID, `uploaded` status, and a note that processing continues asynchronously.

Actions:

- View transcript;
- View all transcripts;
- Upload another file.

On recoverable errors, the selected file and metadata remain in place so the user can retry. Errors are user-safe and do not expose MinIO, Qdrant, Redis, stack traces, or raw Go internals from the new API route.

## Mock-Worker Compatibility

The page sends only one backend request and does not call Qdrant, Redis, or MinIO directly. It is compatible with the lightweight `compose.dev.yml` topology: frontend, Go backend, MinIO, Qdrant, Redis, mock conversion, mock diarization, mock transcription, and lightweight analysis.

No real Gradio ML workers are required for this page.

## Tests And Validation

Backend tests added:

- `/api/uploads` missing file returns standardized `BAD_REQUEST`;
- invalid multipart input returns `400`;
- upload response mapping returns the camelCase job envelope.

No frontend test framework is configured in `package.json`; pure validation helpers were kept isolated for future component/unit tests.

Validation results:

- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `go test ./...` passed from `backend/`.
- `go vet ./...` passed from `backend/`.
- `docker compose -f compose.dev.yml config --quiet` passed with the known warning that the Compose `version` attribute is obsolete.

## Remaining Limitations

- The backend still does not enforce file-type validation or a hard maximum file size.
- The shared legacy upload flow still logs Qdrant and Redis failures without failing the response.
- The details page is still a placeholder, so the success action can navigate there but full transcript review is a later stage.
- No runtime mock upload was performed in this implementation pass.

## Next Frontend Stage

The next recommended stage is rebuilding `/Transcripts/List` against `GET /api/transcripts` with pagination, filtering, loading, empty, and error states.
