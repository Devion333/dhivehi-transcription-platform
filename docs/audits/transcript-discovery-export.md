# Transcript Discovery and Export Audit

## Scope

Implemented transcript discovery and export improvements on `feature/transcript-discovery-export`:

1. Metadata-aware transcript search.
2. Search result links that open matching transcript segments.
3. Authenticated transcript downloads in TXT, JSON, SRT, and WebVTT.

Authentication, ownership rules, worker behavior, processing, speaker renaming, and PDF generation behavior were not changed.

## Search API

Endpoint:

```http
GET /api/search/transcripts
```

Supported optional query parameters:

```text
q
filename
reference
category
status
ownerUserId
createdFrom
createdTo
speaker
page
pageSize
```

Authorization:

| User type | Behavior |
| --- | --- |
| Standard user | Searches only owned transcripts. |
| Admin | Searches all transcripts, including ownerless legacy transcripts. |
| Standard user with `ownerUserId` | Rejected with `403`. |

Invalid date and unsupported status filters return safe `400` errors with `INVALID_SEARCH_FILTER`.

Search result shape includes public transcript metadata and, for transcript-text or speaker segment matches, stable segment fields:

```json
{
  "jobId": "job-123",
  "segmentId": "job-123_seg_000",
  "segmentIndex": 0,
  "speaker": "SPEAKER_00",
  "speakerDisplayName": "Officer Ahmed",
  "startTime": 12.5,
  "endTime": 18.2,
  "matchedText": "...excerpt..."
}
```

Metadata-only matches omit `segmentId`.

## Segment Navigation

Search result segment links navigate to:

```text
/Transcripts/Details?job_id=<jobId>&segment_id=<segmentId>
```

Transcript Details reads `segment_id`, waits for loaded segments, finds the stable segment ID, scrolls it into view once, and briefly highlights it. Audio does not autoplay; the existing Play action remains the explicit way to seek/play the segment.

## Downloads

Endpoint:

```http
GET /api/transcripts/:jobId/download?format=txt
GET /api/transcripts/:jobId/download?format=json
GET /api/transcripts/:jobId/download?format=srt
GET /api/transcripts/:jobId/download?format=vtt
```

Authorization uses the existing protected transcript access helper. Standard users can download owned transcripts only. Admins can download any transcript, including ownerless legacy transcripts.

Formats:

| Format | Content type | Notes |
| --- | --- | --- |
| TXT | `text/plain; charset=utf-8` | Metadata header plus timestamped speaker transcript lines. |
| JSON | `application/json; charset=utf-8` | Structured document without raw Qdrant payloads, vectors, MinIO URLs, infrastructure fields, or provider data. |
| SRT | `application/x-subrip; charset=utf-8` | Sequential numbering, corrected stored timestamps, renamed speakers. |
| WebVTT | `text/vtt; charset=utf-8` | `WEBVTT` header and valid `HH:MM:SS.mmm` timing. |

Downloads validate supported format, transcript access, timestamps, and safe filenames. Filenames are generated from safe reference/filename text with path/control characters removed.

## Frontend

Search now has a compact responsive filter panel with search text, category, status, date range, admin owner filter, reset, and a collapsible More filters section for filename, reference, and speaker.

Transcript Details now has one compact Download selector with Plain text, JSON, SRT subtitles, WebVTT subtitles, and PDF. PDF still uses the existing dialog flow. Non-PDF downloads use authenticated same-window blob downloads.

## Audit

Added audit actions:

```text
transcript_download_succeeded
transcript_download_failed
```

Allowed metadata is limited to:

```text
jobId
format
```

Exported content, transcript text, search queries, sensitive filenames, and raw provider errors are not stored.

Existing search auditing still stores query length and safe filter metadata, not raw search text.
