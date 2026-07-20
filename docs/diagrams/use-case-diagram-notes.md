# Main Use Case Diagram Notes

Date generated: 2026-07-19

## Purpose

This diagram summarizes the primary actors and high-level user goals implemented in the Dhivehi Multimedia Transcription and Analysis Platform. It is intended for inclusion in the Design and Implementation chapter.

## Actors

- User: authenticated standard platform user who uploads media, works with transcripts, manages folders, views notifications, and views account activity.
- Administrator: specialized user with administrative capabilities for users, transcript ownership, jobs, audit logs, health monitoring, and system settings.
- Processing Worker: provider-neutral worker actor representing conversion, speaker diarization, transcription, and status updates.
- Analysis Service: service actor responsible for transcript analysis outputs.
- Maintenance Scheduler: background scheduler responsible for retention cleanup of audit records and notifications.

## Administrator Inheritance

Administrator inherits from User using UML actor generalization: `Administrator --|> User`. Ordinary user associations are intentionally connected only to User and are not duplicated for Administrator.

## Use Case Grouping

- Account: authentication, profile management, and password changes.
- Transcript Workflow: media upload, transcript discovery, details, playback, editing, speaker naming, transcript review, downloads, and analysis.
- Organisation: folders, notifications, and account activity.
- Administration: user management, transcript ownership, job management, audit logs, health monitoring, settings, and maintenance mode.
- Automated Services: worker processing, analysis generation, and scheduled cleanup.

## Include And Extend Relationships

- Upload Media includes Validate Upload, Store Media, and Create Transcript Record.
- Process Uploaded Media includes Convert Media, Perform Speaker Diarization, Generate Dhivehi Transcription, and Update Processing Status.
- Run Analysis includes Generate Transcript Analysis.
- Generate Transcript Analysis includes summary, keywords, entities, classification, and English translation outputs.
- Download Transcript includes Select Download Format.
- Configure System Settings includes Save Settings and Restore Default Settings.
- Reassign Transcript extends Manage Transcript Ownership.
- Retry Failed Job extends Manage Processing Jobs.
- Export Audit Logs extends View Audit Logs.
- Manage Maintenance Mode extends Configure System Settings.

## Scope Exclusions

The diagram intentionally excludes implementation infrastructure and technical details, including PostgreSQL, Redis, Qdrant, MinIO, Docker, cloud/GPU hosts, HTTP endpoints, frontend pages, database tables, and application classes.

Retention cleanup is limited to expired audit records and notifications. Transcript deletion and original media deletion are not shown because transcript/media retention is not supported by System Settings.

## Render Instructions

Preferred command:

```sh
plantuml -tsvg docs/diagrams/source/use-cases/main-use-case-diagram.puml
```

If using a JAR:

```sh
java -jar plantuml.jar -tsvg docs/diagrams/source/use-cases/main-use-case-diagram.puml
```

Move the generated SVG to:

```text
docs/diagrams/exported/use-cases/main-use-case-diagram.svg
```

Do not commit PlantUML binaries or JAR files.

## Render Adjustment Notes

The first Smetana-rendered SVG placed the system boundary at a negative Y coordinate while keeping the root `viewBox` origin at `0 0`, which clipped the top of the diagram in common viewers. The source now uses the standard Graphviz-backed PlantUML layout and `skinparam diagramMargin 40` so the generated SVG bounds include the complete diagram.

No manual SVG viewBox fallback was applied. The current exported SVG root uses `viewBox="0 0 1138 2019"`; the system boundary starts at `y="7"`, and the system-boundary title starts at `y="23.5332"`, so the top portion is inside the canvas.

The SVG was opened with the system default viewer after rendering. It also parses successfully as XML.
