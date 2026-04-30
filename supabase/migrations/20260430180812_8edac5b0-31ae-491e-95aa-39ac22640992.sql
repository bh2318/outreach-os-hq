-- 1. Add cycle control columns to settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS minutes_between_cycles integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS daily_email_cap integer NOT NULL DEFAULT 288,
  ADD COLUMN IF NOT EXISTS last_cycle_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cycle_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sending_enabled boolean NOT NULL DEFAULT true;

UPDATE public.settings
  SET minutes_between_cycles = COALESCE(minutes_between_cycles, 5),
      daily_email_cap = COALESCE(daily_email_cap, 288),
      sending_enabled = true
  WHERE id = 1;

-- 2. Wipe all operational data (keep settings)
TRUNCATE TABLE public.activity_log,
               public.outreach_emails,
               public.replies,
               public.notifications,
               public.followup_queue,
               public.deals,
               public.invoices,
               public.mock_sites,
               public.email_events,
               public.incoming_replies,
               public.unsubscribed,
               public.leads
RESTART IDENTITY CASCADE;

INSERT INTO public.activity_log (action_type, business_name, detail, outcome)
VALUES ('system', NULL, 'System reset complete — ready for live outreach', 'success');

-- 3. Reschedule send-daily-outreach to fire every 1 minute (gate inside function)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'send-daily-outreach-every-minute';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'send-daily-outreach-daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'send-daily-outreach-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://uyirdmipfazvtibcfatq.supabase.co/functions/v1/send-daily-outreach',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aXJkbWlwZmF6dnRpYmNmYXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNDEzMzEsImV4cCI6MjA5MjkxNzMzMX0.hPxBZpZiGoQGtNrZQ1UgncqO2sbAhmPnpC2EXPzT2LI"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);

-- 4. Enable realtime on leads + activity_log so the UI clears in real time
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;