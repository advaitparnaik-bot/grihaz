-- 011_gmail_sync_cron.sql
-- Replaces old gmail-daily-sync job with new sync-all approach

-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove old job
select cron.unschedule('gmail-daily-sync');

-- Store secrets in Vault
-- ⚠️ PROD: replace URL with https://rjkfdrmrjmwczgvcdrac.supabase.co/functions/v1
-- ⚠️ PROD: replace key with grihaz-prod service role key

select vault.create_secret(
  'https://guiuxbnhqbbhqeaavtsp.supabase.co/functions/v1',
  'GRIHAZ_EDGE_FUNCTION_URL'
);
select vault.create_secret(
  'REPLACE_WITH_PROD_SERVICE_ROLE_KEY',
  'GRIHAZ_SERVICE_ROLE_KEY'
);

-- Schedule new job — single HTTP call, no home_id needed
select cron.schedule(
  'gmail-daily-sync',
  '30 0 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'GRIHAZ_EDGE_FUNCTION_URL') || '/gmail-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'GRIHAZ_SERVICE_ROLE_KEY')
    ),
    body    := '{"action":"sync-all"}'::jsonb
  );
  $$
);