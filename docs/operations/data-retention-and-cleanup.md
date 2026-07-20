# Data Retention and Cleanup

Date: 2026-07-19

## Active Retention Categories

- Audit events: controlled by `auditRetentionDays` in System Settings.
- Notifications: controlled by `notificationRetentionDays` in System Settings.

Both values are measured in days. A value greater than `0` deletes records with `created_at` strictly older than the UTC cutoff `now - retentionDays`. A value of `0` retains that category indefinitely and skips cleanup.

## Preserved Data

Retention cleanup does not delete transcripts, transcript segments, analysis results, original uploaded media, folders, users, sessions, or system settings.

Transcript and original media retention are not supported and are not automatically deleted.

## Schedule

The backend starts a maintenance scheduler at application startup. It waits briefly after startup, then runs cleanup once every 24 hours until the backend shuts down.

Cleanup failures are logged and do not terminate the backend. The next scheduled run remains active.

## Locking

Cleanup uses two safeguards:

- An in-process atomic guard prevents overlapping cleanup runs inside one backend process.
- A PostgreSQL advisory lock prevents multiple backend instances from running cleanup simultaneously.

If the advisory lock is already held, the run is skipped and logged.

## Deletion Strategy

Cleanup uses indexed `created_at` predicates and batched deletes. The default batch size is 5,000 records per statement. Notifications are deleted whether read or unread when they are older than the cutoff.

Indexes:

- `audit_events_created_at_idx` on audit event timestamps.
- `notifications_created_at_idx` on notification timestamps, added by migration `006_cleanup_indexes.sql`.

## Audit And Logs

Each run is logged to application logs with deleted counts and retention values.

A persistent audit event `scheduled_cleanup_completed` is created when rows were deleted or when cleanup is manually triggered. Metadata includes deleted counts, retention days, and trigger (`scheduled` or `manual`). Scheduled runs with no deletions do not create a new audit event.

## Manual Cleanup

Run cleanup without waiting for the schedule:

```sh
cd backend
go run ./cmd/maintenance cleanup
```

The command uses the same cleanup service and current System Settings values. It prints deleted counts and exits non-zero on failure.
