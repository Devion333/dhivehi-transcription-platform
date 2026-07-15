# Frontend PDF Export Implementation

Date: 2026-07-15

Branch: `frontend-reimplementation`

## Scope

Implemented PDF export for the rebuilt Transcript Details and Analysis pages. The workflow uses backend DTO data already loaded by the frontend, then posts a structured payload to the existing Next.js server-side Puppeteer route `POST /api/export-pdf`.

The legacy snapshot under `legacy/frontend-analysis-baseline/` was not modified or imported.

## Existing PDF Audit

Previous active route: `POST /api/export-pdf`.

Previous request body:

| Field | Notes |
| --- | --- |
| `parent` | Legacy snake_case parent metadata. |
| `segments` | Legacy snake_case segments. |
| `format` | `segmented` or `paragraph`. |
| `analysisData` | Optional analysis object. |

Previous behavior:

| Area | Finding |
| --- | --- |
| Response type | Returned `application/pdf` or `500 { "error": "..." }`. |
| Puppeteer launch | `headless: "shell"`, `--no-sandbox`, `--disable-setuid-sandbox`, `--disable-gpu`, `--hide-scrollbars`, `--mute-audio`. |
| HTML generation | Built server-side from posted data with partial escaping. |
| Font loading | Loaded `Noto Sans Thaana` from Google Fonts remotely. |
| Segmented format | Sorted by `segment_index`, rendered each segment with speaker and timestamps. |
| Paragraph format | Grouped consecutive segments by speaker and joined text with spaces. |
| Analysis inclusion | Included analysis when `analysisData` existed, but did not validate completeness. |
| Filename | Derived from posted parent filename using alphanumeric underscores. |
| Footer | Included page numbers and a confidential law enforcement notice. |
| Known issues | Exposed raw errors, no payload validation, remote font dependency, no `finally` close, no request-size guard, snake_case legacy payload, and no standardized JSON errors. |

The route expected the browser to send complete transcript and analysis data. It did not fetch Qdrant itself. That architecture is preserved, but the payload is now typed and fed from backend API DTOs.

## Files Created Or Modified

| File | Change |
| --- | --- |
| `frontend/transcription-frontend/src/app/api/export-pdf/route.ts` | Rebuilt and hardened the Puppeteer route with typed payload validation, local font embedding, safe HTML generation, PDF footer, safe filename, timeouts, and `finally` cleanup. |
| `frontend/transcription-frontend/src/lib/pdf-export-types.ts` | Added shared structured PDF payload types. |
| `frontend/transcription-frontend/src/lib/pdf-export-utils.ts` | Added pure helpers for segment ordering, paragraph grouping, timestamps, HTML escaping, filename sanitization, analysis flattening, and payload mapping. |
| `frontend/transcription-frontend/src/lib/pdfGenerator.ts` | Updated browser helper to post the structured payload and validate PDF responses. |
| `frontend/transcription-frontend/src/components/transcripts/pdf-export-dialog.tsx` | Added reusable export dialog with format selection, include-analysis option, loading state, and retryable error state. |
| `frontend/transcription-frontend/src/app/Transcripts/Details/transcript-details-client.tsx` | Added Export PDF action, dialog integration, and lazy stored-analysis fetch only when requested. |
| `frontend/transcription-frontend/src/app/Transcripts/Analysis/transcript-analysis-client.tsx` | Added Export PDF action with already-loaded transcript and analysis, defaulting include-analysis on when complete. |
| `docs/api/frontend-backend-contract.md` | Documented the Next.js PDF export payload separately from Go backend endpoints. |
| `docs/audits/frontend-pdf-export-implementation.md` | Added this implementation audit. |

## Export Payload

Payload shape:

```ts
type PdfExportPayload = {
  transcript: {
    jobId: string;
    filename: string;
    category?: string;
    referenceNumber?: string;
    notes?: string;
    createdAt?: string;
    status: string;
    speakers?: number;
    segmentCount?: number;
    segments: Array<{
      id: string;
      segmentIndex: number;
      speaker: string;
      startTime: number;
      endTime: number;
      transcriptText: string;
    }>;
  };
  format: "segmented" | "paragraph";
  includeAnalysis: boolean;
  analysis?: {
    status: string;
    keywords: string[];
    entities: string[];
    summary: string;
    classification: string;
    englishTranslation: string;
  };
};
```

## Segmented Format

Segmented output sorts by `segmentIndex` and renders each segment as a separate block:

```text
Speaker 1 - 00:00-00:05
ހެލޯ ...
```

Speaker and timestamp metadata remain LTR. Transcript text is rendered RTL with the embedded Thaana-compatible font. Segment blocks use `break-inside: avoid` where Chromium can honor it.

## Paragraph Format

Paragraph output sorts by `segmentIndex`, groups consecutive segments by speaker, joins each group's transcript text with spaces, and starts a new paragraph when the speaker changes.

This intentionally differs from segmented output: timestamps are not repeated for every segment, and adjacent same-speaker text becomes readable prose.

## Dhivehi, RTL, And Font Handling

The route embeds the active app font `src/app/fonts/Faruma.ttf` as a base64 `@font-face` named `FarumaPdf`. Dhivehi transcript text uses:

