-- Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
-- Program Name: 004_transcript_folders.sql
-- Description: Database migration script
-- First Written on: 03/07/2026
-- Edited on: 21/07/2026
CREATE TABLE IF NOT EXISTS transcript_folders (
    id UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcript_folder_items (
    folder_id UUID NOT NULL REFERENCES transcript_folders(id) ON DELETE CASCADE,
    transcript_job_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (folder_id, transcript_job_id),
    UNIQUE (transcript_job_id)
);

CREATE INDEX IF NOT EXISTS transcript_folders_owner_updated_idx ON transcript_folders (owner_user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS transcript_folders_owner_name_lower_idx ON transcript_folders (owner_user_id, lower(name));
CREATE INDEX IF NOT EXISTS transcript_folder_items_folder_idx ON transcript_folder_items (folder_id, created_at DESC);
