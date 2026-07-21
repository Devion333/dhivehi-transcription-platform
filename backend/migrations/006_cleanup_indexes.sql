-- Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
-- Program Name: 006_cleanup_indexes.sql
-- Description: Database migration script
-- First Written on: 03/07/2026
-- Edited on: 21/07/2026
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at ASC, id ASC);
