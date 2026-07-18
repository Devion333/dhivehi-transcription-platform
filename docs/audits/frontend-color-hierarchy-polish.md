# Frontend Color Hierarchy Polish

Date: 2026-07-18

Scope: frontend-only visual color and section hierarchy polish. No route, backend API, auth, ownership, transcript, upload, or workflow behavior changes were made.

## Semantic Color System

Added restrained light/dark semantic accent variables in `src/app/globals.css`:

1. `--accent-primary`
2. `--accent-transcript`
3. `--accent-analysis`
4. `--accent-folder`
5. `--accent-notification`
6. `--accent-admin`
7. `--accent-success`
8. `--accent-warning`
9. `--accent-danger`
10. `--accent-neutral`

Each accent includes foreground, background, and border tokens. Dark mode uses muted translucent backgrounds and lighter foregrounds to preserve contrast without making cards look saturated.

## Shared Utilities

Created reusable shared utilities:

1. `src/lib/section-styles.ts` maps semantic tones to reusable text, icon, border, and panel classes.
2. `src/lib/status-styles.ts` centralizes transcript, job, service, and review status color mapping.
3. `src/components/ui/section-heading.tsx` provides a consistent section title treatment with optional tinted icon background.

The existing `StatusBadge` now uses `statusBadgeClass()` so Dashboard, Transcript List, Details, Admin Jobs, and System Health do not drift into conflicting status colors.

## Status Color Mapping

Current mapping:

1. Uploaded, queued: transcript blue.
2. Converting, generic processing, analysis pending: warning amber.
3. Diarizing, diarized: notification cyan/teal.
4. Transcribing: transcript blue.
5. Analysing/analyzing: analysis violet.
6. Complete, completed, transcribed, analysis complete: success green.
7. Failed and unavailable states: danger red.
8. Unknown and not started: neutral.
9. Review unreviewed: neutral.
10. Review reviewed: blue.
11. Review approved: green.
12. Review rejected: red.

## Page Accents

Dashboard:
Metrics now use subtle colored icon circles, left borders, and numeric emphasis. Recent transcripts remain neutral.

Transcript workflow:
Transcript List has a restrained transcript-accent filter panel. Transcript Details uses blue transcript accents, teal speaker accents, amber folder icons, violet analysis actions, and semantic warning/danger panels. Active segments use a soft transcript tint and logical side border.

Analysis:
Analysis pages and review queue use violet section identity, violet primary analysis actions, review badges from the shared review mapping, and muted amber generated/unavailable warnings.

Folders:
Folder list and detail pages use amber folder icons, warm section headings, and accent borders without yellow full-card fills.

Notifications:
Unread notification cards and badges use notification teal/cyan tokens. Read notifications stay neutral.

Administration:
Admin Jobs, Users, Audit, and System Health use a restrained admin indigo/slate section treatment. Admin Jobs status badges now use the shared status helper.

Account and security:
Profile and Security use the admin/account accent for headings and semantic success tokens for success messages.

Sidebar:
The sidebar remains neutral by default. Only active and hover states use primary tinting, and unread notification indicators use notification tokens.

## Accessibility Findings

Text labels and icons remain in place; color is not the only status indicator. Badge text remains readable because every semantic accent has explicit foreground/background/border tokens in light and dark mode. Focus rings continue to use the existing ring token. Success and failure states retain distinct text labels and icon/status context for color-blind users.

## Validation

Final validation passed:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. `git diff --check`
