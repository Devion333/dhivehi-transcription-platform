# Speaker Renaming Audit

## Storage Format

Speaker display names are stored on the parent transcript Qdrant payload as `speaker_names`:

```json
{
  "speaker_names": {
    "SPEAKER_00": "Officer Ahmed",
    "SPEAKER_01": "Interviewee"
  }
}
```

Segment payloads are not rewritten. Each segment keeps its generated `speaker` key, such as `SPEAKER_00`, and renderers resolve the display name at read time.

## Endpoint

`PATCH /api/transcripts/:jobId/speakers`

Request:

```json
{
  "speakerKey": "SPEAKER_00",
  "displayName": "Officer Ahmed"
}
```

Response:

```json
{
  "speakerKey": "SPEAKER_00",
  "displayName": "Officer Ahmed",
  "speakerNames": {
    "SPEAKER_00": "Officer Ahmed"
  },
  "reset": false
}
```

Unknown JSON fields are rejected. `displayName` is trimmed, must be non-empty, must be 80 characters or fewer, and must not contain control characters. Invalid keys or names return safe API errors such as `INVALID_SPEAKER_KEY` and `INVALID_SPEAKER_NAME`.

## Authorization

The endpoint uses the existing transcript ownership authorization path. Admins may rename speakers on any transcript. Standard users may rename speakers only on transcripts whose `owner_user_id` matches their session user ID. Ownerless legacy transcripts remain admin-only.

## Reset Behavior

Reset is performed by submitting `displayName` equal to the generated `speakerKey`. The backend removes that key from `speaker_names`, and rendering falls back to the original generated label.

## Rendering Behavior

The frontend uses `getSpeakerDisplayName(speakerKey, speakerNames)` for transcript detail segment labels, current-speaker audio display, and PDF payload construction. Original segment speaker keys are preserved internally.

## Analysis Behavior

Analysis transcript input is constructed with mapped display names where available. Existing cached analysis is not regenerated automatically after a rename. Rerunning analysis uses the updated display names.

## PDF Behavior

The PDF route fetches the protected backend transcript detail response for the submitted `jobId` and uses the backend-authorized `speakerNames` mapping to build PDF segment labels. Browser-submitted speaker labels are not trusted.

## Audit Behavior

Audit events added:

- `speaker_rename_succeeded`
- `speaker_rename_failed`
- `speaker_name_reset`

Metadata is allowlisted to `jobId` and `speakerKey`. Custom display names are not stored in audit metadata.

## Test Results

Automated tests cover owner rename, admin rename of legacy transcript, forbidden standard-user access, invalid keys, invalid names, reset, mapping persistence, unchanged segment keys, transcript responses with mappings, analysis input using mapped labels, unknown JSON rejection, and audit metadata excluding display names.
