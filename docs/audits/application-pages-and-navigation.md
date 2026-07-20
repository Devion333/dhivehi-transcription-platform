# Application Pages and Navigation

Date: 2026-07-18

Branch: `feature/application-pages`

## Summary

The application now has 22 navigable page routes. `/Supported-Formats` is preserved only as a compatibility redirect to `/Help#supported-formats`, not as a primary standalone destination.

## Added Routes

| Route | Purpose | Authorization |
| --- | --- | --- |
| `/Notifications` | Full notification center with all/unread filters, pagination, unread styling, mark-one-read, mark-all-read, and workflow links. | Authenticated current user. Backend notification APIs scope to current user. |
| `/Activity` | Safe current-user activity history from `GET /api/account/activity`. | Authenticated current user. Backend filters by actor user ID and safe action allowlist. |
| `/Analysis/Review-Queue` | Accessible completed analyses grouped by review status. | Authenticated. Standard users receive owned transcripts only; admins receive all via transcript list service. |
| `/Admin/Transcripts` | Admin oversight list for transcripts, owners, processing status, review status, and admin actions. | Admin UI route plus backend admin enforcement for reassignment/deletion actions. |
| `/Admin/System-Health` | Concise backend, dependency, and worker health. | Admin UI route plus admin-only worker health API. |
| `/Admin/Settings` | Admin control plane for upload, processing, transcript/analysis, security, notification, retention, and maintenance settings. | Admin UI route plus admin-only settings APIs. |
| `/Help` | User guide for upload, processing, editing, speaker names, search, transcript review, downloads, notifications, change password access, and supported formats. | Authenticated. |
| `/Supported-Formats` | Compatibility redirect to `/Help#supported-formats`. | Authenticated. Not a primary navigation destination. |
| `/About` | Professional system information, workflow, privacy model, technology summary, and generated-analysis disclaimer. | Authenticated. |

## Final Navigable Route Inventory

| Count | Route |
| --- | --- |
| 1 | `/` |
| 2 | `/Login` |
| 3 | `/Upload` |
| 4 | `/Transcripts` |
| 5 | `/Transcripts/List` |
| 6 | `/Transcripts/Details` |
| 7 | `/Transcripts/Analysis` |
| 8 | `/Search` |
| 9 | `/Account/Profile` |
| 10 | `/Account/Security` |
| 11 | `/Admin` |
| 12 | `/Admin/Users` |
| 13 | `/Admin/Audit` |
| 14 | `/Admin/Jobs` |
| 15 | `/Notifications` |
| 16 | `/Activity` |
| 17 | `/Analysis/Review-Queue` |
| 18 | `/Admin/Transcripts` |
| 19 | `/Admin/System-Health` |
| 20 | `/Help` |
| 21 | `/About` |
| 22 | `/Admin/Settings` |

Compatibility redirects not counted as primary navigable pages:

| Route | Redirect target |
| --- | --- |
| `/Supported-Formats` | `/Help#supported-formats` |

## Navigation Placement

Main sidebar:

| Link | Route |
| --- | --- |
| Dashboard | `/` |
| Upload | `/Upload` |
| Transcripts | `/Transcripts` |
| Folders | `/Folders` |
| Search | `/Search` |
| Notifications | `/Notifications` |
| Activity | `/Activity` |
| Help | `/Help` |

Administration sidebar, visible only to admins:

| Link | Route |
| --- | --- |
| Transcript Management | `/Admin/Transcripts` |
| System Health | `/Admin/System-Health` |
| Transcript Review | `/Analysis/Review-Queue` |
| Users | `/Admin/Users` |
| Audit | `/Admin/Audit` |
| Jobs | `/Admin/Jobs` |
| System Settings | `/Admin/Settings` |

Account/mobile menu:

| Link | Route |
| --- | --- |
| Profile | `/Account/Profile` |
| About | `/About` |

Password changes are accessed from `/Account/Profile` via the `Change password` action. The internal route remains `/Account/Security`, but user-facing navigation and headings use `Change password`.

Supported format information is available on Help under `Supported formats` at `/Help#supported-formats`.

Transcript-facing navigation uses reference-primary identity. Lists, details, search results, folder transcript rows, activity, admin transcript cards, and review queue cards show reference number first and filename as secondary context. Legacy transcripts without a reference display `No reference` without substituting job IDs.

Transcript details, analysis, folder details, activity, search, and notifications use validated internal `returnTo` links where practical so Back returns to the source page instead of relying on browser history.

