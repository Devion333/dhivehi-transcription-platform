---
title: Use Case Specifications for the Dhivehi Multimedia Transcription and Analysis Platform
version: 1.0
date: 2026-07-19
---

# Use Case Specifications for the Dhivehi Multimedia Transcription and Analysis Platform

**Project Title:** Dhivehi Multimedia Transcription and Analysis Platform  
**Document Title:** Use Case Specifications for the Dhivehi Multimedia Transcription and Analysis Platform  
**Section:** Design and Implementation  
**Generation Date:** 2026-07-19  
**Document Version:** 1.0

\pagebreak

## Document Scope

This document specifies the implemented use cases represented in the main UML use case diagram. The actors are User, Administrator, Processing Worker, Analysis Service, and Maintenance Scheduler. Administrator inherits User capabilities, so ordinary user use cases list User unless an administrator-only responsibility is being specified.

Reference number is the primary human-facing transcript identifier. Uploaded filename is secondary context. Transcript Review refers to review of transcription accuracy and completeness, with statuses Unreviewed, Reviewed, Approved, and Rejected.

The document avoids implementation details such as source files, HTTP routes, database tables, deployment hosts, and infrastructure components.

\pagebreak

## UC_01 Authenticate

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_01</td></tr>
<tr><td><strong>Use Case</strong></td><td>Authenticate</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a registered person to sign in, receive role-appropriate navigation, and sign out securely.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The user has an account registered in the platform.<br />2. The authentication service is available.<br />3. Login is allowed even when maintenance mode is active.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. On success, the user is authenticated and taken to the Dashboard.<br />2. The user sees navigation appropriate to their role.<br />3. On logout, authentication state and stale return-location state are cleared.<br />4. Failed authentication does not create a session.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens the sign-in screen.<br />2. The system displays fields for credentials.<br />3. The User enters valid credentials.<br />4. The system verifies the credentials and account status.<br />5. The system creates an authenticated session.<br />6. The system redirects the User to the Dashboard.<br />7. The system displays ordinary navigation for a standard user.<br />8. If the authenticated actor is an Administrator, the system also displays administrative navigation.<br />9. The User may sign out.<br />10. The system clears authentication state and stale return-location state.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 4a: Maintenance mode is active</strong><br />4a.1. The system still permits authentication.<br />4a.2. After login, the system displays the maintenance banner when applicable.<br />4a.3. Standard users are restricted from mutation actions, but read-only access remains available.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 4a: Invalid credentials</strong><br />4a.1. The system rejects the sign-in attempt.<br />4a.2. The system displays an authentication failure message.<br />4a.3. No session is created.<br /><strong>Step 4b: Disabled account</strong><br />4b.1. The system rejects the sign-in attempt.<br />4b.2. The system displays that the account cannot be used.<br />4b.3. No session is created.</td></tr>
</table>

\pagebreak

## UC_02 Manage Profile

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_02</td></tr>
<tr><td><strong>Use Case</strong></td><td>Manage Profile</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for managing the authenticated user&#39;s display profile.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Profile details are viewed or updated when valid.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens profile management.<br />2. The system displays current profile information.<br />3. The User updates supported profile fields.<br />4. The system validates and saves the update.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: No update is made</strong><br />3a.1. The User leaves profile details unchanged.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 4a: Invalid profile data</strong><br />4a.1. The system rejects the update and displays a validation message.</td></tr>
</table>

## UC_03 Change Password

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_03</td></tr>
<tr><td><strong>Use Case</strong></td><td>Change Password</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for changing the authenticated user&#39;s password.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The password is changed when the current password and new password are valid.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens password change.<br />2. The User enters the current password and a new password.<br />3. The system validates the request.<br />4. The system saves the new password.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: The User cancels</strong><br />2a.1. The system makes no change.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 3a: Invalid current password or weak new password</strong><br />3a.1. The system rejects the request and displays the appropriate message.</td></tr>
</table>

\pagebreak

## UC_04 Upload Media

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_04</td></tr>
<tr><td><strong>Use Case</strong></td><td>Upload Media</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to upload supported audio or video media, provide mandatory reference information, and create a transcript record for processing.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. Uploads are enabled in System Settings.<br />3. The User has a valid media file in a supported audio or video format.<br />4. The User has a reference number for the transcript.<br />5. Maintenance mode is inactive for standard users, or the actor is an Administrator.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The media is stored when the upload succeeds.<br />2. A transcript record is created with the reference number as the primary identifier.<br />3. The transcript is queued for processing when automatic processing is enabled.<br />4. If automatic processing is disabled, the transcript remains pending and is not automatically queued.<br />5. Failed uploads do not create a completed transcript workflow.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens the upload workspace.<br />2. The system displays fields for reference number, category, file selection, notes, and expected speakers.<br />3. The User enters a reference number.<br />4. The User selects a category when category is required by policy.<br />5. The User selects or drops an audio or video file.<br />6. The system validates the reference number, category, file extension, and file size.<br />7. The User submits the upload.<br />8. The system prevents duplicate submission while the upload is in progress.<br />9. The system stores the media.<br />10. The system creates transcript metadata using the reference number and uploaded filename.<br />11. The system queues the media for processing when automatic processing is enabled.<br />12. The system displays the created transcript and current processing status.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 11a: Automatic processing is disabled</strong><br />11a.1. The system creates the transcript record.<br />11a.2. The system does not submit the media to the processing queue.<br />11a.3. The transcript remains pending until a future supported processing action is available.<br /><strong>Step 4a: Category is not required</strong><br />4a.1. The User may leave category empty.<br />4a.2. The system continues validation without category rejection.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 3a: Missing reference number</strong><br />3a.1. The system rejects the upload.<br />3a.2. The system displays that reference number is required.<br /><strong>Step 6a: Unsupported file type or oversized file</strong><br />6a.1. The system rejects the selected file.<br />6a.2. The system displays the supported formats or configured size limit.<br />6a.3. The User may select a different file or cancel.<br /><strong>Step 7a: Uploads disabled or maintenance restriction applies</strong><br />7a.1. The system prevents submission.<br />7a.2. The system displays that uploads are disabled by policy or unavailable during maintenance.<br /><strong>Step 9a: Storage failure</strong><br />9a.1. The system reports the upload failure.<br />9a.2. The transcript is not considered ready for processing.</td></tr>
</table>

