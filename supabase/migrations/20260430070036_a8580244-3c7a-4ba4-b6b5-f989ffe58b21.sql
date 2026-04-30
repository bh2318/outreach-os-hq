CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE jid integer;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'check-followups-daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'check-followups-daily',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://uyirdmipfazvtibcfatq.supabase.co/functions/v1/check-followups',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aXJkbWlwZmF6dnRpYmNmYXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNDEzMzEsImV4cCI6MjA5MjkxNzMzMX0.hPxBZpZiGoQGtNrZQ1UgncqO2sbAhmPnpC2EXPzT2LI"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);