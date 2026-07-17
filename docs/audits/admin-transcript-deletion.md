# Admin Transcript Deletion Audit

## Scope

Administrative transcript deletion is implemented as a focused, two-step flow. Standard users cannot preview or delete transcripts, including transcripts they own. User records, sessions, audit records, and unrelated transcript resources are not deleted.

## Endpoints

Preview:

```text
GET /api/admin/transcripts/:jobId/deletion-preview
```

Delete:

```text
DELETE /api/admin/transcripts/:jobId
```

Delete request:

```json
{
  "confirmation": "<jobId>"
}
```

Unknown fields and oversized bodies are rejected. Confirmation mismatch returns `DELETE_CONFIRMATION_MISMATCH`.

## Preview Behavior

Preview returns safe metadata: job ID, filename, owner display/email, segment count, media object count, status, `canDelete`, and `blockingReason`. It does not expose raw Qdrant points, Redis payloads, transcript text, analysis text, MinIO object keys, credentials, or bucket configuration.

If the transcript is processing or queued/processing in worker queues, preview returns `canDelete: false` and `blockingReason: TRANSCRIPT_PROCESSING`.

## Cleanup Order

Deletion uses trusted references loaded from Qdrant parent/segment payloads and runs in this order:

1. Verify administrator via route middleware and validate confirmation.
2. Load parent and segment payloads.
3. Reject active processing/queued transcripts.
4. Collect and validate referenced MinIO objects.
5. Delete referenced MinIO objects.
6. Delete Qdrant segment points by `type=segment` and `parent_job_id`.
7. Delete Qdrant parent point by `type=parent` and `job_id`.
8. Remove safe job-scoped queued/failed Redis entries and narrow job retry metadata keys.
9. Record audit success.

## Media Safety

Only `uploads` and `audio` bucket URLs referenced by parent or segment payloads are eligible for deletion. Empty keys, bucket-root deletion, traversal, absolute-style paths, wildcard-style values, and malformed/external references are rejected with `UNSAFE_MEDIA_REFERENCE`. Duplicate media references are deduplicated before deletion.

## Partial Failure

If one cleanup category fails after prior categories succeeded, the API returns `TRANSCRIPT_DELETION_PARTIAL` with safe category names in `partialCleanupCategories`. Provider credentials, raw paths, and raw infrastructure errors are not returned. Missing objects are tolerated by MinIO deletion semantics. Retrying deletion is safe; after successful parent deletion, a later request may return `TRANSCRIPT_NOT_FOUND`.

## Redis Behavior

Redis cleanup is intentionally narrow. It removes matching entries from queued/failed job lists where decoded payload `file_id` or `segment_id` belongs exclusively to the target job. It does not delete processing lists or worker heartbeat keys.

## Audit Behavior

Audit events added:

- `transcript_deletion_previewed`
- `transcript_deletion_succeeded`
- `transcript_deletion_failed`

Metadata is allowlisted to safe values: `jobId`, `segmentCount`, `mediaObjectCount`, `failureCode`, and `partialCleanupCategories`. Transcript text, analysis text, MinIO object paths, Redis payloads, confirmation text, credentials, and raw errors are not stored.

## Frontend Flow

Transcript Details shows an administrator-only danger zone. Admins fetch a preview before confirmation, review filename, owner, segment count, media count, and status, then type the job ID to enable deletion. Blocked processing transcripts show the blocking reason. Successful deletion redirects to `/Transcripts`; partial failures show safe retry guidance.

## Validation

Automated tests cover preview blocking, confirmation mismatch, successful Qdrant segment/parent delete filters, media reference deduplication and unsafe rejection, repeated missing transcript behavior, and audit metadata sanitization. Full validation results are reported in the implementation summary.
