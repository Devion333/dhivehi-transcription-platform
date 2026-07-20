# Activity Diagram Notes

Date generated: 2026-07-20

## Purpose

This document provides notes for the 11 UML activity diagrams describing the platform's core workflows. Each diagram uses swimlane partitions to separate user, system, and service responsibilities and is intended for inclusion in the Design and Implementation chapter.

## Diagram Index

| ID | Title | Source | Export |
|----|-------|--------|--------|
| AD_01 | User Authentication | `source/activity-diagrams/ad-01-user-authentication.puml` | `exported/activity-diagrams/ad-01-user-authentication.svg` |
| AD_02 | Media Upload and Processing | `source/activity-diagrams/ad-02-media-upload-and-processing.puml` | `exported/activity-diagrams/ad-02-media-upload-and-processing.svg` |
| AD_03 | View and Search Transcripts | `source/activity-diagrams/ad-03-view-and-search-transcripts.puml` | `exported/activity-diagrams/ad-03-view-and-search-transcripts.svg` |
| AD_04 | View, Edit and Rename Transcript Speakers | `source/activity-diagrams/ad-04-edit-transcript-and-rename-speakers.puml` | `exported/activity-diagrams/ad-04-edit-transcript-and-rename-speakers.svg` |
| AD_05 | Transcript Review and Approval | `source/activity-diagrams/ad-05-transcript-review-and-approval.puml` | `exported/activity-diagrams/ad-05-transcript-review-and-approval.svg` |
| AD_06 | Download Transcript | `source/activity-diagrams/ad-06-download-transcript.puml` | `exported/activity-diagrams/ad-06-download-transcript.svg` |
| AD_07 | Run and View Transcript Analysis | `source/activity-diagrams/ad-07-run-and-view-analysis.puml` | `exported/activity-diagrams/ad-07-run-and-view-analysis.svg` |
| AD_08 | Manage Folders | `source/activity-diagrams/ad-08-manage-folders.puml` | `exported/activity-diagrams/ad-08-manage-folders.svg` |
| AD_09 | Administrative Transcript and Job Management | `source/activity-diagrams/ad-09-admin-transcript-and-job-management.puml` | `exported/activity-diagrams/ad-09-admin-transcript-and-job-management.svg` |
| AD_10 | Configure System Settings and Maintenance Mode | `source/activity-diagrams/ad-10-system-settings-and-maintenance.puml` | `exported/activity-diagrams/ad-10-system-settings-and-maintenance.svg` |
| AD_11 | Scheduled Cleanup of Expired System Records | `source/activity-diagrams/ad-11-scheduled-record-cleanup.puml` | `exported/activity-diagrams/ad-11-scheduled-record-cleanup.svg` |

## AD_01 — User Authentication

**Swimlanes:** User, System

**Workflow:** User opens the login page and enters credentials. System validates required fields, verifies credentials and account state, then creates a session and determines the user's role to display the appropriate dashboard. On logout, the session is cleared. Failure branches cover missing fields, invalid credentials, disabled accounts, and authentication service unavailability.

## AD_02 — Media Upload and Processing

**Swimlanes:** User, System, Processing Worker

**Workflow:** User opens the upload page; system checks maintenance and upload settings. If permitted, user selects a file and submits. System validates, stores media, and (if automatic processing is enabled) queues a job. The processing worker runs a three-stage pipeline: conversion, speaker diarization, and Dhivehi transcription. Each stage can fail independently with status updates and user notifications. On success, segments and speakers are stored and a completion notification is created.

## AD_03 — View and Search Transcripts

**Swimlanes:** User, System

**Workflow:** User opens the transcript list or search page. System retrieves accessible transcripts and displays them with reference-first ordering. User enters a query or applies filters; system validates and applies criteria. If matches are found, user selects a transcript to view details. The system preserves the originating route so that "Back" returns the user to the correct page.

## AD_04 — View, Edit and Rename Transcript Speakers

**Swimlanes:** User, System

**Workflow:** User opens transcript details; system verifies access and displays the full transcript view including reference, media, segments, speakers, review, analysis, and folder. User then chooses from a switch-case: play media with position tracking, edit segment text (checks editing policy and maintenance mode), rename a speaker display name (applied to all matching segments), or leave without changes.

## AD_05 — Transcript Review and Approval

**Swimlanes:** User, System

**Workflow:** User opens a transcript, reviews audio and text accuracy, then opens the review panel. System checks authorization and maintenance state. User selects a review status (Reviewed, Approved, or Rejected), optionally adds a note, and confirms. System validates the status, saves the reviewer identity and timestamp, refreshes views, and records an audit event.

