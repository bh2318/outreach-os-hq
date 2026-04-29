-- Add draft_response column to replies for pre-generated YES/MAYBE drafts
ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS draft_response text;
ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS draft_subject text;

-- Follow-up queue: one row per due follow-up, pre-drafted by the daily check job
CREATE TABLE IF NOT EXISTS public.followup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  business_name text NOT NULL,
  sequence_number integer NOT NULL,
  draft_subject text,
  draft_body text,
  due_date date NOT NULL DEFAULT (now()::date),
  sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_followup_queue_lead ON public.followup_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_queue_due ON public.followup_queue(due_date) WHERE sent = false;
-- One pending follow-up per lead+sequence
CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_queue_unique_pending
  ON public.followup_queue(lead_id, sequence_number) WHERE sent = false;

ALTER TABLE public.followup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_followup_queue" ON public.followup_queue FOR ALL USING (true) WITH CHECK (true);

-- Schedule check-followups daily at 15:00 UTC
DO $$
DECLARE
  existing int;
BEGIN
  SELECT count(*) INTO existing FROM cron.job WHERE jobname = 'check-followups-daily';
  IF existing = 0 THEN
    PERFORM cron.schedule(
      'check-followups-daily',
      '0 15 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://uyirdmipfazvtibcfatq.supabase.co/functions/v1/check-followups',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5aXJkbWlwZmF6dnRpYmNmYXRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNDEzMzEsImV4cCI6MjA5MjkxNzMzMX0.hPxBZpZiGoQGtNrZQ1UgncqO2sbAhmPnpC2EXPzT2LI"}'::jsonb,
        body := '{"trigger":"cron"}'::jsonb
      );
      $cron$
    );
  END IF;
END$$;