\pagebreak

## UC_05 View Processing Status

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_05</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Processing Status</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to see the current processing state of a transcript identified by reference number.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript exists and is accessible to the User.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The User knows whether the transcript is pending, processing, transcribed, or failed.<br />2. The transcript record is not modified by viewing status.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens a transcript list, details view, upload result, notification, or related workspace.<br />2. The system retrieves the current processing status for the transcript.<br />3. The system displays the reference number and secondary filename context.<br />4. The system displays the status and any available stage summary.<br />5. If processing is still active, the system refreshes the displayed status when supported.<br />6. When processing completes, the system shows that transcript segments are available.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 5a: Processing has failed</strong><br />5a.1. The system displays a failed status.<br />5a.2. The User may wait for administrator intervention or view any available transcript context.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Transcript no longer exists or is inaccessible</strong><br />2a.1. The system displays that the transcript cannot be found or accessed.<br />2a.2. The User returns to a transcript list or originating workspace.</td></tr>
</table>

## UC_06 View Transcripts

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_06</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Transcripts</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to browse accessible transcripts using reference-first identity.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. At least one transcript may exist, or the list may be empty.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Accessible transcripts are displayed without changing transcript content.<br />2. Legacy transcripts without a reference display a no-reference label instead of an internal identifier.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript browsing.<br />2. The system retrieves transcripts available to the User.<br />3. The system displays each transcript using reference number first and filename second.<br />4. The system displays status, category, dates, segment counts, and analysis or review indicators where available.<br />5. The User selects a transcript.<br />6. The system opens the selected transcript details.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: No transcripts are available</strong><br />2a.1. The system displays an empty state.<br />2a.2. The User may upload media or use another workspace.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Transcript listing fails</strong><br />2a.1. The system displays an error state.<br />2a.2. The User may retry.</td></tr>
</table>

\pagebreak

## UC_07 Search Transcripts

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_07</td></tr>
<tr><td><strong>Use Case</strong></td><td>Search Transcripts</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for locating accessible transcripts by supported metadata and text criteria.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Matching accessible transcript results are displayed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User enters search criteria.<br />2. The system filters accessible transcripts.<br />3. The system displays matching transcripts reference-first.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: No results match</strong><br />3a.1. The system displays an empty result state.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Invalid filter criteria</strong><br />2a.1. The system displays a validation message.</td></tr>
</table>

## UC_08 View Transcript Details

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_08</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Transcript Details</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to inspect an accessible transcript, its media, segments, speakers, review state, folders, and analysis entry points.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript exists and is accessible to the User.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Transcript details are displayed without changing transcript content.<br />2. The system records a safe activity or audit event when applicable.<br />3. Contextual Back navigation remains available to the originating workspace.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens a transcript from a list, search result, folder, activity item, notification, or administrative area.<br />2. The system verifies that the User may access the transcript.<br />3. The system displays the transcript heading using reference number first.<br />4. The system displays filename as secondary context.<br />5. The system displays transcript status, category, timestamps, notes, segment count, speaker information, folder assignment, and Transcript Review status.<br />6. The system displays media playback when media is available.<br />7. The system displays transcript segments in order.<br />8. The system displays actions allowed by current policy, such as edit, speaker rename, review, download, and analysis access.<br />9. The User may follow a contextual Back action.<br />10. The system returns the User to the originating workspace when the return target is safe.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 1a: Opened from an administrative area</strong><br />1a.1. The system keeps the administrative return context when it is safe.<br />1a.2. The system displays administrator-available transcript context without changing ordinary transcript identity.<br /><strong>Step 6a: Media is unavailable</strong><br />6a.1. The system displays transcript details and segments without playback.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Access denied</strong><br />2a.1. The system prevents the details view.<br />2a.2. The system displays an authorization or not-found message.<br /><strong>Step 10a: Unsafe or missing return context</strong><br />10a.1. The system ignores the unsafe value.<br />10a.2. The system returns to the default transcript browsing workspace.</td></tr>
</table>

\pagebreak

## UC_09 Play Media

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_09</td></tr>
<tr><td><strong>Use Case</strong></td><td>Play Media</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for playing accessible transcript media from the details workspace.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User can access the transcript.<br />2. Media is available.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The User hears or views the media without modifying transcript data.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript details.<br />2. The system loads media playback controls.<br />3. The User starts playback.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: The User pauses or seeks</strong><br />3a.1. The system updates playback position.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Media cannot load</strong><br />2a.1. The system displays a playback error.</td></tr>
</table>

