# Admin User Management Implementation

Date: 2026-07-15

Status: implemented and validated for local dev stack.

## Files Created Or Modified

Backend files:

| File | Purpose |
| --- | --- |
| `backend/cmd/backend/main.go` | Registers `/api/admin` route group with `RequireAuth` and `RequireRole("admin")`. |
| `backend/internal/dtos/api.go` | Adds safe admin user DTOs and request/response types. |
| `backend/internal/handlers/admin_users.go` | Adds admin user-management HTTP handlers. |
| `backend/internal/handlers/api_helpers.go` | Maps admin service errors to standardized API errors. |
| `backend/internal/handlers/auth_test.go` | Adds admin role permit test. |
| `backend/internal/services/admin_users.go` | Adds admin user service, validation, pagination, activation, deactivation, reset, and safeguards. |
| `backend/internal/services/admin_users_test.go` | Adds focused admin service tests. |
| `backend/internal/services/api_errors.go` | Adds admin error codes. |

Frontend files:

| File | Purpose |
| --- | --- |
| `frontend/transcription-frontend/src/app/Admin/page.tsx` | Redirects `/Admin` to `/Admin/Users`. |
| `frontend/transcription-frontend/src/app/Admin/Users/page.tsx` | Admin users page wrapper. |
| `frontend/transcription-frontend/src/app/Admin/Users/users-client.tsx` | User list, filters, actions, and dialogs. |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Adds admin nav group and forbidden state. |
| `frontend/transcription-frontend/src/lib/admin-users-utils.ts` | Pure URL, label, date, validation, and action helpers. |
| `frontend/transcription-frontend/src/lib/api/admin-users.ts` | Typed admin API client. |
| `frontend/transcription-frontend/src/lib/api/types.ts` | Adds admin user API types. |
| `frontend/transcription-frontend/src/lib/auth-utils.ts` | Adds `/Admin` protected route and admin route helper. |

Docs:

| File | Purpose |
| --- | --- |
| `docs/api/frontend-backend-contract.md` | Documents admin user-management API. |
| `docs/audits/admin-user-management-implementation.md` | This implementation audit. |

## Endpoints

All admin endpoints are under `/api/admin` and require both authentication and admin role:

| Method | Path |
| --- | --- |
| `GET` | `/api/admin/users` |
| `POST` | `/api/admin/users` |
| `GET` | `/api/admin/users/:userId` |
| `PATCH` | `/api/admin/users/:userId` |
| `POST` | `/api/admin/users/:userId/activate` |
| `POST` | `/api/admin/users/:userId/deactivate` |
| `POST` | `/api/admin/users/:userId/reset-password` |

No unprotected legacy admin routes were added.

## Administrator Middleware

The route group uses `RequireAuth()` followed by `RequireRole("admin")`. Frontend role checks only control navigation and presentation; the Go backend is authoritative.

## DTOs

Added safe admin-facing DTOs:

| DTO | Fields |
| --- | --- |
| `AdminUserSummary` | `id`, `name`, `email`, `role`, `isActive`, `createdAt`, `updatedAt`, `lastLoginAt` |
| `AdminUserDetail` | Same fields for this stage. |

Passwords, password hashes, session tokens, and session token hashes are never returned.

## User List Filters And Pagination

`GET /api/admin/users` supports `page`, `pageSize`, `search`, `role`, and `status`.

Rules:

| Area | Behavior |
| --- | --- |
| Pagination | Defaults to page `1`, page size `20`, max page size `100`. |
| Search | Matches lowercase `name` and `email`. |
| Role | `user`, `admin`, or all. |
| Status | `active`, `inactive`, or all. |
| Ordering | `created_at DESC, id DESC`. |
| Query shape | Uses bounded SQL `LIMIT`/`OFFSET`; does not load all users into memory. |

## Creation Flow

Admins create users with name, email, role, and a temporary password. Email is normalized, uniqueness is enforced, roles are restricted to `user` and `admin`, and the existing Argon2id password hash implementation is reused. Accounts are active by default.

## Editing Flow

Admins can edit only name and role. Email is immutable in this stage. Unknown JSON fields are rejected. The backend prevents demoting the last active administrator.

## Activation And Deactivation

Activation sets `is_active=true` and updates `updated_at`.

Deactivation sets `is_active=false`, updates `updated_at`, and revokes active sessions for the target user in one bounded update. The backend prevents self-deactivation and deactivation of the last active administrator.

## Password Reset

Admins reset passwords by submitting `newPassword`. The new password must satisfy the existing password policy, is hashed with Argon2id, and is never returned. All active sessions for the target user are revoked. Self-reset is allowed and requires the administrator to sign in again.

## Session Revocation

`RevokeAllSessionsForUser(userId)` performs one bounded update over `sessions` and is reused for security actions. The active auth middleware already rejects revoked sessions immediately because `AuthenticateSession` requires `revoked_at IS NULL`.

## Last-Admin Safeguards

The service prevents actions that would leave zero active administrators:

| Action | Safeguard |
| --- | --- |
| Deactivate admin | Locks active admin rows in a serializable transaction and requires another active admin. |
| Demote admin to user | Locks active admin rows in a serializable transaction and requires another active admin. |

## Frontend Route Protection

`/Admin` redirects to `/Admin/Users`. The app shell waits for auth resolution, redirects unauthenticated users to `/Login`, and shows a concise forbidden state to authenticated non-admin users.

## Responsive Behavior

Desktop uses a table with name, email, role, status, last login, created date, and actions. Mobile uses compact cards with the same core fields and explicit action buttons.

## Tests

Added focused backend tests for admin role middleware, list filters, user creation, duplicate email, invalid role, weak password, update name/role, last-admin demotion safeguard, activation, deactivation session revocation, self-deactivation rejection, last-admin deactivation safeguard, password reset session revocation, and DTO safety.

No frontend test framework exists. Pure helpers were added for URL-state normalization, role/status labels, password confirmation, date formatting, and admin action availability.

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
| Development admin sign-in | `200`. |
| Admin user list | `200`. |
| Create standard user | `201`. |
| Duplicate email rejection | `409`. |
| Standard user sign-in | `200`. |
| Standard user admin route access | `403`. |
| User detail retrieval | `200`. |
| Edit name and promote to admin | `200`. |
| Search/filter users | `200`. |
| Password reset | `200`. |
| Old session after reset | `401`. |
| Old password after reset | `401`. |
| Deactivate user | `200`. |
| Login while inactive | `401`. |
| Reactivate user | `200`. |
| Login with reset password | `200`. |
| Deactivate original bootstrap admin using second admin | `200`. |
| Demote last active admin | `409`. |
| Restore bootstrap admin and demote test user | `200`. |
| Backend restart persistence | admin login, user detail, and user login all returned `200`. |
| `/Admin/Users` built Next route | returned `200` during a temporary local `next start` check. |

## Known Limitations

| Limitation | Note |
| --- | --- |
| No permanent delete | Intentionally out of scope. |
| No email/invite flow | Admin supplies temporary password manually. |
| No self-service password change | Out of scope. |
| No audit log | Out of scope. |
| No frontend component tests | Deferred until a frontend test framework is introduced. |

## Next Administration Stage

Recommended next stage: administration audit log for user-management actions, followed by job administration only after transcript ownership and deletion rules are designed.
