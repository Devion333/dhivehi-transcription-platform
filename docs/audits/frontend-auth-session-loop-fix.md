# Frontend Auth Session Loop Fix

Status: implemented on `feature/auth-admin`.

## Root Cause

The auth provider tracked only nullable `user` plus `isLoading`. Initial `/api/auth/me` failures all collapsed to `user = null`, and the protected shell inferred loading/redirect behavior from that nullable user state. Backend downtime or parsing/network failures could therefore look indistinguishable from an in-progress check, leaving protected pages on `Checking session` or causing repeated redirect attempts.

The provider also had separate initial-check and manual-refresh paths. They both called `/api/auth/me`, but only the initial path owned `isLoading`, so retry/error behavior was not explicit.

## Final Auth State Model

The provider now exposes:

```ts
type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "error";
```

State transitions for the initial `/api/auth/me` request:

| Result | State |
| --- | --- |
| `200` with user | `authenticated` |
| `401` | `unauthenticated` |
| Network, timeout, or parse/server error | `error` |
| Provider unmount abort | ignored; does not overwrite state |

`/api/auth/me` is bounded by a 9 second timeout. Timeout is treated as `error`, not as an infinite loading state.

## Route Behavior

Protected shell behavior:

| Status | Behavior |
| --- | --- |
| `checking` | Shows `Checking session`. |
| `authenticated` | Renders protected content. |
| `unauthenticated` | Redirects once to `/Login` with a sanitized internal `returnTo`. |
| `error` | Shows `Unable to verify session` with `Retry`. |

The Login page no longer redirects while auth is `checking`. It redirects only when `authenticated`, shows the form for `unauthenticated`, and still allows login when the initial session check is in `error`.

## Request Count On Refresh

The initial session check is owned by `AuthProvider` and runs from a stable mount effect with stable `refreshUser` dependencies. Protected pages and Login do not independently call `/api/auth/me`.

Expected production refresh behavior is one `/api/auth/me` request per provider mount. React development Strict Mode may issue an extra aborted development-only request, but the abort path does not transition to `error` or restart a loop.

## Docker Restart Behavior

If the backend is unavailable while the frontend remains open, `/api/auth/me` now leaves `checking` and transitions to `error`. The UI shows `Unable to verify session` and a retry button. After Docker/backend restart, selecting Retry transitions `error -> checking -> authenticated` for a valid session or `error -> checking -> unauthenticated` for an invalid/expired session.

## API Client Behavior

The shared API client throws typed `ApiError` responses and has no global redirect or recursive `401` retry behavior. `/api/auth/me` is called only by the auth provider for session-state transitions.

## Environment URLs

Active frontend config remains browser-safe:

```ts
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
```

No active frontend browser call uses the Docker-only `http://backend:8000` hostname.

## Files Changed

| File | Purpose |
| --- | --- |
| `frontend/transcription-frontend/src/components/auth/auth-provider.tsx` | Explicit auth status model, bounded `/api/auth/me`, retryable refresh, and login/logout state transitions. |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Protected-route state handling, one-shot unauthenticated redirect, retry UI for session-check errors. |
| `frontend/transcription-frontend/src/app/Login/page.tsx` | Login behavior based on explicit auth status; no redirect while checking. |
| `frontend/transcription-frontend/src/lib/api/client.ts` | Typed helper guards for `ApiError` and abort detection. |

## Tests

No frontend test framework is configured in `package.json`, so component tests for the auth provider and shell are deferred. The implemented state paths are pure enough to validate through lint, TypeScript, build checks, and runtime browser/network-log verification.

Recommended future component tests:

| Case | Expected |
| --- | --- |
| `/api/auth/me` returns `401` | `unauthenticated` and single guarded redirect from protected shell. |
| `/api/auth/me` network failure | `error` and retry UI. |
| Aborted initial request | Does not overwrite state after unmount. |
| Retry after error succeeds | `checking -> authenticated`. |
| Retry after error returns `401` | `checking -> unauthenticated`. |
| Login safe return path | External, encoded, control-character, or `/Login` return values resolve to `/`. |
| `/api/auth/me` failure | No recursive retry from shared API client. |

## Validation Results

Passed:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |
| `cd backend && go test ./...` | Passed |
| `cd backend && go vet ./...` | Passed |
| `docker compose -f compose.dev.yml config --quiet` | Passed |

Runtime browser validation should still be performed manually with DevTools Network logs because this environment has had intermittent headless browser and local shell spawn failures. The expected observation is no repeated `/api/auth/me` request/redirect loop after refresh, backend stop, backend restart, or Retry.