## UC_10 Edit Transcript

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_10</td></tr>
<tr><td><strong>Use Case</strong></td><td>Edit Transcript</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to correct transcript segment text when editing is permitted.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript is accessible to the User.<br />3. Transcript editing is enabled by policy.<br />4. Maintenance mode is inactive for standard users.<br />5. The transcript has editable text segments.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Edited segment text is saved when validation succeeds.<br />2. The updated text is visible in transcript details.<br />3. A safe activity or audit record is available when applicable.<br />4. If saving fails, existing segment text remains unchanged.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript details for a transcript identified by reference number.<br />2. The system displays transcript segments.<br />3. The User selects a segment to edit.<br />4. The system presents editable text for the selected segment.<br />5. The User changes the transcript text.<br />6. The User saves the change.<br />7. The system validates that the request is authorized and editing is permitted.<br />8. The system saves the updated segment text.<br />9. The system refreshes the displayed transcript segment.<br />10. The system records the edit event where applicable.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 6a: User cancels editing</strong><br />6a.1. The system discards the unsaved edit.<br />6a.2. The original segment text remains visible.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 7a: Editing disabled or maintenance restriction applies</strong><br />7a.1. The system rejects the save request.<br />7a.2. The system displays that editing is unavailable.<br /><strong>Step 7b: Authorization fails</strong><br />7b.1. The system rejects the save request.<br />7b.2. The segment is not changed.<br /><strong>Step 8a: Save conflict or persistence failure</strong><br />8a.1. The system displays a save failure.<br />8a.2. The User may retry or cancel.</td></tr>
</table>

## UC_11 Rename Speakers

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_11</td></tr>
<tr><td><strong>Use Case</strong></td><td>Rename Speakers</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to assign readable display names to generated speaker labels.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript is accessible to the User.<br />3. Speaker renaming is enabled by policy.<br />4. Maintenance mode is inactive for standard users.<br />5. The transcript has generated speaker labels.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The speaker display name is saved when valid.<br />2. All visible segments for that generated speaker show the updated display name.<br />3. A reset restores the generated speaker name when supported.<br />4. Failed saves leave existing display names unchanged.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript details.<br />2. The User opens the Speakers control.<br />3. The system lists generated speakers and any existing display names.<br />4. The User selects a generated speaker.<br />5. The User enters a display name.<br />6. The User saves the display name.<br />7. The system validates the display name and access rights.<br />8. The system updates the speaker display name.<br />9. The system updates all visible segments for that speaker.<br />10. The system records the speaker rename event where applicable.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 5a: Reset to generated speaker name</strong><br />5a.1. The User chooses to reset a display name.<br />5a.2. The system removes the custom display name.<br />5a.3. The generated speaker label is shown again.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 7a: Invalid display name</strong><br />7a.1. The system rejects the value.<br />7a.2. The User corrects the display name or cancels.<br /><strong>Step 7b: Speaker renaming disabled or maintenance restriction applies</strong><br />7b.1. The system prevents the change.<br />7b.2. Existing speaker labels remain unchanged.</td></tr>
</table>

## UC_12 Review Transcript

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_12</td></tr>
<tr><td><strong>Use Case</strong></td><td>Review Transcript</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a reviewer to record the accuracy and completeness review state for a transcript.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript is accessible to the User.<br />3. Maintenance mode is inactive for standard users.<br />4. The transcript is available for review.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Transcript Review status is updated to Reviewed, Approved, or Rejected when valid.<br />2. The reviewer and timestamp are recorded.<br />3. An optional review note is stored when supplied.<br />4. The review status becomes visible in lists, details, administration, and review queue views.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript details.<br />2. The User reviews the media and transcript content.<br />3. The system displays the current Transcript Review status.<br />4. The User selects Reviewed, Approved, or Rejected.<br />5. The User optionally enters a review note.<br />6. The User saves the review decision.<br />7. The system validates access and the requested status.<br />8. The system records the reviewer, timestamp, status, and note.<br />9. The system updates review indicators across transcript views.<br />10. The system records the review event where applicable.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 5a: No note is provided</strong><br />5a.1. The system saves the selected status without a note.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 7a: Unauthorized review attempt</strong><br />7a.1. The system rejects the update.<br />7a.2. The previous Transcript Review status remains unchanged.<br /><strong>Step 7b: Maintenance restriction applies</strong><br />7b.1. The system blocks the update for standard users.<br />7b.2. The system displays that changes are temporarily disabled.<br /><strong>Step 8a: Status update failure</strong><br />8a.1. The system displays a failure message.<br />8a.2. The previous review state remains visible.</td></tr>
</table>

\pagebreak

## UC_13 Download Transcript

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_13</td></tr>
<tr><td><strong>Use Case</strong></td><td>Download Transcript</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to export an accessible transcript in a supported format.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript is accessible to the User.<br />3. Transcript downloads are enabled by policy.<br />4. The requested format is enabled.<br />5. If approval is required before download, the transcript is Approved through Transcript Review.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. A transcript export file is generated and delivered when successful.<br />2. The download event is recorded where applicable.<br />3. The transcript record remains unchanged.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript details.<br />2. The User opens the Download control.<br />3. The system displays supported formats such as TXT, JSON, SRT, WebVTT, and PDF according to policy.<br />4. The User selects a format.<br />5. The system validates that downloads are enabled.<br />6. The system validates that the selected format is enabled.<br />7. The system checks Transcript Review approval when required.<br />8. The system generates the export file.<br />9. The system provides the file for download.<br />10. The system records the successful download where applicable.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 7a: Maintenance mode is active</strong><br />7a.1. The system permits the download because it is read-only.<br />7a.2. The download continues if all other policies pass.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 5a: Downloads disabled</strong><br />5a.1. The system rejects the request.<br />5a.2. The system displays that downloads are unavailable.<br /><strong>Step 6a: Unsupported or disabled format</strong><br />6a.1. The system rejects the selected format.<br />6a.2. The User may choose another enabled format.<br /><strong>Step 7b: Approval required but transcript is not Approved</strong><br />7b.1. The system prevents the download.<br />7b.2. The system displays that Transcript Review approval is required.<br /><strong>Step 8a: Export generation failure or incomplete transcript</strong><br />8a.1. The system displays an export failure.<br />8a.2. No download file is provided.</td></tr>
</table>

