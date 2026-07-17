# Frontend Route Navigation Upload Progress Fixes

Status: implemented on `feature/auth-admin`.

## Route Changes

Canonical frontend routes are now:

| Purpose | Route |
| --- | --- |
| Upload | `/Upload` |
| Transcript list | `/Transcripts` |
| Transcript detail | `/Transcripts/Details?job_id=<jobId>` |
| Transcript analysis | `/Transcripts/Analysis?job_id=<jobId>` |

The previous upload page moved from `/Transcripts` to `/Upload`. The transcript list moved from `/Transcripts/List` to `/Transcripts`.

## Redirects

`/Transcripts/List` now redirects to `/Transcripts` for backward compatibility. There is no redirect from the old upload route because `/Transcripts` is now the canonical transcript list.

## Sidebar Rules

Main navigation now contains only Dashboard, Upload, Transcripts, and Search. Details and Analysis are no longer primary sidebar items.

Active-state rules:

| Item | Active when |
| --- | --- |
| Dashboard | `pathname === "/"` |
| Upload | `pathname === "/Upload"` |
| Transcripts | `pathname === "/Transcripts"`, starts with `/Transcripts/Details`, or starts with `/Transcripts/Analysis` |
| Search | `pathname === "/Search"` |

Desktop and mobile navigation share the same `NavLink` logic.

## Admin Filter Layout

Admin Users, Audit, and Jobs filters now use responsive CSS grids with one column on mobile, two columns on tablet, and bounded desktop columns. Search cells use `w-full min-w-0`, every control wrapper uses `min-w-0`, selects/date inputs use full width with bounded `sm:w-40`, and buttons are prevented from shrinking into unreadable sizes. Audit and Jobs controls wrap across rows on desktop rather than forcing horizontal overflow.

## Upload Progress

The upload helper now uses `XMLHttpRequest` for `POST /api/uploads` so `xhr.upload.onprogress` can report real file-transfer progress. Cookies are preserved with `xhr.withCredentials = true`; the backend endpoint and multipart field names are unchanged.

Upload UI behavior:

| State | UI |
| --- | --- |
| File transfer with computable size | Determinate progress bar plus percentage. |
| File transfer without computable size | Indeterminate progress bar, no invented percentage. |
| Backend accepted upload | Shows `Upload accepted` and `Processing has started`. |
| Later conversion/diarization/transcription | No fake progress percentage is shown. |

Abort is supported through `AbortController`. Recoverable errors preserve the selected file and metadata. Starting a new upload resets progress.

## Files Modified

| File | Purpose |
| --- | --- |
| `frontend/transcription-frontend/src/app/Upload/page.tsx` | New canonical upload route and progress UI. |
| `frontend/transcription-frontend/src/app/Transcripts/page.tsx` | Canonical transcript-list route. |
| `frontend/transcription-frontend/src/app/Transcripts/List/page.tsx` | Backward-compatible redirect. |
| `frontend/transcription-frontend/src/app/Transcripts/List/transcript-list-client.tsx` | List links and empty-state upload action. |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Sidebar items and explicit active-state rules. |
| `frontend/transcription-frontend/src/components/app/states.tsx` | Optional empty-state action slot. |
| `frontend/transcription-frontend/src/lib/api/uploads.ts` | XHR upload progress implementation. |
| `frontend/transcription-frontend/src/lib/auth-utils.ts` | `/Upload` protected route. |
| `frontend/transcription-frontend/src/lib/transcript-list-utils.ts` | Transcript list URL builder now targets `/Transcripts`. |
| `frontend/transcription-frontend/src/app/page.tsx` | Dashboard quick actions. |
| `frontend/transcription-frontend/src/app/Transcripts/Details/transcript-details-client.tsx` | Back link. |
| `frontend/transcription-frontend/src/app/Transcripts/Analysis/transcript-analysis-client.tsx` | Back link. |
| `frontend/transcription-frontend/src/app/Admin/Users/users-client.tsx` | Responsive filter layout. |
| `frontend/transcription-frontend/src/app/Admin/Audit/audit-client.tsx` | Responsive filter layout. |
| `frontend/transcription-frontend/src/app/Admin/Jobs/jobs-client.tsx` | Responsive filter layout. |

## Validation Results

Passed:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed; build output includes `/Upload`, `/Transcripts`, and `/Transcripts/List`. |
| `go test ./...` | Passed |
| `go vet ./...` | Passed |
| `docker compose -f compose.dev.yml config --quiet` | Passed |
| `git diff --check` | Passed |

Runtime API check with the dev stack confirmed backend health and authenticated login with a temporary initial administrator. Multipart upload verification was not completed because the local PowerShell 5.1 environment lacks `Invoke-WebRequest -Form`, and subsequent `curl.exe` multipart retries intermittently failed to spawn with `EPERM`. The dev stack was stopped with `docker compose -f compose.dev.yml down` without removing volumes.

Manual visual checks are still recommended for upload progress and admin filter wrapping at desktop, tablet, and mobile widths.
