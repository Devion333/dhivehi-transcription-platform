# Reference-Primary Transcript Identity Audit

Date: 2026-07-19

## Summary

New transcript uploads require a reference number. Reference number is the primary human-facing transcript identifier across transcript-facing pages. Filename remains visible as secondary context and is not changed in storage or MinIO object names.

## Validation

Reference numbers are trimmed on upload, must be non-empty, and are limited to 100 characters. Hyphens, slashes, underscores, punctuation, and user-entered casing are preserved. Backend validation is authoritative; frontend validation mirrors it.

## Activity Enrichment

Activity items now expose optional transcript reference, filename, and concise detail fields from safe audit metadata when present. Legacy audit events without metadata still render and link by internal resource ID without failing the page.

## Contextual Back Navigation

Transcript Details and Analysis consume a validated internal `returnTo` query parameter. Links from Transcript List, Search, Folder Details, Activity, Notifications, Admin Transcripts, and Review Queue include context where practical. Unsafe external or malformed return paths fall back to safe defaults.

## Header Popups

The app shell uses one controlled header panel state for Notifications and Profile. Opening one closes the other; route changes close all panels. The existing dropdown primitive handles outside-click and Escape dismissal.