## UC_14 Run Analysis

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_14</td></tr>
<tr><td><strong>Use Case</strong></td><td>Run Analysis</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to initiate analysis for an accessible transcript when analysis policy permits it.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript is accessible to the User.<br />3. Analysis is enabled by policy.<br />4. Maintenance mode is inactive for standard users.<br />5. If approval is required before analysis, the transcript is Approved through Transcript Review.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The transcript analysis request is accepted when permitted.<br />2. Analysis status is updated so the User can monitor progress or view results later.<br />3. Existing completed analysis is not rerun when rerun policy prevents it.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript details.<br />2. The User chooses to run analysis.<br />3. The system validates transcript access.<br />4. The system validates that analysis is enabled.<br />5. The system validates Transcript Review approval if required.<br />6. The system validates whether rerun is allowed for a completed analysis.<br />7. The system submits the transcript to the Analysis Service.<br />8. The system displays analysis processing status.<br />9. The User later views analysis results when available.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 6a: Analysis already exists and rerun is allowed</strong><br />6a.1. The system accepts the rerun request.<br />6a.2. The system replaces or refreshes analysis status according to the current workflow.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 4a: Analysis disabled</strong><br />4a.1. The system rejects the request.<br />4a.2. The system displays that analysis is unavailable.<br /><strong>Step 5a: Approval required but transcript is not Approved</strong><br />5a.1. The system prevents the analysis request.<br />5a.2. The system displays that Transcript Review approval is required.<br /><strong>Step 7a: Analysis submission failure</strong><br />7a.1. The system displays a failure message.<br />7a.2. The User may retry when policy allows.</td></tr>
</table>

## UC_15 View Analysis

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_15</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Analysis</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to view stored analysis results for an accessible transcript.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. The transcript is accessible to the User.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Stored analysis results are displayed without changing transcript content.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens transcript analysis.<br />2. The system retrieves analysis status and available results.<br />3. The system displays summary, keywords, entities, classification, translation, and status where available.<br />4. The User returns to transcript details using contextual navigation.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: Analysis is not complete</strong><br />2a.1. The system displays the current analysis status.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Analysis cannot be loaded</strong><br />2a.1. The system displays an error state.</td></tr>
</table>

## UC_16 Manage Folders

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_16</td></tr>
<tr><td><strong>Use Case</strong></td><td>Manage Folders</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to organize accessible transcripts into folders.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. Maintenance mode is inactive for standard users when making changes.<br />3. The transcript being organized is accessible to the User.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Folders are created, renamed, or deleted when valid and permitted.<br />2. A transcript is added, moved, or removed from a folder when valid.<br />3. Folder membership reflects the current organization state.<br />4. If the current rule allows only one folder per transcript, moving a transcript updates the prior folder assignment.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens folder management.<br />2. The system displays the User&#39;s folders.<br />3. The User creates a folder by entering a name and optional description.<br />4. The system validates and saves the folder.<br />5. The User opens a folder or transcript organization control.<br />6. The User adds an accessible transcript identified by reference number to a folder.<br />7. The system saves the folder assignment.<br />8. The User may move the transcript to another folder.<br />9. The system updates the assignment so the transcript appears in the selected folder.<br />10. The User may remove a transcript from a folder.<br />11. The system removes only the folder assignment, not the transcript itself.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: Rename or delete folder</strong><br />3a.1. The User updates a folder name or description, or requests deletion.<br />3a.2. The system validates ownership and folder rules.<br />3a.3. The system saves the change or deletes the folder when permitted.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 4a: Invalid folder name</strong><br />4a.1. The system rejects the folder update.<br />4a.2. The system displays a validation message.<br /><strong>Step 6a: Transcript deleted or unavailable</strong><br />6a.1. The system rejects the assignment.<br />6a.2. The system displays that the transcript cannot be added.<br /><strong>Step 7a: Maintenance restriction applies</strong><br />7a.1. The system blocks folder changes for standard users.</td></tr>
</table>

\pagebreak

## UC_17 View Notifications

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_17</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Notifications</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to view workflow notifications and navigate to related transcripts.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.<br />2. Notifications may exist for the User.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Notifications are displayed with read or unread state.<br />2. Selected notifications can be marked read.<br />3. Related transcript navigation uses reference-first context where available.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens the notification panel or notification center.<br />2. The system retrieves notifications scoped to the User.<br />3. The system displays notification title, message, timestamp, and read state.<br />4. The User selects a notification related to a transcript.<br />5. The system marks the notification read when appropriate.<br />6. The system opens the related transcript or analysis context.<br />7. The User may return to notifications using contextual Back navigation.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: Mark all read</strong><br />3a.1. The User chooses to mark all notifications read.<br />3a.2. The system updates unread notifications for the User.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Notifications cannot be loaded</strong><br />2a.1. The system displays a compact error state.<br />2a.2. The User may retry.<br /><strong>Step 6a: Related transcript is unavailable</strong><br />6a.1. The system displays that the related item cannot be opened.</td></tr>
</table>

