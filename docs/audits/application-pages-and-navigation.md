# Application Pages and Navigation

Date: 2026-07-18

Branch: `feature/application-pages`

## Summary

The application now has 22 navigable page routes. Eight meaningful pages were added without duplicating existing transcript detail, upload, search, or admin job pages.

## Added Routes

| Route | Purpose | Authorization |
| --- | --- | --- |
| `/Notifications` | Full notification center with all/unread filters, pagination, unread styling, mark-one-read, mark-all-read, and workflow links. | Authenticated current user. Backend notification APIs scope to current user. |
| `/Activity` | Safe current-user activity history from `GET /api/account/activity`. | Authenticated current user. Backend filters by actor user ID and safe action allowlist. |
| `/Analysis/Review-Queue` | Accessible completed analyses grouped by review status. | Authenticated. Standard users receive owned transcripts only; admins receive all via transcript list service. |
| `/Admin/Transcripts` | Admin oversight list for transcripts, owners, processing status, review status, and admin actions. | Admin UI route plus backend admin enforcement for reassignment/deletion actions. |
| `/Admin/System-Health` | Concise backend, dependency, and worker health. | Admin UI route plus admin-only worker health API. |
| `/Help` | User guide for upload, processing, editing, speaker names, search, analysis review, downloads, notifications, and security. | Authenticated. |
| `/Supported-Formats` | Upload and export format reference using shared upload validation constants. | Authenticated. |
| `/About` | Professional system information, workflow, privacy model, technology summary, and generated-analysis disclaimer. | Authenticated. |

## Final Route Inventory

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
| 21 | `/Supported-Formats` |
| 22 | `/About` |

## Navigation Placement

Main sidebar:

| Link | Route |
| --- | --- |
| Dashboard | `/` |
| Upload | `/Upload` |
| Transcripts | `/Transcripts` |
| Search | `/Search` |
| Notifications | `/Notifications` |
| Activity | `/Activity` |
| Help | `/Help` |

Administration sidebar, visible only to admins:

| Link | Route |
| --- | --- |
| Transcripts | `/Admin/Transcripts` |
| System Health | `/Admin/System-Health` |
| Review Queue | `/Analysis/Review-Queue` |
| Users | `/Admin/Users` |
| Audit | `/Admin/Audit` |
| Jobs | `/Admin/Jobs` |

Account/mobile menu:

| Link | Route |
| --- | --- |
| Profile | `/Account/Profile` |
| Security | `/Account/Security` |
| Supported formats | `/Supported-Formats` |
| About | `/About` |

The notification bell popover keeps its compact workflow view and now includes `View all notifications` linking to `/Notifications`.

## APIs Added Or Extended

| API | Purpose | Safety notes |
| --- | --- | --- |
| `GET /api/account/activity` | Current-user safe activity feed. | Filters by authenticated actor ID. Does not expose IP addresses, user agents, audit metadata, raw search text, transcript text, failure internals, or other users. |
| `GET /api/transcripts` response field `analysisReviewStatus` | Enables review queue and admin oversight without per-row analysis fetches. | Existing transcript access rules apply: owners for standard users, all transcripts for admins. |

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
