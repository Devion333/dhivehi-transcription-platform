# Frontend Audio Player Responsive Layout

Status: implemented on `feature/auth-admin`.

## Scope

This change is frontend-only. It does not change backend behavior, audio APIs, transcript editing APIs, routes, authentication, or administration functionality.

## Modified Files

| File | Purpose |
| --- | --- |
| `frontend/transcription-frontend/src/app/Transcripts/Details/transcript-details-client.tsx` | Redesigned compact audio player; preserved single audio element and segment playback logic. |
| `frontend/transcription-frontend/src/app/globals.css` | Added reusable custom range-control styling for seek and volume sliders. |
| `frontend/transcription-frontend/src/components/app/app-shell.tsx` | Added collapsible desktop sidebar, sidebar-attached hamburger toggle, icon rail, tooltips, persisted preference, brand transition fixes, and wider main content behavior. |
| `frontend/transcription-frontend/src/components/app/page-container.tsx` | Widened shared content container for data-heavy pages. |
| `frontend/transcription-frontend/src/app/Admin/Users/users-client.tsx` | Reduced desktop columns, added truncation, compact action menu, and moved Created into edit dialog. |
| `frontend/transcription-frontend/src/app/Transcripts/List/transcript-list-client.tsx` | Prioritized transcript columns and added clean filename/reference truncation. |
| `frontend/transcription-frontend/src/app/Admin/Audit/audit-client.tsx` | Reduced desktop table to operational priority columns. |
| `frontend/transcription-frontend/src/app/Admin/Jobs/jobs-client.tsx` | Reduced desktop table to operational priority columns. |

## Audio Player Design

Transcript Details now uses a compact custom media-player card with:

| Control | Behavior |
| --- | --- |
| Rewind | Moves playback back 10 seconds. |
| Play/Pause | Circular primary control; no autoplay. |
| Forward | Moves playback forward 10 seconds. |
| Timeline | Thin custom range track with visible played-progress fill and accessible larger hit area. |
| Time labels | Elapsed and duration labels use tabular numbers. |
| Volume | Desktop shows a short custom slider; mobile keeps mute/unmute only. |
| Mute | Volume icon toggles mute and restores the previous non-zero volume on unmute. |
| Speed | Compact selector with existing playback-rate options. |

The player still uses the existing single shared `<audio>` element. Segment play buttons continue seeking the shared audio element to segment start times, setting stop-at timestamps, and preserving active-segment highlighting. Transcript text editing remains available when media is unavailable or fails to load.

## Range Styling

Reusable `.range-control` styles were added in `globals.css`.

Implementation details:

| Requirement | Implementation |
| --- | --- |
| Seek track height | Approximately `4px`; input height remains larger for accessibility. |
| Volume track height | Approximately `3px`; desktop width is `88px`. |
| Progress fill | CSS custom property `--range-progress` drives a theme-token gradient. |
| Browser support | Uses WebKit and Firefox range pseudo-elements where practical. |
| Focus | `focus-visible` ring and growing thumb on hover/focus. |
| Theme safety | Uses existing CSS variables such as `--primary`, `--muted`, `--background`, and `--ring`. |

## Sidebar Behavior

### Sidebar Toggle Fix

Root cause: the first collapsible-sidebar implementation rendered multiple visible controls with different icons. Expanded desktop mode had a collapse button inside the sidebar, collapsed desktop mode had a separate expand button inside the icon rail, and the header had another desktop toggle. A follow-up briefly consolidated the desktop toggle into the header, then another placed it overlapping the sidebar border. The corrected implementation uses a YouTube-style sidebar header: the desktop hamburger sits inside the sidebar's fixed top-left header row and the sidebar expands to its right.

The brand label also used normal flex text inside a shrinking container, which allowed `Transcript App` to briefly wrap or partially show while the sidebar width animated.

Final toggle placement:

| Property | Result |
| --- | --- |
| Visible toggle count | Exactly one visible sidebar toggle in the app shell. |
| Icon | Standard Lucide `Menu` hamburger. |
| Placement | Desktop toggle sits inside the sidebar top-left header row. |
| Position stability | Hamburger position, margin, and hit area stay fixed while the sidebar expands rightward. |
| Hit area | `40px x 40px`. |
| Accessibility | Uses state-specific `aria-label` and `aria-expanded`. |
| Desktop action | Toggles expanded/collapsed sidebar. |
| Mobile action | A responsive mobile-only header hamburger opens/closes the drawer. |