## UC_18 View Activity

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_18</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Activity</td></tr>
<tr><td><strong>Description</strong></td><td>Allows a user to view safe activity history with transcript reference context.</td></tr>
<tr><td><strong>Actors</strong></td><td>User</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The User is authenticated.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The User sees safe activity entries associated with their account or authorized scope.<br />2. Activity viewing does not expose sensitive audit metadata.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The User opens activity history.<br />2. The system retrieves safe activity items for the User.<br />3. The system displays action name, actor context, timestamp, and action detail.<br />4. For transcript-related activity, the system displays reference number first and filename as secondary context where available.<br />5. The User selects a transcript-related activity item.<br />6. The system opens the related transcript details with return context back to Activity.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 4a: Legacy activity lacks full transcript metadata</strong><br />4a.1. The system displays available safe details.<br />4a.2. The system does not substitute internal identifiers as the primary human-facing transcript identity.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Activity cannot be loaded</strong><br />2a.1. The system displays an error state.<br />2a.2. The User may retry.</td></tr>
</table>

## UC_19 Manage Users

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_19</td></tr>
<tr><td><strong>Use Case</strong></td><td>Manage Users</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to create and administer platform user accounts.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. The Administrator has administrative access.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. User accounts are created or updated when valid.<br />2. Account activation, deactivation, or password reset actions are recorded where applicable.<br />3. Invalid or unauthorized changes are rejected.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens user management.<br />2. The system displays users with account status and role information.<br />3. The Administrator creates a new user or selects an existing user.<br />4. The Administrator enters or updates supported account fields.<br />5. The system validates required fields, role, and account constraints.<br />6. The system saves the account change.<br />7. The system displays the updated account state.<br />8. The system records the administrative user-management action.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: Activate, deactivate, or reset password</strong><br />3a.1. The Administrator selects an account action.<br />3a.2. The system validates the action and target user.<br />3a.3. The system applies the change and records it.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 5a: Invalid or duplicate account information</strong><br />5a.1. The system rejects the change.<br />5a.2. The system displays a validation message.<br /><strong>Step 2a: Non-administrator attempts access</strong><br />2a.1. The system denies access to user management.</td></tr>
</table>

\pagebreak

## UC_20 Manage Transcript Ownership

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_20</td></tr>
<tr><td><strong>Use Case</strong></td><td>Manage Transcript Ownership</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for administrator oversight of transcript ownership.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Transcript ownership information is reviewed or changed through supported actions.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens transcript management.<br />2. The system displays transcript owner context.<br />3. The Administrator reviews ownership or initiates reassignment.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: Reassignment is needed</strong><br />3a.1. The Administrator follows UC_21 Reassign Transcript.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Transcript unavailable</strong><br />2a.1. The system displays that the transcript cannot be managed.</td></tr>
</table>

## UC_21 Reassign Transcript

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_21</td></tr>
<tr><td><strong>Use Case</strong></td><td>Reassign Transcript</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to change the owner of a transcript.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. The transcript exists.<br />3. A valid target user exists and can own transcripts.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The transcript owner is updated when valid.<br />2. The previous and new ownership state is recorded safely.<br />3. The transcript becomes accessible according to the new ownership rules.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens transcript management.<br />2. The system displays transcripts using reference number first and owner information.<br />3. The Administrator selects a transcript.<br />4. The Administrator opens reassignment options.<br />5. The system displays eligible target users.<br />6. The Administrator selects a new owner.<br />7. The system validates the transcript and target user.<br />8. The system updates ownership.<br />9. The system refreshes the transcript management view.<br />10. The system records the reassignment event.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 6a: Administrator cancels reassignment</strong><br />6a.1. The system closes reassignment without changing ownership.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 7a: Target user is invalid or unavailable</strong><br />7a.1. The system rejects the reassignment.<br />7a.2. The previous owner remains unchanged.<br /><strong>Step 7b: Transcript no longer exists</strong><br />7b.1. The system displays that the transcript cannot be reassigned.</td></tr>
</table>

## UC_22 Delete Transcript

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_22</td></tr>
<tr><td><strong>Use Case</strong></td><td>Delete Transcript</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to delete a transcript after reviewing a deletion preview.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. The transcript exists.<br />3. The Administrator understands that deletion is destructive.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The transcript and related stored transcript data are removed when deletion succeeds.<br />2. The deletion result is recorded.<br />3. Partial failures are reported safely without exposing sensitive infrastructure details.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens transcript management.<br />2. The Administrator selects a transcript identified by reference number.<br />3. The system displays a deletion preview with safe counts and consequences.<br />4. The Administrator confirms deletion.<br />5. The system validates administrative access.<br />6. The system deletes transcript-related records and associated media objects that belong to the transcript deletion workflow.<br />7. The system removes the transcript from administrative listings.<br />8. The system records successful deletion.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 4a: Administrator cancels deletion</strong><br />4a.1. The system closes the confirmation.<br />4a.2. No transcript data is deleted.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 6a: Partial cleanup failure</strong><br />6a.1. The system reports that deletion partially completed.<br />6a.2. The system identifies safe cleanup categories requiring attention.<br />6a.3. The Administrator may retry or investigate operational logs.<br /><strong>Step 5a: Unauthorized attempt</strong><br />5a.1. The system denies deletion.</td></tr>
</table>

\pagebreak

## UC_23 Manage Processing Jobs

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_23</td></tr>
<tr><td><strong>Use Case</strong></td><td>Manage Processing Jobs</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to inspect processing jobs, worker health, queue state, and retry availability.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. Processing jobs may exist.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The Administrator understands job status and retry eligibility.<br />2. Job data is not changed unless a supported retry action is performed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens job management.<br />2. The system displays job summaries with transcript reference context where available.<br />3. The system displays current stage, status, retry count, and safe failure information.<br />4. The Administrator filters or selects a job.<br />5. The system displays detailed pipeline and health context.<br />6. The Administrator determines whether retry is appropriate.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 6a: Retry is required</strong><br />6a.1. The Administrator follows UC_24 Retry Failed Job.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Job information cannot be loaded</strong><br />2a.1. The system displays an error state.<br />2a.2. The Administrator may retry loading job information.</td></tr>
</table>

