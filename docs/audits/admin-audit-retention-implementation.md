# Admin Audit Retention Implementation

Date: 2026-07-15

Status: implemented for explicit backend maintenance cleanup.

## Scope

Audit retention is implemented as a backend-only maintenance command. It does not add browser deletion APIs, audit editing APIs, audit deletion UI, automatic schedulers, or startup cleanup.

## Configuration

`AUDIT_RETENTION_DAYS` controls the retention window.

| Setting | Value |
| --- | --- |
| Default | `365` days |
| Minimum | `30` days |
| Maximum | `3650` days |

Invalid values fail the maintenance command before any deletion occurs.

## Command

From `backend/`:

```sh
go run ./cmd/audit-cleanup --dry-run
go run ./cmd/audit-cleanup
```

Options:

| Option | Purpose |
| --- | --- |
| `--dry-run` | Counts expired audit events and deletes nothing. |
| `--batch-size` | Maximum rows deleted per SQL statement. Defaults to `500`. |

The command prints only retention days, UTC cutoff, eligible count, deleted count, dry-run status, and batch size. It does not print actor, resource, metadata, action, user-agent, or event contents.

## Cleanup Behavior

`services.AuditRetentionCutoff` calculates a deterministic UTC cutoff from the current time and retention days.

`services.DeleteAuditEventsBefore` counts rows where `created_at < cutoff`. In dry-run mode it returns that count without deleting rows.

In delete mode, it removes expired rows in bounded batches using the existing `audit_events_created_at_idx` ordering and `FOR UPDATE SKIP LOCKED`, so overlapping cleanup runs can safely make progress without deleting the same rows twice.

## Non-Goals

This change does not archive old audit rows, delete transcript/Qdrant/MinIO data, clean Docker images, manage jobs, or expose cleanup to frontend users.

## Files Changed

| File | Purpose |
| --- | --- |
| `backend/internal/services/audit.go` | Retention config parsing, UTC cutoff helper, dry-run/count/delete logic. |
| `backend/cmd/audit-cleanup/main.go` | Explicit maintenance CLI. |
| `backend/internal/services/init.go` | Reusable database-only connection helper. |
| `backend/internal/services/audit_test.go` | Retention config, cutoff, dry-run, and batched deletion tests. |
| `env.example` | Documents `AUDIT_RETENTION_DAYS` and dry-run command. |
| `docs/api/frontend-backend-contract.md` | Notes that audit APIs remain read-only. |