The notification bell popover keeps its compact workflow view and now includes `View all notifications` linking to `/Notifications`. The popover is constrained to `min(380px, calc(100vw - 2rem))`, uses a fixed header/footer, and scrolls only the notification list so long titles, references, filenames, and messages remain inside the panel.

`/Admin/Settings` uses compact section navigation instead of one long form. Desktop shows a stationary left category menu for Uploads, Processing, Transcripts and analysis, Security, Notifications, Retention, and Maintenance. The desktop menu is `280px` wide and expands to `300px` at `xl`; it has no sticky positioning, independent overflow, scrollbar, or fixed viewport height. Mobile uses a compact full-width section selector. Unsaved changes are preserved when switching sections, and Save changes applies the shared form state across categories.

Settings scrolling follows a fixed-shell, inner-content model. The application shell uses `overflow-hidden` for `/Admin/Settings` instead of its normal `overflow-y-auto`. The settings page wrapper fills the shell main area with `box-border h-full min-h-0 overflow-hidden` so route padding does not create extra outer scroll space. The fixed header contains title, last-updated/dirty state, Restore defaults, Save changes, and status feedback. The workspace uses `min-h-0 flex-1 overflow-hidden`; the category menu is stationary; and the only vertical scroll owner is the selected settings content panel with `scrollbar-hidden h-full min-h-0 overflow-y-auto overscroll-contain`.

Root cause: the outer page remained scrollable because the application shell `main` retained `overflow-y-auto`, while the Settings route did not fill and contain the available shell height. The selected settings panel was then unable to own scrolling because the workspace grid used `items-start`, preventing the right grid child from stretching to the constrained workspace height; its inner `h-full overflow-y-auto` scroller had no reliable height to scroll within. The fix is route-level shell overflow switching, a full-height box-sized Settings route wrapper, removal of `items-start` from the workspace grid, and a single inner settings-content scroller. Category changes reset the inner scroller to the top while preserving unsaved form values.

Uploads-specific scroll fix: the Uploads section previously returned its card directly while Maintenance used the same shared scroller without enough content to expose the mismatch. Uploads now uses the same normal-flow section root as Maintenance, `min-w-0 space-y-8 pb-8`, inside the shared selected-settings scroller. No Uploads wrapper owns scrolling or uses viewport-height sizing; the shared `aria-label="Settings content"` panel remains the only Settings content scroll owner.

Verbose helper copy was removed from `/Admin/Settings` section introductions and the `/Upload` page heading. Required-field indicators, validation messages, maintenance warnings, retention limitations, and destructive warnings are retained.

System settings Save and Restore defaults refresh the shared public settings cache immediately, so maintenance and announcement banners update without navigation.

## APIs Added Or Extended

| API | Purpose | Safety notes |
| --- | --- | --- |
| `GET /api/account/activity` | Current-user safe activity feed. | Filters by authenticated actor ID. Does not expose IP addresses, user agents, audit metadata, raw search text, transcript text, failure internals, or other users. |
| `GET /api/transcripts` response field `analysisReviewStatus` | Enables review queue and admin oversight without per-row analysis fetches. | Existing transcript access rules apply: owners for standard users, all transcripts for admins. |
| `GET /api/settings/public` | Public safe runtime settings for upload guidance and shell banners. | Excludes secrets and internal infrastructure details. |
| `GET /api/admin/settings` | Admin-only full system settings read. | Requires admin role. |
| `PUT /api/admin/settings` | Admin-only full system settings update. | Validates ranges, allowlists, duplicates, and required banner messages. |
| `POST /api/admin/settings/restore-defaults` | Admin-only restore defaults action. | Requires confirmation and creates an audit event. |

Existing APIs reused:

| API | Page |
| --- | --- |
| `GET /api/notifications` | `/Notifications` |
| `GET /api/notifications/unread-count` | notification bell |
| `POST /api/notifications/:notificationId/read` | `/Notifications` and bell |
| `POST /api/notifications/read-all` | `/Notifications` and bell |
| `GET /api/health` | `/Admin/System-Health` |
| `GET /api/admin/jobs/health` | `/Admin/System-Health` |
| `GET /api/transcripts` | `/Analysis/Review-Queue`, `/Admin/Transcripts` |

## Responsive Behavior

Pages use the existing app shell, page container, cards, compact controls, and responsive grids. Lists collapse to stacked cards on mobile and use multi-column metadata only at larger breakpoints. Sidebar collapse and mobile drawer behavior are preserved.
