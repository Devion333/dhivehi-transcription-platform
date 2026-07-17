# Authentication Foundation Implementation

Date: 2026-07-15

Status: implemented and validated for local dev stack.

## Scope

Implemented persistent authentication and authorization foundations without changing transcript processing, worker queues, MinIO object layout, Qdrant transcript payloads, or frontend transcript workflows.

## Backend Changes

Added PostgreSQL-backed users and sessions:

| Area | Implementation |
| --- | --- |
| Schema | `backend/migrations/001_auth_users_sessions.sql` creates `users`, `sessions`, indexes, and role constraints. |
| Migration runner | `backend/internal/services/migrations.go` applies versioned SQL migrations transactionally. |
| Passwords | Argon2id hashes with per-password random salt. Plaintext passwords are never stored or returned. |
| Sessions | Opaque random token in browser cookie; SHA-256 token hash stored in PostgreSQL. |
| Cookie | Default name `transcript_session`; `HttpOnly`, `SameSite=Lax`, `Path=/`, local `Secure=false` unless `SESSION_SECURE=true`. |
| Roles | `user` and `admin`; existing workflow routes are accessible to both authenticated roles. |
| Bootstrap | `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, and `INITIAL_ADMIN_PASSWORD` create an initial admin if the email does not exist. |
| CORS | Credentialed CORS uses explicit `FRONTEND_ORIGIN`; no wildcard origin with credentials. |

Added endpoints:

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/api/auth/login` | public |
| `POST` | `/api/auth/logout` | required |
| `GET` | `/api/auth/me` | required |
| `GET` | `/api/health` | public |

Protected all existing workflow endpoints, including `/api/uploads`, `/api/stats`, `/api/transcripts`, `/api/search/transcripts`, transcript detail/edit/analysis routes, and preserved legacy routes.

## Frontend Changes

Added browser auth state without storing tokens in JavaScript-accessible storage:

| Area | Implementation |
| --- | --- |
| API client | `credentials: "include"` on backend requests. |
| Auth helpers | `login`, `logout`, and `getCurrentUser` helpers under `src/lib/api/auth.ts`. |
| Auth provider | `src/components/auth/auth-provider.tsx` loads `/api/auth/me` and tracks safe user state. |
| Login page | `src/app/Login/page.tsx` with safe `returnTo` handling. |
| Route protection | App shell redirects unauthenticated protected routes to `/Login`. |
| Sign out | User menu and mobile auth controls call backend logout and clear frontend state. |
| PDF route | Next route forwards incoming cookies to backend `/api/auth/me` before generating PDFs. |

## Runtime Validation

Validated with `compose.dev.yml` using PostgreSQL, backend, Redis, Qdrant, MinIO, analysis, and mock workers.

Observed results:

| Check | Result |
| --- | --- |
| `GET /api/health` | `200` with backend dependencies available. |
| `GET /api/stats` without cookie | `401`. |
| `POST /api/auth/login` | `200`; response set `transcript_session` with `HttpOnly`. |
| `GET /api/auth/me` with cookie | `200`; returned safe user DTO only. |
| `GET /api/stats` with cookie | `200`. |
| `GET /transcripts/stats` without cookie | `401`. |
| `GET /transcripts/stats` with cookie | `200`. |
| `POST /api/auth/logout` | `200`; session revoked. |
| `GET /api/auth/me` after logout | `401`. |
| Backend restart | Existing admin was detected as already present and login still succeeded. |

## Automated Validation

Completed after implementation and documentation updates:

| Command | Result |
| --- | --- |
| `cd backend && go test ./...` | passed |
| `cd backend && go vet ./...` | passed |
| `cd frontend/transcription-frontend && npm run lint` | passed |
| `cd frontend/transcription-frontend && npx tsc --noEmit` | passed after fixing `LoadingState` prop usage |
| `cd frontend/transcription-frontend && npm run build` | passed |
| `docker compose -f compose.dev.yml config --quiet` | passed |

Additional route validation: `POST /api/export-pdf` without a valid session returned `401` from the Next.js route.

## Notes

Temporary runtime-only admin credentials were used for local validation and are not documented here. PostgreSQL data is stored in the `postgres_data` Compose volume and should not be deleted during normal cleanup.
