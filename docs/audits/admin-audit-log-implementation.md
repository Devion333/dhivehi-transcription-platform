# Admin Audit Log Implementation

Date: 2026-07-15

Status: implemented and validated for local dev stack.

## Files Created Or Modified

Backend:

| File | Purpose |
| --- | --- |
| `backend/migrations/002_audit_events.sql` | Adds persistent PostgreSQL audit table and indexes. |
| `backend/internal/services/audit.go` | Audit service/repository functions, metadata sanitizer, query methods, DTO mapping. |
| `backend/internal/services/audit_test.go` | Audit schema/service tests. |
| `backend/internal/services/api_errors.go` | Adds audit error codes. |
| `backend/internal/dtos/api.go` | Adds audit DTOs and PDF audit request DTO. |
| `backend/internal/handlers/audit.go` | Adds admin audit API and controlled PDF export audit endpoint. |
| `backend/internal/handlers/audit_helpers.go` | Adds request-context audit helpers. |
| `backend/internal/handlers/audit_test.go` | Adds audit handler tests. |
| `backend/internal/handlers/auth.go` | Records login success, login failure, and logout events. |
| `backend/internal/handlers/admin_users.go` | Records user-management events. |
| `backend/internal/handlers/upload.go` | Records upload events. |
| `backend/internal/handlers/api.go` | Records transcript view, segment edit, and search events. |
| `backend/internal/handlers/analyse.go` | Records analysis started/completed/failed events. |
| `backend/internal/handlers/api_helpers.go` | Maps audit errors. |
| `backend/cmd/backend/main.go` | Registers audit routes. |

Frontend:

| File | Purpose |
| --- | --- |
| `frontend/transcription-frontend/src/lib/api/admin-audit.ts` | Typed audit API client. |
| `frontend/transcription-frontend/src/lib/admin-audit-utils.ts` | Pure labels, URL-state, date, and metadata helpers. |
| `frontend/transcription-frontend/src/app/Admin/Audit/page.tsx` | Audit page wrapper. |
| `frontend/transcription-frontend/src/app/Admin/Audit/audit-client.tsx` | Audit list, filters, pagination, and detail dialog. |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Adds Audit admin navigation. |
| `frontend/transcription-frontend/src/lib/api/types.ts` | Adds audit types. |
| `frontend/transcription-frontend/src/app/api/export-pdf/route.ts` | Calls backend PDF audit endpoint on success/failure. |

Docs:

| File | Purpose |
| --- | --- |
| `docs/api/frontend-backend-contract.md` | Documents audit APIs and DTOs. |
| `docs/audits/admin-audit-log-implementation.md` | This audit document. |

## Schema And Migration

Migration `002_audit_events.sql` creates append-only application audit records in PostgreSQL:

```text
id UUID primary key
actor_user_id nullable UUID snapshot reference only, no foreign key
actor_name
actor_email
actor_role
category
resource_type
resource_id
outcome success|failure
ip_address
user_agent
metadata_json jsonb
created_at
```

Indexes were added on `created_at`, `actor_user_id`, `action`, `category`, and `(resource_type, resource_id)`.

No foreign key is used for `actor_user_id`, preserving historic records if users are later deleted or deactivated.

## Recorded Categories And Actions

| Category | Actions |
| --- | --- |
| `authentication` | `auth.login_succeeded`, `auth.login_failed`, `auth.logout` |
| `user_management` | `admin.user_created`, `admin.user_updated`, `admin.user_activated`, `admin.user_deactivated`, `admin.password_reset` |
| `transcript` | `transcript.uploaded`, `transcript.viewed`, `transcript.segment_updated` |
| `analysis` | `analysis.started`, `analysis.completed`, `analysis.failed` |
| `search` | `search.executed` |
| `export` | `export.pdf_generated`, `export.pdf_failed` |

## Sensitive Data Rules

The metadata sanitizer is allowlist-based per action. It discards unknown keys and keys containing sensitive names such as password, token, cookie, authorization, transcript text, summary, translation, API key, and connection string.

Audit records do not intentionally store passwords, password hashes, session tokens, cookie contents, authorization headers, transcript contents, search queries, analysis summaries, English translations, provider responses, API keys, Qdrant payloads, MinIO credentials, local temp paths, or database connection strings.

Failed login metadata stores `loginIdentifierHash`, a SHA-256 hash of the normalized email identifier, not the submitted password and not the plaintext email.

## Audit Service Architecture

`services.RecordAuditEvent(ctx, AuditEventInput)` validates the action/category/outcome, captures actor snapshots, sanitizes metadata, enforces a metadata size limit, and inserts into `audit_events`.