The previous `PanelLeftClose` and `PanelLeftOpen` controls were removed. Desktop and mobile hamburger buttons are never visible at the same time: desktop uses the sidebar-header toggle, while mobile uses the header drawer toggle.

Corrected desktop placement:

```text
<aside className="... overflow-hidden ...">
  <div className="flex h-16 items-center px-3">
    <Button className="h-10 w-10 shrink-0 ...">
      <Menu />
    </Button>

    <span className="ml-3 w-36 whitespace-nowrap ...">
      Transcript App
    </span>
  </div>

  <nav>
    ...sidebar links...
  </nav>
</aside>
```

Removed incorrect border-overlap placement:

```text
<Button className="absolute right-[-18px] top-4 ...">
    <Menu />
 </Button>
```

### Brand Animation Strategy

The desktop brand now uses a fixed-width, non-wrapping inner label:

```text
Logo + fixed-width whitespace-nowrap label
```

When collapsed, the brand label is invisible with zero interaction and the sidebar clips any overflow. When expanding, the sidebar width transitions first and the label fades in with a short delay. When collapsing, the label fades out immediately as width begins shrinking. Text width itself is not gradually squeezed while visible, preventing the `Transcript App` two-line wrap.

Navigation labels use the same strategy: icons stay shrink-free and aligned, while labels use `whitespace-nowrap` and opacity transitions rather than wrapping or sliding unpredictably.

### Collapsed Navigation Icon Fix

Root cause: collapsed navigation labels were hidden with opacity/visibility, but they still retained their expanded fixed width inside the flex row. The link then centered the combined icon-plus-hidden-label group inside the narrow sidebar, causing icons to shift and become clipped or disappear.

Fix:

| Element | Collapsed Behavior |
| --- | --- |
| Link | Remains rendered, clickable, `h-10`, centered, and keeps active-state background. |
| Icon | Always rendered with `shrink-0`, `h-5 w-5`. |
| Label | Only the label container becomes `w-0`, `overflow-hidden`, and `opacity-0`. |
| Section headings | Main heading collapses to zero height; Administration becomes a subtle divider. |
| Tooltips/accessibility | Collapsed links retain `title` and `aria-label` using the visible label text. |

This preserves all collapsed icons: Dashboard, Upload, Transcripts, Search, Users, Audit, and Jobs for administrator users. Mobile drawer navigation remains fully expanded and does not use the collapsed icon-rail behavior.

### Collapsed Vertical Movement Fix

Root cause: collapsed section headings changed document flow. The Main heading collapsed to `h-0`, and the Administration heading changed from a normal text row to a one-pixel divider with different margins. That changed the vertical offset of every navigation item beneath those rows during sidebar collapse/expand.

Fixed-height section strategy:

| Section | Expanded | Collapsed |
| --- | --- | --- |
| Sidebar header | Fixed `h-16`; hamburger and brand row stay in flow. | Same fixed `h-16`; only brand opacity changes. |
| Main heading row | Fixed `h-8`; text visible. | Same fixed `h-8`; text opacity `0`. |
| Primary nav rows | Fixed `h-10` links. | Same fixed `h-10` links; labels fade/collapse horizontally only. |
| Admin heading row | Fixed `h-8`; text visible. | Same fixed `h-8`; text opacity `0`, divider opacity `100`. |
| Admin nav rows | Fixed `h-10` links. | Same fixed `h-10` links; labels fade/collapse horizontally only. |

The sidebar now keeps the same structural row stack in both states. Collapse only changes sidebar width, label opacity/visibility, and label width. It no longer changes heading row height, section margins, vertical gaps, link height, or navigation padding.

The redundant page-level top-header `Transcript App` text was removed from the application header. The remaining active uses are browser metadata, login branding, sidebar branding, and mobile drawer branding.

### Sidebar Horizontal Alignment Fix

Root cause: navigation rows switched between expanded left-aligned layout and collapsed centered layout using state-dependent classes such as `justify-center`, `gap-0`, and `px-0`. Even though labels were hidden, the icon's containing row changed alignment during the sidebar width transition, so icons could briefly jump sideways.

Fixed icon-column implementation:

| Element | Behavior |
| --- | --- |
| Navigation row | Always `flex h-10 items-center`; only color transitions are used. |
| Icon column | Fixed `h-10 w-10 shrink-0` in both expanded and collapsed states. |
| Icon | Always `h-5 w-5 shrink-0`. |
| Label | Fixed label slot fades with opacity; collapsed state does not affect icon position. |
| Hamburger | Uses the same `h-10 w-10 shrink-0` control size as the navigation icon column. |
| Active state | Background remains on the same row dimensions and no longer shifts horizontally. |

This removes state-dependent icon alignment, horizontal padding animation, and gap animation from the navigation rows.

## Dashboard Redesign

The dashboard was redesigned from oversized equal cards into a compact operational workspace.

Layout:

| Region | Behavior |
| --- | --- |
| Header | Page-specific title and concise context only. |
| Metrics | Four compact summary cards: Total transcripts, Processing, Completed, Failed. |
| Main left panel | Recent transcripts list, approximately five rows, with filename, reference/date, status, segments, and Details navigation. |
| Right panels | Processing overview, Quick actions, and role-specific status panel. |
| Admin status | Admins see Worker status from the existing admin job-health API. |
| Standard users | Non-admin users see a workspace summary instead of admin-only operational data. |

Data sources remain unchanged:

| Data | Existing API |
| --- | --- |
| Metrics and processing overview | `GET /api/stats` |
| Recent transcripts | `GET /api/transcripts?page=1&pageSize=5` |
| Worker status for admins | `GET /api/admin/jobs/health` |

No fake percentages, charts, backend fields, routes, or admin behavior were added.

Responsive behavior:

| Width | Dashboard Behavior |
| --- | --- |
| Desktop | Metrics in four compact columns; Recent transcripts uses the wider left column; operational panels stack in the right column. |
| Tablet | Metrics wrap to two columns; main/right areas stack cleanly as needed. |
| Mobile | Single-column flow; transcript rows truncate long filenames and actions remain readable. |
| Collapsed sidebar | Dashboard gains width without sidebar icon movement or content flicker. |

## Upload Layout Fix

The Upload page now uses a centered content strategy instead of inheriting the full wide page container visually.

Final width strategy:

| Element | Behavior |
| --- | --- |
| Page content | Wrapped in `mx-auto w-full max-w-4xl`. |
| Upload panel | One main card contains drop area, metadata, progress/result state, and actions. |
| Drop zone | Uses the full width of the centered container without stretching to the whole application width. |
| Metadata fields | Responsive `grid gap-4 md:grid-cols-2`. |
| Reference and category | Share the first desktop row. |
| Notes | Uses `md:col-span-2` and spans the form width. |
| Progress/result state | Stays inside the same centered panel width. |

This keeps the form visually centered whether the desktop sidebar is expanded or collapsed, avoiding an unfinished-looking empty region on the right.

## Admin Filter Toolbar Standardization

Users, Audit, and Jobs now use the same responsive toolbar sizing rules.

Shared layout behavior:

| Viewport | Behavior |
| --- | --- |
| Wide desktop | Search is flexible; filters and reset use compact auto columns. |
| Tablet | Search spans the row; filter controls wrap into clean columns. |
| Mobile | Controls stack or use comfortable two-column wrapping without overlap. |

Control sizing rules:

| Control | Sizing |
| --- | --- |
| Search input | `w-full min-w-0` inside a flexible search cell. |
| Selects | `w-full sm:min-w-36 xl:w-40`. |
| Date inputs | `w-full sm:min-w-40`. |
| Reset button | `w-full sm:w-auto`. |

Toolbar order:

| Page | Order |
| --- | --- |
| Users | Search, Role, Status, Reset. |
| Audit | Search, Action, Outcome, Start date, End date, Reset. |
| Jobs | Search, Stage, Status, Reset. |

The Audit toolbar now includes a compact result summary such as `Showing 18 audit events`. Users keeps its existing compact result summary. Reset buttons clear the active query filters through the existing route helpers and are disabled when no filters are active.

Desktop sidebar behavior:

| State | Width | Behavior |
| --- | --- | --- |
| Expanded | `w-60` | Shows icon and label navigation, grouped Main and Administration sections. |
| Collapsed | `68px` | Shows icons only; labels are exposed through `title`, `aria-label`, and hover/focus tooltip. |