## UC_24 Retry Failed Job

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_24</td></tr>
<tr><td><strong>Use Case</strong></td><td>Retry Failed Job</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for retrying a supported failed processing or analysis job.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. The selected job is failed and retryable.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. The retry is requested when permitted.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens a failed job.<br />2. The system displays retry eligibility.<br />3. The Administrator requests retry.<br />4. The system validates and submits the retry.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: Retry is unavailable</strong><br />2a.1. The system displays the reason retry is unavailable.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 4a: Retry fails</strong><br />4a.1. The system displays a safe failure message.</td></tr>
</table>

## UC_25 View Audit Logs

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_25</td></tr>
<tr><td><strong>Use Case</strong></td><td>View Audit Logs</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to review safe audit records for operational accountability.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. Audit records may exist.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Audit events are displayed without exposing raw sensitive metadata.<br />2. Filtering or viewing audit records does not modify audited resources.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens audit logs.<br />2. The system displays audit entries with timestamp, actor, action, category, outcome, and target context.<br />3. The Administrator applies supported filters such as date range, actor, action, category, outcome, or resource context.<br />4. The system validates filter values.<br />5. The system displays matching records in descending time order.<br />6. The Administrator opens an audit detail entry.<br />7. The system displays safe formatted metadata and context.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: No filters are applied</strong><br />3a.1. The system displays recent audit entries using default pagination.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 4a: Invalid filter</strong><br />4a.1. The system displays a validation message.<br /><strong>Step 2a: Non-administrator attempts access</strong><br />2a.1. The system denies access.</td></tr>
</table>

\pagebreak

## UC_26 Export Audit Logs

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_26</td></tr>
<tr><td><strong>Use Case</strong></td><td>Export Audit Logs</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for exporting filtered audit logs.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. Matching audit records exist within export limits.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. A filtered audit export is generated when valid.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator filters audit logs.<br />2. The Administrator requests export.<br />3. The system validates export size and filters.<br />4. The system generates the export file.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 1a: No filters are applied</strong><br />1a.1. The system exports the default allowed audit scope if within limits.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 3a: Export too large</strong><br />3a.1. The system rejects the export and asks for narrower filters.</td></tr>
</table>

## UC_27 Monitor System Health

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_27</td></tr>
<tr><td><strong>Use Case</strong></td><td>Monitor System Health</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder for viewing backend dependency and worker health.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. System health status is displayed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens health monitoring.<br />2. The system displays service and worker health.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: A dependency is unhealthy</strong><br />2a.1. The system displays the unhealthy status.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Health data cannot be loaded</strong><br />2a.1. The system displays an error state.</td></tr>
</table>

## UC_28 Configure System Settings

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_28</td></tr>
<tr><td><strong>Use Case</strong></td><td>Configure System Settings</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to configure active runtime policy categories and refresh public settings immediately after changes.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. The Administrator has administrative access.<br />3. Current system settings are available.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Valid settings changes are saved.<br />2. Public maintenance and announcement state refreshes immediately after save or restore.<br />3. Settings changes are audited.<br />4. Invalid settings are rejected and the previous baseline remains in effect.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens System Settings.<br />2. The system displays categories: Uploads, Processing, Transcripts and analysis, Security, Notifications, Retention, and Maintenance.<br />3. The Administrator selects a category.<br />4. The system displays only the selected section while preserving shared unsaved form state.<br />5. The Administrator changes one or more settings.<br />6. The system tracks unsaved changes across categories.<br />7. The Administrator selects Save Changes.<br />8. The system validates allowlists, ranges, required banner messages, retention values, and other active policy rules.<br />9. The system saves the settings.<br />10. The system refreshes shared public settings so banners and policy guidance update immediately.<br />11. The system updates the local settings baseline.<br />12. The system displays a success message and records an audit event.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 7a: Restore Defaults</strong><br />7a.1. The Administrator chooses Restore Defaults.<br />7a.2. The system asks for confirmation.<br />7a.3. The Administrator confirms.<br />7a.4. The system restores default settings, refreshes public settings, updates the form baseline, and records an audit event.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 8a: Validation failure</strong><br />8a.1. The system rejects the save.<br />8a.2. The system displays the validation message.<br />8a.3. Unsaved form values remain available for correction.<br /><strong>Step 9a: Save failure</strong><br />9a.1. The system displays that settings could not be saved.<br />9a.2. The previous saved settings remain active.<br /><strong>Step 10a: Public settings refresh failure</strong><br />10a.1. The system keeps the saved settings.<br />10a.2. The system displays a warning that banner refresh could not be completed.</td></tr>
</table>

