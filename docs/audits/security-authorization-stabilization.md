# Security Authorization Stabilization

Status: implemented and validated for the authenticated application baseline on `feature/auth-admin`.

## Git Baseline

Branch check passed: local `feature/auth-admin` was clean before this stabilization stage and matched `origin/feature/auth-admin` at heartbeat commit `bd083f6`.

## Route Authorization Matrix

| Method | Route | Authorization | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Minimal readiness/dependency status; no hosts, URLs, credentials, queues, or worker instances. |
| `POST` | `/api/auth/login` | Public | Strict bounded JSON, generic invalid-credential response, rate-limited. |
| `POST` | `/api/auth/logout` | Authenticated | Revokes current session and clears cookie. |
| `GET` | `/api/auth/me` | Authenticated | Returns safe user DTO only. |
| `POST` | `/api/uploads` | Authenticated | Transcript upload alias. |
| `GET` | `/api/stats` | Authenticated | Dashboard stats. |
| `GET` | `/api/search/transcripts` | Authenticated | Search query is audited by length only. |
| `GET` | `/api/transcripts` | Authenticated | Transcript list. |
| `GET` | `/api/transcripts/:jobId` | Authenticated | Transcript detail; records view audit. |
| `PATCH` | `/api/transcripts/:jobId/segments/:segmentId` | Authenticated | Segment text edit with ownership check. |
| `GET` | `/api/transcripts/:jobId/analysis` | Authenticated | Stored analysis read only. |
| `POST` | `/api/transcripts/:jobId/analyse` | Authenticated | Existing analysis flow through backend. |
| `POST` | `/api/audit/pdf-export` | Authenticated | Controlled PDF audit event only. |
| `GET` | `/api/admin/users` | Administrator-only | User list. |
| `POST` | `/api/admin/users` | Administrator-only | User creation. |
| `GET` | `/api/admin/users/:userId` | Administrator-only | User detail. |
| `PATCH` | `/api/admin/users/:userId` | Administrator-only | Name/role update only. |
| `POST` | `/api/admin/users/:userId/activate` | Administrator-only | Activation. |
| `POST` | `/api/admin/users/:userId/deactivate` | Administrator-only | Deactivation and session revocation. |
| `POST` | `/api/admin/users/:userId/reset-password` | Administrator-only | Password reset and session revocation. |
| `GET` | `/api/admin/audit` | Administrator-only | Read-only audit list. |
| `GET` | `/api/admin/audit/:eventId` | Administrator-only | Read-only audit detail. |
| `GET` | `/api/admin/jobs` | Administrator-only | Job list. |
| `GET` | `/api/admin/jobs/health` | Administrator-only | Dependency, queue, and worker-heartbeat summary. |
| `GET` | `/api/admin/jobs/:jobId` | Administrator-only | Job detail. |
| `POST` | `/api/admin/jobs/:jobId/retry` | Administrator-only | Controlled retry only. |
| `POST` | `/upload` | Authenticated legacy compatibility | Protected by same auth middleware as `/api/uploads`. |
| `GET` | `/transcripts` | Authenticated legacy compatibility | Protected legacy list. |
| `GET` | `/transcripts/stats` | Authenticated legacy compatibility | Protected legacy stats. |
| `POST` | `/transcripts/:job_id/analyse` | Authenticated legacy compatibility | Protected legacy analysis route. |

Expected public routes are limited to `GET /api/health` and `POST /api/auth/login`.

## Session Review

Sessions use cryptographically random opaque tokens. Only SHA-256 token hashes are stored in PostgreSQL. Authentication rejects missing, malformed, unknown, expired, revoked, inactive-user, and deleted-user sessions with the same external `401 UNAUTHENTICATED` response.

Logout revokes the current session. User deactivation and admin password reset revoke all target-user sessions. Backend restart persistence is provided by PostgreSQL sessions. `last_seen_at` is now throttled to avoid a database write on every authenticated request.

## Cookie Settings

Session cookies are application-specific, HttpOnly, `SameSite=Lax`, `Path=/`, and use `SESSION_SECURE` for the `Secure` flag. Local development defaults to `Secure=false`; production should set `SESSION_SECURE=true`. Logout clears the same cookie name/path/SameSite/Secure combination. No JavaScript-readable duplicate auth cookie is used.

If frontend and backend are deployed as different sites rather than different origins on the same site, the future deployment will need `SameSite=None; Secure` and a matching CSRF review.

## CORS

Credentialed CORS uses exact `FRONTEND_ORIGIN` matching. Wildcard origin is not used with credentials. Allowed methods cover current browser API usage: `GET`, `POST`, `PATCH`, and `OPTIONS`. Unapproved origins do not receive `Access-Control-Allow-Origin` and are rejected for state-changing browser requests.

## Login Security

Login uses generic invalid-credential responses for unknown, invalid, and inactive accounts. Email is normalized before lookup. Passwords are never logged. Login JSON is now bounded and rejects unknown fields.

Failed login attempts are limited to 5 per normalized identifier and IP over 15 minutes. Redis is used when available; if Redis fails, a local in-process fallback is used so Redis failure does not make login universally unavailable. Successful login clears the relevant counter. The `429` code is `TOO_MANY_LOGIN_ATTEMPTS`.

## Frontend Protection

