# Transcript Ownership Access Control Audit

## Summary

Implemented transcript ownership enforcement in the backend. New uploads persist authenticated uploader metadata on the parent Qdrant transcript payload. Standard users are scoped to transcripts whose `owner_user_id` matches their session user ID. Admins can access all transcripts, including legacy ownerless records.

## Enforcement Points

- `GET /api/transcripts` is scoped by authenticated user unless admin.
- `GET /api/stats` counts only accessible transcripts and their segments unless admin.
- `GET /api/search/transcripts` searches only segments whose parent transcript is accessible.
- `GET /api/transcripts/:jobId` verifies parent transcript access before returning detail or segments.
- `PATCH /api/transcripts/:jobId/segments/:segmentId` verifies parent transcript access before editing a segment.
- `GET /api/transcripts/:jobId/analysis` verifies parent transcript access before returning stored analysis.
- `POST /api/transcripts/:jobId/analyse` and legacy analyse verify parent transcript access before reading segments or sending transcript text to analysis.
- `POST /api/audit/pdf-export` verifies parent transcript access before recording export audit events.
- Legacy transcript list/stats handlers now use scoped service calls.

## Ownership Schema

Parent transcript payload fields added on upload:

- `owner_user_id`
- `owner_display_name`
- `owner_email`

These values are derived from the authenticated backend session. The browser cannot supply or override them.

## Legacy Behavior

Parent transcripts without `owner_user_id` are treated as legacy ownerless records. They are visible and accessible to admins only. Standard users receive `403 FORBIDDEN` for direct access to an ownerless or another user's transcript.

## Frontend Notes

The frontend relies on backend API scoping for standard users. Admin users see compact owner metadata in transcript list/detail views. The PDF export route now verifies `jobId` access through the protected backend transcript detail API before rendering client-submitted PDF content.

## Sensitive Data

Audit events identify actor and transcript/job IDs but do not store transcript text, analysis text, tokens, or PDF payload content.
