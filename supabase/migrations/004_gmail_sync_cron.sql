-- ============================================================
-- Grihaz — Gmail Daily Sync Cron Job
-- Migration: 004_gmail_sync_cron.sql
-- Runs once daily at 6am IST (00:30 UTC) to sync Gmail
-- for all homes with an active Gmail connection.
-- ============================================================

-- Enable pg_cron extension (already available on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily sync at 6am IST = 00:30 UTC
SELECT cron.schedule(
  'gmail-daily-sync',
  '30 0 * * *',
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/gmail-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'action',  'sync',
        'home_id', home_id::text
      )
    )
  FROM home_gmail_connections
  WHERE last_synced_at < now() - INTERVAL '23 hours'
     OR last_synced_at IS NULL;
  $$
);
