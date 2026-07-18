# Transcript Details Layout Polish

Date: 2026-07-18

Scope: frontend-only layout and control polish for `/Transcripts/Details`, folder creation forms, transcript review visibility, sidebar scrolling, Upload metadata alignment, Transcript List density, and sidebar label clarity.

## Final Layout Hierarchy

The Transcript Details page now prioritizes transcript content:

1. Compact page header and aligned action buttons.
2. Compact metadata row with reference, category, status, owner for admins, and created date.
3. Audio player.
4. Wide transcript timeline/list column using most desktop width.
5. Smaller secondary sidebar for speakers, more details, admin ownership, and deletion controls.

The old large metadata card was replaced with a natural inline summary row and a small `More details` disclosure panel.

## Sidebar Label Correction

The standard sidebar navigation keeps `Transcripts` under Main using the transcript document icon.

The administrator entry for `/Admin/Transcripts` remains in the Administration group but is now labeled `Transcript Management` and uses the Lucide `ClipboardList` icon. This avoids duplicate visible `Transcripts` labels and avoids reusing the standard transcript icon. The same label/icon source is used for expanded desktop, collapsed tooltip/title, and mobile navigation.

## Folder Control

The folder control is now a compact header action using the Lucide folder icon.

States:

| State | Label |
| --- | --- |
| In folder | Current folder name, for example `Case 2026-014`. |
| No folder | `Add to folder`. |

The dialog supports selecting an existing folder, moving to another folder, removing from a folder, and creating a new folder without leaving Transcript Details.

The folder picker list uses explicit popover background and foreground tokens, with selected, focus, and hover states using accent tokens. Folder options are readable without relying on hover in both light and dark themes.

Create flow:

1. User opens the folder dialog.
2. User selects `+ Create new folder`.
3. User enters folder name and optional description using visible `Name` and `Description` labels and the placeholders `Enter name` and `Enter description`.
4. Frontend calls the existing create-folder API.
5. On success, frontend immediately calls the existing add-transcript-to-folder API.
6. Folder state refreshes by reloading the transcript detail.

Duplicate and invalid names are handled by the existing folder API validation. Submissions are disabled while requests are in flight. The same `Enter name` and `Enter description` placeholders are used on the dedicated `/Folders` creation form.

## Speaker Styling

Speakers now open from the Transcript Details header action row instead of living as a permanent section between Audio and Transcript. The collapsed control is a compact small button with a user icon, `Speakers`, the speaker count, and a chevron. When closed, it renders only the trigger, so there is no leftover horizontal bar, divider, empty body, bottom separator, or blank strip below Audio.

The opened speaker panel is a compact settings-style list around desktop popover width, with columns for speaker name, generated label, and action. Rename/reset controls remain inside the panel and active edits do not close unexpectedly. The popover uses bottom placement with `align="start"`, so its left edge aligns to the Speakers trigger instead of anchoring from the right. The local dropdown content accepts `sideOffset={8}`, `avoidCollisions`, and `collisionPadding={16}`; collision handling constrains available width from the trigger's measured left edge so the panel remains inside the viewport without fixed positioning or negative margins.

The speaker rows intentionally avoid timeline connectors, numbered transcript markers, large individual cards, and the same background/radius structure as transcript segments. Transcript now begins directly below the audio player with a clear `mt-8` gap.

## Segment Styling

Transcript segments now use a transcript-specific timeline/list treatment rather than generic card shells. The page order is audio player, 24-32px gap, Speakers management, 32-40px gap, Transcript heading, then transcript timeline. If there are no speakers, Transcript keeps a direct `mt-8` gap after the audio player.

Segment hierarchy:

1. Speaker display name.
2. Generated speaker key as secondary text.
3. Transcript text in larger, readable typography as the dominant element.
4. Timestamp, status, and compact playback/edit actions as secondary controls.

Each segment uses a muted rounded container with minimal border treatment, a hover state, and a fixed-width `40px` timeline column. The connector is positioned inside that column with `left-1/2` and starts below the speaker marker, so it remains centered through the marker and never extends upward into metadata, speakers, or the audio player. The last segment renders no connector.

The speaker marker uses a predictable theme-safe accent palette derived from the speaker key, cycling through transcript blue, notification teal, analysis violet, folder amber, admin indigo, and neutral tones. Marker labels are stable and no longer derive initials from generated labels like `SPEAKER_00`. Custom display names use initials such as `OA`; generated speakers use numeric labels such as `1`, `2`, and `3`. Color is not the only identifier because the display name and generated speaker key remain visible.

Active playback highlighting is subtle but visible through transcript-tinted background, a soft ring, and a stronger speaker rail/marker treatment. Thaana/RTL rendering remains driven by the existing transcript text helpers. Edit mode keeps the same segment structure and expands the textarea naturally inside the transcript content area.