`services.ListAuditEvents` and `services.GetAuditEvent` provide admin API reads with safe DTO mapping.

Handlers call reusable request helpers from `audit_helpers.go` rather than issuing direct SQL inserts.

## Failure Strategy

Audit writes are attempted after successful primary operations from handlers. If an audit insert fails, the server logs the failure and the original successful response remains successful. This avoids making routine operations unusable due to audit storage issues.

Current limitation: user-management events are not transaction-coupled with the user-management database mutation. Failures are logged server-side and documented here.

## Authentication Events

Successful login records actor snapshot and `resourceType=user` with the user ID. Failed login records no actor and only a hashed normalized login identifier. Logout records `resourceType=session` without token or session database identifiers.

## User-Management Events

Admin user creation, update, activation, deactivation, and password reset are recorded. Metadata includes safe fields such as target user ID, target role, changed fields, previous/new role, active-state transition, and whether sessions were revoked. Password reset metadata never includes the password.

## Transcript Events

Upload events include job ID, filename, category, reference number, and requested speaker count. Transcript detail retrieval records `transcript.viewed`. Segment updates record job ID, segment ID, segment index, and changed field name only. Old/new transcript text is never stored.

## Analysis Search Export Events

Analysis records started/completed/failed with transcript resource ID, status, duration, and provider label only. Search records query length, page, page size, status/category filters, and result count; it does not store raw query text. PDF export is recorded through `POST /api/audit/pdf-export`, which only accepts job ID, format, include-analysis flag, and outcome.

## Admin API

Admin-only endpoints:

| Method | Path |
| --- | --- |
| `GET` | `/api/admin/audit` |
| `GET` | `/api/admin/audit/:eventId` |

Authenticated non-admin users receive `403` through backend role enforcement.

## Frontend Route And Filters

`/Admin/Audit` is protected by the existing admin route boundary. It supports URL-backed filters for search, category, outcome, date from, and date to. Page size is fixed at `50`. Desktop renders a table; mobile renders cards.

## Event Detail Behavior

The detail dialog shows timestamp, actor, action, category, outcome, resource, IP address, user agent, and safe formatted metadata. It does not show raw JSON or absent values.

## Tests

Added backend tests for migration/schema content, successful insertion, actor snapshot, nullable actor for failed login, metadata allowlisting, sensitive-key removal, metadata size limit, segment update text exclusion, search query exclusion, audit list pagination/filter validation, admin-only route enforcement, standard-user `403`, and constrained PDF audit endpoint behavior.

## Validation

Automated validation completed:

| Command | Result |
| --- | --- |
| `cd frontend/transcription-frontend && npm run lint` | passed |
| `cd frontend/transcription-frontend && npx tsc --noEmit` | passed |
| `cd frontend/transcription-frontend && npm run build` | passed |
| `cd backend && go test ./...` | passed |
| `cd backend && go vet ./...` | passed |
| `docker compose -f compose.dev.yml config --quiet` | passed |

Controlled runtime validation completed against the lightweight `compose.dev.yml` stack:

| Check | Result |
| --- | --- |
| Successful admin login | `200`, event recorded. |
| Failed login | `401`, event recorded with hashed identifier only. |
| Create test user | `201`, event recorded. |
| Edit test user | `200`, event recorded. |
| Deactivate/reactivate test user | `200`, events recorded. |
| Reset password | `200`, event recorded without password. |
| Standard user audit API access | `403`. |
| Upload small test transcript | `201`, event recorded. |
| View transcript detail | `200`, event recorded. |
| Update one segment | `200`, event recorded without transcript text. |
| Run search | `200`, event recorded without raw query. |
| Trigger analysis | `200`, started/completed events recorded. |
| PDF export audit endpoint | `200`, export event recorded. |
| Admin audit list | `200`. |
| Category/outcome filter | `200`. |
| Audit event detail | `200`. |
| Expected action coverage | No missing required actions. |
| Sensitive detail check | Passed for passwords and edited transcript marker. |
| Database metadata leak check | `0` rows matched test passwords, failed password, or edited transcript marker. |
| Backend restart persistence | Admin login and audit query both returned `200`. |

The Next.js `/Admin/Audit` route was not started with a long-lived frontend server during this validation run; build/type validation confirmed the route compiles.

## Retention Limitation

No automatic retention, deletion, editing, or export is implemented. Future retention should keep security-sensitive audit events for a configured period and archive or purge only through controlled maintenance.

## Next Administration Stage

Recommended next stage: job administration planning only after audit retention and transcript ownership rules are designed.
