# Frontend Analysis Baseline

Snapshot date: 2026-07-15

Source branch: `frontend-reimplementation`

Source commit: `63978c5` (`Stabilize transcription and diarization pipeline before frontend rebuild`)

## Purpose

This folder preserves the current Next.js frontend implementation as a reference before the frontend rebuild planning work begins.

It is reference-only:

- It is not compiled by the active Next.js application.
- It is not imported by active frontend or backend code.
- It must not define active application routes.
- Git branches remain the authoritative historical backup.

## Preserved Scope

The snapshot preserves the current frontend implementation where present:

- `src/app/`
- `src/components/`
- `src/lib/`
- `src/config.ts`
- `public/`
- `package.json`
- `package-lock.json`
- `next.config.*`
- `tailwind.config.*`
- `postcss.config.*`
- `components.json`

Features preserved for reference:

- dashboard/landing stats UI
- upload page
- transcript list
- transcript details and editing
- transcript analysis view
- search route
- PDF export route and helper
- theme provider and shared UI components
- Dhivehi transcript rendering behavior in the current implementation

## Exclusions

Generated, heavy, secret, and runtime data folders/files were intentionally excluded:

- `.next/`
- `node_modules/`
- caches and build output
- `.env` files and secrets
- uploaded media
- model files
- Git metadata

No backend, worker, Docker, model, Redis, MinIO, Qdrant, or audit files were moved into this folder.
