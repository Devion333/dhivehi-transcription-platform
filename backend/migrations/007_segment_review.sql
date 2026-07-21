-- Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
-- Program Name: 007_segment_review.sql
-- Description: Database migration script
-- First Written on: 03/07/2026
-- Edited on: 21/07/2026
-- Add segment review + full-review settings (keep old approval columns for backward compatibility)

-- New system settings for full-review enforcement
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS require_full_review_before_download BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS require_full_review_before_analysis BOOLEAN NOT NULL DEFAULT FALSE;

-- Copy existing values from old approval columns to new full-review columns
UPDATE system_settings
  SET require_full_review_before_download = require_approval_before_download,
      require_full_review_before_analysis = require_approval_before_analysis
  WHERE id = 1;

-- Repurpose notify_review_status_changed as notify_review_progress_changed
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS notify_review_progress_changed BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE system_settings
  SET notify_review_progress_changed = notify_review_status_changed
  WHERE id = 1;

-- Old columns (require_approval_before_download, require_approval_before_analysis, notify_review_status_changed)
-- are retained as deprecated and will be removed in a future migration.
