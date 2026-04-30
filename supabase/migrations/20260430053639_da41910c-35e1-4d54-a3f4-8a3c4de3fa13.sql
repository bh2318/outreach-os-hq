-- replies: snooze + reply time
ALTER TABLE public.replies
  ADD COLUMN IF NOT EXISTS snoozed_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS reply_minutes_after_outreach integer;

-- leads: open tracking
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_opened_at timestamp with time zone;

-- followup_queue: require approval
ALTER TABLE public.followup_queue
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- deals: revenue tracking
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer,
  ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

-- settings: pacific sending hours + tab persistence
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS pacific_send_start time NOT NULL DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS pacific_send_end time NOT NULL DEFAULT '18:00:00',
  ADD COLUMN IF NOT EXISTS last_active_tab text;

-- email_events for Resend webhook
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  email text,
  event_type text NOT NULL,
  resend_message_id text,
  payload jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_email_events" ON public.email_events
  FOR ALL USING (true) WITH CHECK (true);