## AD_06 — Download Transcript

**Swimlanes:** User, System

**Workflow:** User opens transcript details and the download menu. System checks download policy, transcript availability, and approval status if required. If all checks pass, user selects a format (TXT, JSON, SRT, WebVTT, or PDF). System verifies the format is enabled, generates the export, sends the file to the browser, and records an audit event.

## AD_07 — Run and View Transcript Analysis

**Swimlanes:** User, System, Analysis Service

**Workflow:** User opens the analysis panel. System retrieves transcript and any stored analysis. If analysis already exists, stored results are displayed. Otherwise, system checks policy covering transcript state, approval, rerun, and maintenance. If allowed, user selects Analyse. System sets status to processing, submits content to the analysis service, which generates summary, keywords, entities, classification, and English translation. Results are stored, a notification is optionally created, and the user can export or return.

## AD_08 — Manage Folders

**Swimlanes:** User, System

**Workflow:** User opens the folders view. System displays accessible folders. User selects from a switch-case: create a folder (enter name and description), open a folder to view contents, rename a folder, delete a folder (with confirmation and maintenance check), add or move a transcript (enforces the one-folder rule by reference number), remove a transcript from a folder (keeps the transcript record), or cancel without changes.

## AD_09 — Administrative Transcript and Job Management

**Swimlanes:** Administrator, System, Processing Worker

**Workflow:** Administrator opens transcript and job administration. System verifies admin access and retrieves transcripts and job statuses. Admin searches, filters, and selects a record, then chooses an action: inspect transcript details, reassign ownership (validates and updates folder membership with audit), delete transcript (confirmation and eligibility check), inspect a failed job, or retry a failed job (re-queues to the processing worker).

## AD_10 — Configure System Settings and Maintenance Mode

**Swimlanes:** Administrator, System, Standard User

**Workflow:** Administrator opens system settings; system verifies access and loads setting categories. Admin selects a category and edits values, with unsaved changes retained across categories. Admin then chooses: save changes (system validates, persists, and refreshes public settings and banners), restore defaults (confirmation required, system restores and records audit), or configure maintenance (admin sets state and message, system persists and refreshes the maintenance banner). During maintenance, the standard user can view read-only content but mutations are rejected.

## AD_11 — Scheduled Cleanup of Expired System Records

**Swimlanes:** System, Maintenance Scheduler

**Workflow:** System starts the backend and initializes the scheduler. The maintenance scheduler waits for the daily execution time and checks for an active cleanup run, skipping if one is already running. If not running, the system acquires an execution lock, loads audit and notification retention settings. If audit retention is greater than zero, it calculates a UTC cutoff and deletes expired audit records. Same for notifications. Deletion counts are recorded and failures are logged. Finally, the execution lock is released.

## Deferred Scope

The following capabilities are intentionally excluded from these diagrams per the project's deferred scope policy:

- Automatic analysis trigger after transcription completion (analysis remains manual).
- Settings-backed session duration configuration (sessions use fixed defaults).
- Settings-backed failed-login lockout (lockout remains non-persistent and session-scoped).
- Retry-delay and retry-limit configuration wired to worker pipelines (retry remains immediate with hardcoded defaults).
- Manual Process Now action for uploads (automatic processing only).
- Final GPU hosting and cloud deployment architecture.

## Scope Exclusions

These diagrams describe user-visible application workflows only. They intentionally exclude implementation infrastructure and technical details, including PostgreSQL, Redis, Qdrant, MinIO, Docker, cloud/GPU hosts, HTTP endpoints, frontend component hierarchy, database tables, and application classes.

Maintenance cleanup covers only expired audit records and expired notifications. Transcript deletion and original media deletion are not shown because transcript and media retention is not supported by System Settings.

## Maintenance Mode Policy

Maintenance mode is shown in AD_02, AD_04, AD_05, AD_07, AD_08, AD_09, and AD_10. The standard policy is: standard users are restricted to read-only access; administrators retain full access; downloads remain permitted during maintenance.

## Render Instructions

Render all 11 diagrams at once:

```sh
java -jar plantuml.jar -tsvg docs/diagrams/source/activity-diagrams/*.puml
```

Or render individually:

```sh
java -jar plantuml.jar -tsvg docs/diagrams/source/activity-diagrams/ad-01-user-authentication.puml
```

Generated SVGs should be moved to:

```text
docs/diagrams/exported/activity-diagrams/
```

with filenames matching the source basenames (lowercase hyphenated, e.g., `ad-01-user-authentication.svg`).

Do not commit PlantUML binaries or JAR files.
