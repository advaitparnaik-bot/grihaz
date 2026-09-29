-- 013_auto_attendance_cron.sql
-- Auto-mark scheduled staff as present at 00:01 IST (18:31 UTC) daily

select cron.schedule(
  'auto-attendance-daily',
  '31 18 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'GRIHAZ_EDGE_FUNCTION_URL') || '/auto-attendance',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'GRIHAZ_SERVICE_ROLE_KEY')
    ),
    body    := '{}'::jsonb
  );
  $$
);