The Speakers management section is visually distinct from transcript segments. It is a compact management panel with one subtle container, small person icons, thin row separators, generated keys as muted secondary text, and inline edit/reset controls. It does not use timeline markers or per-speaker transcript-style cards.

The admin deletion section is now labeled `Delete transcript` instead of `Danger zone`, with concise permanence copy. It uses a distinct destructive-tinted panel and destructive preview border treatment so it no longer reads like a normal segment/list surface. Preview, confirmation, blocking, and destructive delete behavior are unchanged.

## Action Alignment

Header actions use consistent small outline buttons. The Download control is now a true collapsed dropdown trigger labeled `Download` with a chevron. Formats are hidden until the trigger opens the menu, and the trigger button is not nested in another button.

The loaded Transcript Details header now uses a local stable layout rather than relying on the generic page header. The filename and metadata live in a `min-w-0 flex-1` column with a two-line wrapping title and full-value tooltip. The actions live in a separate `shrink-0` wrapping container, and individual controls are prevented from shrinking so long filenames do not resize, rearrange, or push buttons off-screen.

The header structure is:

1. Filename as the primary heading, using `line-clamp-2`, `break-words`, and `title` for the full filename.
2. Inline metadata row: reference, category, transcript status badge, and created date.
3. Lightweight `More details` disclosure button for job ID, updated date, analysis status, speakers, segments, and notes.
4. Separate action row for Folder, Speakers, Download, one Analysis action, admin ownership, and Refresh. Back sits above the title, outside the action group.

The metadata row no longer uses a bordered mini-card or background-tinted box. It wraps naturally beneath the filename and does not repeat folder information, which remains a separate action.

Admin ownership now appears as a compact top-right header control in the same action group. The collapsed control shows `Owner: <name>` or `No owner` with a user icon and safe truncation. Opening it shows a compact ownership panel with current owner, display name, email, and an assign/reassign action that reuses the existing searchable reassignment dialog. Standard users do not see this control.

`More details` now uses a ghost button affordance with primary-tinted text, hover background, `aria-expanded`, and a `ChevronDown` icon that rotates when expanded.

## Reassignment Interaction

Reassignment now uses the shared component `src/components/transcripts/transcript-reassignment-dialog.tsx` from both Transcript Details and Admin Transcript Management.

Dialog behavior:

1. `max-w-lg` with `max-h-[min(85vh,640px)]`.
2. Fixed header and footer.
3. Scroll only in the middle content/user-selection region.
4. User list capped at `max-h-64`.
5. Compact current-owner block and concise owner-loss warning.
6. Loading, error, retry, and duplicate-submit prevention remain inside the dialog.

On `/Admin/Transcripts`, `Open` still navigates to Transcript Details, while `Reassign` opens the shared dialog directly on the management page. Successful reassignment closes the dialog, updates the affected row owner display/email immediately, and shows concise success feedback without route navigation.

## Search Filter Toolbar

The Search filters now use a responsive grid instead of a fixed wide column template. Primary search spans the available width on smaller breakpoints, metadata filters sit in equal-width cells, and action buttons wrap onto their own row. Inputs and selects use `min-w-0` so long folder/status values do not force overlap or clipping.

## Sidebar Overflow

The desktop shell is a fixed `h-screen overflow-hidden` flex-column layout: a fixed top application header, then a lower body containing the collapsible sidebar and scrollable page-content region. This prevents page content from scrolling underneath or showing through the top header.

The top application header owns the fixed left-side controls in this order: hamburger button, then the clickable `Transcript App` heading. Those elements are outside the collapsible sidebar, remain in the same screen position in expanded and collapsed states, and render exactly once on desktop. The failed compact-brand logic (`TA`) and sidebar brand/header duplication were removed.

The desktop sidebar now begins below the top header and contains only navigation, administration navigation, and the account/footer link. The original sidebar dimensions are restored: `w-60` expanded and `w-[68px]` collapsed. Only navigation content collapses: labels and section headings fade/hide, while navigation icons and the footer profile icon remain accessible. Collapsed navigation keeps tooltips through link titles/labels. The previous partial-collapse width (`w-48`) was removed because it reserved expanded space for the heading and prevented the sidebar from returning to the original compact icon rail.

The top header and sidebar use the restored shell surface treatment (`bg-background/95` with backdrop blur) while the application frame retains the previous `bg-muted/30` page-shell background. The top header is outside the scrollable `main` content area with `z-40` and `h-16`, so transcript cards, tables, and page text cannot show through it. The mobile drawer keeps its separate overlay and edge treatment.

The mobile drawer keeps the literal `Transcript App` text in its own drawer header, with navigation and account actions remaining in the scrollable drawer body. The desktop collapsed rail behavior is not applied to mobile.

The scroll containers use the reusable `.scrollbar-hidden` utility. It hides scrollbar track/thumb rendering with `-ms-overflow-style: none`, `scrollbar-width: none`, and the WebKit scrollbar pseudo-element while keeping `overflow-y-auto` active. The utility is applied only to the desktop sidebar navigation scroller and the mobile drawer content scroller, so wheel, trackpad, keyboard, and touch scrolling remain available in expanded, collapsed, and mobile states.