```css
direction: rtl;
unicode-bidi: plaintext;
font-family: FarumaPdf, 'MV Faruma', 'Noto Sans Thaana', Arial, sans-serif;
```

The route waits for `document.fonts.ready` with a bounded fallback. English metadata and analysis translation remain LTR. Dhivehi text is preserved as native Unicode and is not transliterated.

## Analysis Inclusion

Analysis is optional and never triggers analysis. It is included only when supplied through the typed API flow and when `status === "complete"` with at least one usable field.

Included sections are omitted when empty:

| Section | Source |
| --- | --- |
| Summary | `analysis.summary` |
| Classification | `analysis.classification` |
| Keywords | `analysis.keywords` |
| Entities | flattened `analysis.entities` |
| English Translation | `analysis.englishTranslation` |

## Details Integration

`/Transcripts/Details?job_id=<jobId>` now shows an Export PDF action when transcript data is loaded. It uses the already-loaded transcript and segments. If the user enables stored analysis, the dialog lazily calls `GET /api/transcripts/{jobId}/analysis`; otherwise no extra analysis request is made.

The page does not reload and does not refetch Qdrant.

## Analysis Integration

`/Transcripts/Analysis?job_id=<jobId>` now shows an Export PDF action when transcript data is available. It reuses the already-loaded transcript detail and analysis. Include-analysis defaults to enabled when stored analysis is complete and has exportable content.

## Route Validation And Security

The route now validates:

| Rule | Behavior |
| --- | --- |
| Request size | Rejects bodies over about 1.5 MB with `413 PAYLOAD_TOO_LARGE`. |
| JSON syntax | Rejects invalid JSON with standardized `400 BAD_REQUEST`. |
| Transcript data | Requires transcript object, non-empty job ID, filename, and at least one segment. |
| Format | Allows only `segmented` and `paragraph`. |
| Segments | Requires IDs, numeric indexes, numeric timestamps, and string transcript text. |
| Analysis | Requires complete usable analysis when `includeAnalysis=true`. |
| HTML injection | Escapes all user-supplied text before inserting into HTML. |
| Cleanup | Closes page and browser in `finally`. |
| Errors | Returns safe standardized JSON errors without stack traces or internal paths. |

The route does not access Qdrant, MinIO, Redis, workers, queues, or analysis services.

## Filename Behavior

Download filename uses:

```text
<reference-or-filename>-transcript.pdf
```

Sanitization removes path separators, reserved filename characters, control characters, trailing dots/spaces, repeated whitespace, and caps the base name length. Fallback is `transcript-export.pdf`.

Job IDs are not used in filenames unless they are the only user-supplied identifying text.

## Puppeteer And Runtime Considerations

The implementation keeps Puppeteer `25.3.0` and the existing server-side Chromium approach. It was validated through `npm run build` and `npm start` on Windows using a temporary port.

Launch configuration remains compatible with the previous route:

```ts
headless: "shell"
args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--hide-scrollbars", "--mute-audio"]
```

Deployment follow-up: a future production frontend container may need Chromium runtime dependencies. This stage did not add a frontend Dockerfile or Docker image changes.

## Tests And Validation

No frontend unit test framework is configured in `package.json`. Pure helpers were created for future tests, but no test framework was added solely for PDF export.

Commands passed:

```sh
npm run lint
npx tsc --noEmit
npm run build
go test ./...
go vet ./...
docker compose -f compose.dev.yml config --quiet
```

Known Compose validation note: the existing top-level `version` warning remains.

## Controlled PDF Generation

Using `npm start -- -p 3010`, four non-sensitive mock Dhivehi PDF exports were posted to `POST /api/export-pdf`:

| Case | Result |
| --- | --- |
| Segmented, no analysis | `200`, `69816` bytes, `%PDF-`, safe filename `REF PDF TEST-transcript.pdf`. |
| Paragraph, no analysis | `200`, `68309` bytes, `%PDF-`, safe filename `REF PDF TEST-transcript.pdf`. |
| Segmented, with analysis | `200`, `81165` bytes, `%PDF-`, safe filename `REF PDF TEST-transcript.pdf`. |
| Paragraph, with analysis | `200`, `80109` bytes, `%PDF-`, safe filename `REF PDF TEST-transcript.pdf`. |

The differing sizes confirm segmented and paragraph outputs are not identical, and analysis inclusion changes the output. The temporary Next server was stopped afterward and port `3010` was clear. No Puppeteer Chromium listener/process remained from the export route; unrelated desktop Edge WebView processes were present before/after.

Visual PDF opening/rendering was not manually inspected in a GUI during this automated run. The PDFs were verified as valid non-empty PDF responses with embedded local font HTML generation.

## Remaining Deployment Concerns

| Concern | Follow-up |
| --- | --- |
| Frontend container | Production Docker packaging is still out of scope. |
| Chromium dependencies | If a frontend Docker image is added later, include required Chromium system libraries. |
| Route tests | Add unit tests when a frontend test runner is introduced. |
| Large transcripts | Current request limit is conservative; consider streaming/server-side export data if transcripts become very large. |

## Next Frontend Stage

The next recommended frontend stage is rebuilding transcript search behind a backend API, because active search remains route-compatible but not implemented against the new backend-only data boundary.