The preference is stored in `localStorage` under `transcript-app-sidebar-collapsed`. The value is read after mount to avoid hydration mismatches. No authentication or sensitive data is stored. Mobile navigation remains a drawer and does not use the desktop icon rail.

The top bar includes page context text, theme control, user menu, and the mobile-only drawer hamburger. Desktop navigation links and the desktop sidebar toggle remain inside the sidebar, not the top bar.

## Main Content Width

The main content wrapper now uses `min-w-0 flex-1`, and the shared page container was widened to `max-w-[1600px]`. This gives administration and transcript tables more usable width, especially when the sidebar is collapsed.

## Table Column Changes

Users desktop table now prioritizes:

```text
Name, Email, Role, Status, Last login, Actions
```

Created date was removed from the desktop table and added to the edit dialog. Long names and emails truncate with `title` text for full values. Desktop actions use a compact dropdown; mobile cards retain direct actions.

Transcript desktop table now prioritizes:

```text
Filename, Reference, Status, Segments, Created, Action
```

Category is hidden until wider screens and shown as a secondary line under the filename at narrower desktop widths. Analysis is only shown on very wide screens. Filename/reference cells use truncation and no fixed overflow-prone widths.

Audit desktop table now prioritizes:

```text
Time, Actor, Action, Outcome, Details
```

Resource and category remain available in the action cell secondary line or the existing detail dialog.

Jobs desktop table now prioritizes:

```text
File, Stage, Status, Updated, Action
```

Reference is shown as a secondary line under File. Retry count and full queue/pipeline information remain in the existing detail dialog.

## Responsive Review

Manual visual review is still recommended at:

```text
1366 x 900
1024 x 768
768 x 1024
390 x 844
```

Expected results:

| Area | Expected Behavior |
| --- | --- |
| Expanded sidebar | Usable labels, no overlap, admin links grouped. |
| Collapsed sidebar | Icon rail gives tables additional width and exposes labels through accessible tooltips. |
| Main content | Does not clip into the sidebar; data pages use the wider container. |
| Tables | No unnecessary full-page horizontal scroll at ordinary desktop widths; long cells truncate. |
| Mobile | Existing card layouts remain active below desktop breakpoints. |
| Audio player | Timeline and volume controls render with custom tracks and visible focus states. |
| Sidebar toggle | Exactly one hamburger is visible per breakpoint: desktop inside the sidebar top-left header row; mobile in the header for the drawer. |
| Brand transition | `Transcript App` remains one line and fades instead of wrapping during sidebar transitions. |
| Collapsed navigation | Every navigation icon remains visible and clickable; only labels and headings are hidden. |
| Vertical stability | Sidebar structural rows retain fixed heights so icons do not move vertically during collapse/expand. |
| Page header | Redundant top-header `Transcript App` label is removed; sidebar and login branding remain. |
| Horizontal stability | Navigation icons use a fixed icon column and do not jump sideways during collapse/expand. |
| Dashboard | Compact metrics, recent transcript list, processing overview, quick actions, and role-aware status panels replace oversized equal cards. |
| Upload | Centered `max-w-4xl` upload panel remains balanced with expanded or collapsed sidebar. |
| Admin filters | Users, Audit, and Jobs use consistent search/filter/reset grid patterns and control sizing. |

## Validation Results

Passed:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |

Corrected YouTube-style sidebar-header placement validation:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed after clearing stale `.next` cache from a transient Next/Turbopack module-resolution error. |

Collapsed-navigation follow-up validation:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |

Collapsed vertical-stability follow-up validation:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |

Sidebar horizontal-alignment and dashboard redesign validation:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |
| `cd backend && go test ./...` | Passed |
| `cd backend && go vet ./...` | Passed |

Upload and admin-filter layout validation:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |
| `cd backend && go test ./...` | Passed |
| `cd backend && go vet ./...` | Passed |
| `docker compose -f compose.dev.yml config --quiet` | Passed |
| `git diff --check` | Passed; only a CRLF-to-LF warning for `globals.css` was reported. |

Focused sidebar-toggle follow-up validation:

| Check | Result |
| --- | --- |
| `cd frontend\\transcription-frontend && npm run lint` | Passed |
| `cd frontend\\transcription-frontend && npx tsc --noEmit` | Passed |
| `cd frontend\\transcription-frontend && npm run build` | Passed |