## UC_29 Manage Maintenance Mode

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_29</td></tr>
<tr><td><strong>Use Case</strong></td><td>Manage Maintenance Mode</td></tr>
<tr><td><strong>Description</strong></td><td>Allows an administrator to enable or disable maintenance mode and communicate restricted operation to users.</td></tr>
<tr><td><strong>Actors</strong></td><td>Administrator</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The Administrator is authenticated.<br />2. System Settings are available.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Maintenance mode is enabled or disabled according to the saved setting.<br />2. Banners refresh immediately after saving.<br />3. Administrators retain full access.<br />4. Standard users keep read access but mutation actions are blocked while maintenance is active.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Administrator opens System Settings.<br />2. The Administrator selects Maintenance.<br />3. The system displays maintenance mode controls and message fields.<br />4. The Administrator enables or disables maintenance mode.<br />5. The Administrator enters a maintenance message when required.<br />6. The Administrator saves settings.<br />7. The system validates the maintenance configuration.<br />8. The system saves the setting.<br />9. The system refreshes public settings immediately.<br />10. The system displays or removes the maintenance banner.<br />11. The system applies maintenance policy to standard users.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 11a: Standard user views existing content</strong><br />11a.1. The system permits read-only access such as dashboard, existing transcripts, downloads, notifications, and profile checks.<br /><strong>Step 11b: Standard user attempts a mutation</strong><br />11b.1. The system blocks the action.<br />11b.2. The system returns a maintenance-mode message.<br />11b.3. Upload and other mutation controls are disabled where the interface can determine maintenance state.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 7a: Missing required maintenance message</strong><br />7a.1. The system rejects the save.<br />7a.2. The Administrator enters a valid message or disables maintenance mode.</td></tr>
</table>

\pagebreak

## UC_30 Process Uploaded Media

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_30</td></tr>
<tr><td><strong>Use Case</strong></td><td>Process Uploaded Media</td></tr>
<tr><td><strong>Description</strong></td><td>Allows provider-neutral processing workers to convert uploaded media, identify speaker segments, generate Dhivehi transcription, and update transcript status.</td></tr>
<tr><td><strong>Actors</strong></td><td>Processing Worker</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. A transcript record and stored media exist.<br />2. Processing is enabled.<br />3. The media has been submitted for automatic processing.<br />4. Processing workers are available.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Converted media is available for downstream processing when conversion succeeds.<br />2. Speaker diarization segments are created when diarization succeeds.<br />3. Dhivehi transcription text is stored for segments when transcription succeeds.<br />4. Processing status is updated after each stage.<br />5. A completion or failure notification is created according to notification settings.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Processing Worker receives an uploaded media processing task.<br />2. The Processing Worker retrieves the stored media.<br />3. The Processing Worker converts the media to the required processing format.<br />4. The Processing Worker updates conversion status.<br />5. The Processing Worker performs speaker diarization.<br />6. The Processing Worker stores speaker segment timing and speaker labels.<br />7. The Processing Worker generates Dhivehi transcription for each segment.<br />8. The Processing Worker stores transcript text and segment status.<br />9. The Processing Worker updates the transcript processing status to complete when all required stages succeed.<br />10. The system creates a completion notification when enabled.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 3a: Media is already in a usable format</strong><br />3a.1. The Processing Worker may pass the media through conversion with no user-visible change.<br />3a.2. Processing continues to diarization.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 3a: Conversion failure</strong><br />3a.1. The Processing Worker records a failed conversion status.<br />3a.2. The system creates a failure notification when enabled.<br /><strong>Step 5a: Diarization failure</strong><br />5a.1. The Processing Worker records a diarization failure.<br />5a.2. Downstream transcription does not proceed for unavailable segments.<br /><strong>Step 7a: Transcription failure</strong><br />7a.1. The Processing Worker records failed segment or transcript status.<br />7a.2. The system makes the failure visible to users and administrators.</td></tr>
</table>

\pagebreak

## UC_31 Convert Media

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_31</td></tr>
<tr><td><strong>Use Case</strong></td><td>Convert Media</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder included by UC_30 for preparing uploaded media for downstream processing.</td></tr>
<tr><td><strong>Actors</strong></td><td>Processing Worker</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. A processing task references stored media.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Media is converted or marked failed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Processing Worker loads media.<br />2. The Processing Worker converts it to a processing format.<br />3. The Processing Worker records conversion status.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: Conversion not required</strong><br />2a.1. The Processing Worker records the media as ready.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Conversion fails</strong><br />2a.1. The Processing Worker records failure.</td></tr>
</table>

## UC_32 Perform Speaker Diarization

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_32</td></tr>
<tr><td><strong>Use Case</strong></td><td>Perform Speaker Diarization</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder included by UC_30 for identifying speaker segments.</td></tr>
<tr><td><strong>Actors</strong></td><td>Processing Worker</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. Media is ready for diarization.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Speaker segments are created or the stage is marked failed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Processing Worker analyzes speaker turns.<br />2. The Processing Worker stores segment timing and generated speaker labels.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 1a: Single-speaker content</strong><br />1a.1. The Processing Worker may assign all segments to one generated speaker.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 1a: Diarization fails</strong><br />1a.1. The Processing Worker records failure.</td></tr>
</table>

## UC_33 Generate Dhivehi Transcription

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_33</td></tr>
<tr><td><strong>Use Case</strong></td><td>Generate Dhivehi Transcription</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder included by UC_30 for producing Dhivehi transcript text.</td></tr>
<tr><td><strong>Actors</strong></td><td>Processing Worker</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. Speaker segments exist.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Segment transcription text is stored or marked failed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Processing Worker transcribes each segment.<br />2. The Processing Worker stores Dhivehi text.<br />3. The Processing Worker records segment status.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 1a: Some segments are silent or unclear</strong><br />1a.1. The Processing Worker stores available results and status per segment.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 1a: Transcription fails</strong><br />1a.1. The Processing Worker records failure.</td></tr>
</table>