The auth provider stores only safe user state in React memory and does not use localStorage/sessionStorage for tokens. Protected pages show a session-check loading state before rendering sensitive content. Unauthenticated protected routes redirect to `/Login`; Admin navigation is shown only for administrators. Direct `/Admin/*` access by a standard user shows a concise forbidden state, while backend admin APIs remain authoritative.

## Return Path Safety

Login return paths are sanitized by a pure helper. Only internal relative paths beginning with a single `/` are accepted. External URLs, protocol-relative URLs, backslash variants, encoded external paths, control characters, and `/Login` are rejected to `/`.

## PDF Route Protection

The Next.js PDF route requires a cookie and validates it by forwarding only the incoming cookie to backend `/api/auth/me`. Validation uses server-side `BACKEND_URL`, does not accept an arbitrary auth endpoint, now has a timeout, and fails closed. Audit events are sent only after session validation. Transcript and analysis content is escaped for HTML rendering and is not logged by the route.

## Admin Safeguards

User management prevents self-deactivation, last-active-admin deactivation, and last-active-admin demotion. Email is immutable in update flow, roles are constrained, unknown JSON fields are rejected, passwords are never returned, and deactivation/password reset revoke sessions.

Job administration is admin-only, rejects non-failed states, rejects recognized unavailable target workers with `WORKER_UNAVAILABLE`, preserves retry limits, never accepts queue names from the browser, and does not return raw payloads or worker URLs.

Audit administration is read-only and administrator-only. No delete, update, clear, or retention API route exists.

## CSRF Posture

Cookie authentication is protected by `SameSite=Lax`, exact credentialed CORS, JSON/multipart request shapes, and a new lightweight Origin/Referer check for `POST`, `PATCH`, and future `DELETE` browser requests. Requests from the configured frontend origin are allowed. Requests with untrusted `Origin` or `Referer` are rejected with `403 FORBIDDEN`. Non-browser/internal requests without either header remain allowed.

## Sensitive Data Review

Targeted source review found no intentional response DTOs containing password hashes, session tokens, token hashes, MinIO credentials, database URLs, raw Redis payloads, Qdrant vectors, or worker instance IDs outside the admin worker-health summary. Analysis error handling was hardened so upstream/provider response bodies and raw errors are not returned or logged.

Known deployment-sensitive placeholders remain in Compose for local/dev services, including MinIO and PostgreSQL defaults. They are not production credentials and should be overridden for production.

## Audit Coverage

Audit coverage exists for successful login, failed login, logout, user creation/update/activation/deactivation/password reset, transcript upload/view/segment update, analysis start/completion/failure, search, PDF success/failure, and job retry requested/succeeded/failed. Audit metadata is allowlisted and excludes passwords, session tokens, cookies, authorization headers, transcript text, analysis text, provider responses, and raw search queries. Worker heartbeats do not create audit events.

## Migration Review

Migrations are ordered by filename and recorded in `schema_migrations`. Auth/session and audit migrations are idempotent at the SQL object level and do not depend on Qdrant, Redis, or MinIO. Session token lookup is indexed by primary key plus active lookup index. Email uniqueness is enforced on normalized stored email. Audit retention uses the indexed `created_at` ordering.

## Runtime Security Matrix

The matrix is intended to be validated against `compose.dev.yml` with one admin, one active standard user, and one inactive standard user. Required expectations are: unauthenticated protected APIs return `401`, standard users can use transcript/search/PDF workflows but receive `403` for admin APIs, administrators can use admin APIs and worker health, inactive and revoked sessions return `401`, approved origins work, unapproved origins are rejected, and preflight succeeds.

## Defects Found

| Defect | Impact | Fix |
| --- | --- | --- |
| `last_seen_at` updated on every authenticated request. | Avoidable DB write amplification. | Throttled update to stale sessions only. |
| Login attempt limiter counted every attempt and used non-recommended code/policy. | Successful logins could contribute to lockout; error-code inconsistency. | Count failed attempts only, clear on success, use 5/15 policy and `TOO_MANY_LOGIN_ATTEMPTS`. |
| Login JSON was not size-bounded or strict. | Oversized/unknown-field login bodies accepted. | Added bounded strict JSON decoding. |
| State-changing cookie-auth requests had no explicit Origin/Referer check. | CSRF defense relied only on SameSite/CORS. | Added lightweight trusted-origin middleware. |
| Login return-path sanitizer accepted backslash/control edge cases. | Potential unsafe redirect normalization edge cases. | Hardened pure sanitizer. |
| PDF auth validation had no timeout. | Backend auth check could hang PDF route. | Added auth-check timeout. |
| Analysis errors could expose upstream details/provider response in responses/logs. | Sensitive provider or infrastructure details could leak. | Replaced with safe public messages and removed raw provider-response logging. |

## Fixes Applied

Files changed are listed in the final response for this stage. No ML behavior, queue payload contracts, retry limits, model files, Qdrant transcript schema, or MinIO object handling were changed.

## Remaining Limitations

Transcript ownership, team sharing, MFA, self-service password change, deletion, cancellation, deployment hardening, and frontend Docker support remain intentionally out of scope. Production Compose still contains local placeholder credentials and lacks the analysis service noted in architecture docs. Direct public MinIO bucket policy remains part of existing media behavior and was not changed.

## Merge Recommendation

Recommended to merge after automated validation and controlled dev-stack runtime matrix pass.