## Upload Metadata Alignment

The `/Upload` Reference number and Category fields now use matching wrapper structure, label display, label line-height, spacing, and `h-10` control height. Category also reserves the same helper row height as Reference, so validation or helper text below Reference does not make only one top-row control appear lower.

## Transcript List Density

The `/Transcripts` count moved out of the filter panel and into the page header action row next to Upload, using secondary text and singular/plural labels such as `1 transcript` and `24 transcripts`.

The filter area changed from a larger card to a restrained bordered panel with tighter padding, a compact responsive toolbar, preserved status/folder controls, and no separate count row below Search.

## Transcript Review Visibility

Transcript review status now uses shared labels and colors across the frontend:

| Status | Label | Tone |
| --- | --- | --- |
| `unreviewed` | `Unreviewed` | neutral |
| `reviewed` | `Reviewed` | blue |
| `approved` | `Approved` | green |
| `rejected` | `Rejected` | red |

The shared review badge is visible as a compact read-only Transcript Review summary on `/Transcripts`, `/Transcripts/Details`, `/Analysis/Review-Queue`, `/Admin/Transcripts`, the PDF export dialog analysis option, and the generated PDF analysis section.

The full persisted review controls now live on `/Transcripts/Details?job_id=<jobId>` in a compact section titled `Transcript review`, located below the title/metadata/action header and before the audio player. The section explains that the reviewer is checking the transcript for accuracy and completeness, shows reviewer/date/note metadata when available, and exposes `Mark reviewed`, `Approve`, `Reject`, `Reset to unreviewed`, and optional note saving against the existing review endpoint. `/Transcripts/Analysis` no longer edits review status; it only links back to `View transcript review`.

`/Analysis/Review-Queue` remains the internal route but is user-facing as `Transcript Review Queue`. Queue items open `/Transcripts/Details?job_id=<jobId>&review=open` with the review section expanded, and the row action is `Review transcript`.

Back navigation is standardized as a top-left ghost `Back` button above the page title on Transcript Details, Analysis, and Folder Details. Analysis Back always targets `/Transcripts/Details?job_id=<jobId>` so direct visits still return to the same transcript when a job ID is present.

The Analysis page was simplified into a read-only responsive grid: Summary spans both columns, Classification and Keywords share compact panels, Entities use a grouped compact list, and English Translation appears full-width only when content exists. The page header keeps export/refresh/run actions, while transcript review is a small read-only summary plus link back to Details.

## Navigation And Page Copy

Verbose descriptive text was removed directly under the page headings for `/Folders`, `/Notifications`, `/Activity`, `/Help`, `/Admin/Users`, `/Admin/Audit`, `/Admin/Jobs`, `/Admin/Transcripts`, `/Admin/System-Health`, and `/Analysis/Review-Queue`. Form help, empty-state guidance, errors, confirmations, and useful section copy remain.

`/Supported-Formats` is no longer a primary standalone destination. Its useful upload/export/Unicode/Thaana/processing-limit content moved into `/Help` under `Supported formats`, and `/Supported-Formats` redirects to `/Help#supported-formats` for compatibility.

The user-facing account flow now says `Change password` instead of `Security`. The account menu links to Profile and About only; Profile contains a Password panel with a `Change password` action. The internal `/Account/Security` route remains available, but its page heading is `Change password`.

## Audit Toolbar

The Audit filter card now uses a single toolbar headed by `Audit events` with the result count on the same row. The count uses `1 result` and plural `results`, updates with filters, and no longer adds a separate count row. Filters are ordered Search, Category, Action, Outcome, Dates, Reset. Reset is last in source order and remains the final responsive-grid control.

## Responsive Behavior

Desktop gives the transcript column most of the width and keeps secondary controls in a narrow sidebar. The segment speaker rail is visible at desktop widths and the transcript text receives the remaining row width. Tablet and mobile stack the transcript first, then speaker/admin controls, avoiding horizontal page scrolling. Segment actions wrap cleanly beneath timestamps on narrow screens. At narrower Details widths, actions move below the two-line title rather than compressing or hiding it.

## Validation

Final validation passed:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build`
4. `git diff --check`

Responsive implementation notes for this pass:

1. Desktop expanded and collapsed sidebars keep the `Transcript App` heading and single hamburger toggle inside the fixed `h-16` brand header.
2. The top header and sidebar header use opaque backgrounds and aligned `h-16` heights without the content-overlap/clipping regression.
3. The Speakers popover is left-aligned to its trigger and width-constrained against the viewport with collision padding.
4. Header actions can wrap while the Speakers panel remains anchored to the trigger and bounded by viewport width.
5. Only the main content region scrolls; the top header and sidebar remain outside that scroll container.
