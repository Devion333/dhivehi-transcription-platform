# Admin Account Management Audit

## Scope

Implemented account and administrative management improvements on `feature/admin-account-management`:

1. Self-service user profile management.
2. Administrator transcript reassignment.
3. Filtered Audit CSV export.

Authentication architecture, worker behavior, transcript content, processing behavior, speaker renaming, and existing ownership authorization rules were not weakened.

## User Profile

Endpoints:

```http
GET /api/account/profile
PATCH /api/account/profile
```

Both endpoints require an authenticated active session and use the current session user. They do not accept a user ID.

Editable field:

```text
displayName
```

Read-only fields:

```text
email
role
status
user ID
password
```

PATCH validation:

| Rule | Behavior |
| --- | --- |
| JSON content type | Required. |
| Body size | Bounded by existing auth JSON limit. |
| Unknown fields | Rejected. |
| Display name | Trimmed, non-empty, max 100 characters, no control characters. |
| Inactive/revoked users | Cannot update because authentication/session validation blocks them; service also checks active user state. |

Frontend route:

```text
/Account/Profile
```

The account menu now links to Profile next to Security. Successful profile updates refresh the AuthProvider user object so the account menu displays the new name without logout.

## Ownership Snapshot Decision

Existing transcript `owner_display_name` snapshots remain historical snapshots. Profile updates change `users.name` only. Transcript authorization continues to use `owner_user_id`, so changing a display name does not change transcript access.

## Profile Audit Events

Added:

```text
profile_viewed
profile_updated
profile_update_failed
```

Safe metadata for update events is limited to:

```text
changedFields
```

Old/new display names are not stored in audit metadata.

## Transcript Reassignment

Admin-only endpoints:

```http
GET  /api/admin/transcripts/:jobId/reassignment-options
POST /api/admin/transcripts/:jobId/reassign
```

Request:

```json
{
  "newOwnerUserId": "<user-id>"
}
```

Behavior:

| Requirement | Implementation |
| --- | --- |
| Admin-only | Routes are under `/api/admin` with admin role middleware. |
| Transcript existence | Existing parent transcript lookup is used. |
| Target user | Loaded from PostgreSQL by ID and must be active. |
| Target roles | Active standard users and active admins are allowed. |
| Same owner | Rejected with `TRANSCRIPT_OWNER_UNCHANGED`. |
| Ownerless legacy transcript | Can be assigned. |
| Browser-submitted snapshots | Ignored; backend derives display name/email from PostgreSQL. |
| Updated fields | `owner_user_id`, `owner_display_name`, `owner_email`, `updated_at`. |
| Preserved data | Transcript content, segments, speaker names, status, analysis, and media references. Segment payloads are not rewritten. |

Access effect is immediate on subsequent backend API calls. The previous standard owner loses access, the new owner gains access, and administrators retain access. Active sessions are not revoked.

Frontend Transcript Details now shows an admin-only Ownership section and reassignment dialog. Standard users do not see this UI.

## Reassignment Audit Events

Added:

```text
transcript_reassignment_succeeded
transcript_reassignment_failed
```

Safe metadata:

```text
jobId
previousOwnerUserId
newOwnerUserId
```

Owner emails, display names, transcript text, and media data are not stored.

## Audit CSV Export

Endpoint:

```http
GET /api/admin/audit/export
```

The endpoint is administrator-only and accepts the same filters as `GET /api/admin/audit`:

```text
search
category
outcome
actorUserId
resourceType
resourceId
```

The server queries records from the database using active filters. It does not export client-submitted rows and is not limited to the visible Audit table page.

Maximum export size is 10,000 matching rows. If filters match more than 10,000 rows, the API returns `AUDIT_EXPORT_TOO_LARGE` and asks the administrator to narrow filters. Header-only CSV is produced when no records match.

CSV response:

| Header | Value |
| --- | --- |
| `Content-Type` | `text/csv; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="audit-events-YYYY-MM-DD.csv"` |

CSV columns:

```text
Timestamp
Actor display name
Actor email
Actor role
Action
Outcome
Target type
Target ID
Failure code
IP address
Metadata summary
```

CSV output includes a UTF-8 BOM for spreadsheet compatibility and uses server-side CSV escaping for commas, quotes, line breaks, and Unicode.

Metadata summary is built from existing allowlisted audit metadata. It does not include password values, session tokens, cookies, transcript text, analysis text, raw search queries, provider responses, MinIO paths, Redis payloads, stack traces, or internal database fields.

The export query runs before `audit_export_succeeded` is recorded so the export audit event does not unpredictably contaminate the exported dataset.

## Audit Export Events

Added:

```text
audit_export_succeeded
audit_export_failed
```

Safe metadata:

```text
rowCount
filterTypes
truncated
```

Raw search text and exported CSV content are not stored.