## UC_34 Update Processing Status

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_34</td></tr>
<tr><td><strong>Use Case</strong></td><td>Update Processing Status</td></tr>
<tr><td><strong>Description</strong></td><td>Placeholder included by UC_30 for exposing stage progress and terminal state.</td></tr>
<tr><td><strong>Actors</strong></td><td>Processing Worker</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. A processing task is active or has ended.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Users and administrators can see the current processing state.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Processing Worker completes or fails a stage.<br />2. The Processing Worker updates the transcript status.<br />3. The system displays the new status.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 2a: Status is terminal</strong><br />2a.1. The system displays completion or failure state.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Status update fails</strong><br />2a.1. The worker logs the failure for operational investigation.</td></tr>
</table>

## UC_35 Generate Transcript Analysis

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_35</td></tr>
<tr><td><strong>Use Case</strong></td><td>Generate Transcript Analysis</td></tr>
<tr><td><strong>Description</strong></td><td>Allows the Analysis Service to generate and store analysis outputs for a transcript.</td></tr>
<tr><td><strong>Actors</strong></td><td>Analysis Service</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. A transcript exists and contains transcribed content.<br />2. A user-facing analysis request has been accepted.<br />3. Analysis processing resources are available.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Analysis status is updated.<br />2. Generated outputs are saved when analysis succeeds.<br />3. A notification is created according to notification settings.<br />4. Failure status is available when analysis cannot be completed.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Analysis Service receives an accepted analysis task.<br />2. The Analysis Service retrieves the transcript content.<br />3. The Analysis Service generates a summary.<br />4. The Analysis Service extracts keywords.<br />5. The Analysis Service extracts entities.<br />6. The Analysis Service classifies the transcript.<br />7. The Analysis Service generates an English translation when supported by the workflow.<br />8. The Analysis Service saves available analysis outputs.<br />9. The system updates analysis status to complete.<br />10. The system creates an analysis notification when enabled.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 7a: Some analysis outputs are unavailable</strong><br />7a.1. The Analysis Service saves available outputs.<br />7a.2. The system displays only available results.<br /><strong>Step 1a: Automatic analysis after transcription</strong><br />1a.1. Automatic analysis is stored as a setting but is not currently integrated into the worker workflow.<br />1a.2. Analysis is initiated through the supported user-facing action.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 2a: Transcript content unavailable</strong><br />2a.1. The Analysis Service records failure status.<br />2a.2. The system displays analysis failure.<br /><strong>Step 8a: Saving results fails</strong><br />8a.1. The system records failure status.<br />8a.2. The User may retry analysis when policy allows.</td></tr>
</table>

## UC_36 Clean Expired System Records

<table class="use-case-specification">
<colgroup><col style="width:28%" /><col style="width:72%" /></colgroup>
<tr><th>Field</th><th>Content</th></tr>
<tr><td><strong>Use Case ID</strong></td><td>UC_36</td></tr>
<tr><td><strong>Use Case</strong></td><td>Clean Expired System Records</td></tr>
<tr><td><strong>Description</strong></td><td>Allows the Maintenance Scheduler to remove expired audit records and notifications according to System Settings retention values.</td></tr>
<tr><td><strong>Actors</strong></td><td>Maintenance Scheduler</td></tr>
<tr><td><strong>Preconditions</strong></td><td>1. The backend maintenance scheduler is running, or the manual maintenance command is executed.<br />2. System Settings are available.<br />3. Audit log retention and notification retention values are configured in days.</td></tr>
<tr><td><strong>Post Conditions</strong></td><td>1. Expired audit records older than the UTC cutoff are deleted when audit retention is greater than zero.<br />2. Expired notifications older than the UTC cutoff are deleted when notification retention is greater than zero.<br />3. Retention value zero keeps that category indefinitely.<br />4. Transcripts, transcript segments, analysis results, media, folders, users, sessions, and system settings are not deleted by this cleanup.<br />5. Deletion counts are logged and recorded in audit history when rows are deleted or when cleanup is manually triggered.</td></tr>
<tr><td><strong>Standard Process</strong></td><td>1. The Maintenance Scheduler starts the scheduled cleanup cycle once per day.<br />2. The system prevents overlapping cleanup runs.<br />3. The system obtains a multi-instance cleanup lock.<br />4. The system reads audit and notification retention settings.<br />5. The system calculates UTC cutoffs from the current time and retention days.<br />6. The system skips any category with retention set to zero.<br />7. The system deletes expired audit records in batches when audit retention is greater than zero.<br />8. The system deletes expired notifications in batches when notification retention is greater than zero.<br />9. The system logs deleted counts.<br />10. The system records a cleanup audit event when rows were deleted or when the run was manual.<br />11. The system releases the cleanup lock.</td></tr>
<tr><td><strong>Alternative Process</strong></td><td><strong>Step 1a: Manual cleanup command is run</strong><br />1a.1. An operator runs the supported maintenance cleanup command.<br />1a.2. The system uses the same retention settings and cleanup rules as scheduled cleanup.<br />1a.3. The system prints deleted counts and returns a non-zero result on failure.<br /><strong>Step 3a: Another backend instance already holds the lock</strong><br />3a.1. The system skips the run.<br />3a.2. The system logs that cleanup did not run because another instance is active.</td></tr>
<tr><td><strong>Exception Flow</strong></td><td><strong>Step 7a: Audit cleanup failure</strong><br />7a.1. The system logs the audit cleanup failure.<br />7a.2. The backend remains running.<br />7a.3. The next scheduled cleanup remains active.<br /><strong>Step 8a: Notification cleanup failure</strong><br />8a.1. The system logs the notification cleanup failure.<br />8a.2. The backend remains running.<br />8a.3. The next scheduled cleanup remains active.</td></tr>
</table>

\pagebreak

