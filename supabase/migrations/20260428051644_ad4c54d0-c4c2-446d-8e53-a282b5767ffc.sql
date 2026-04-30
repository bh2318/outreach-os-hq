-- Create all tables for Outreach OS

CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  county text,
  niche text,
  website_url text,
  site_score integer,
  site_audit_json jsonb,
  status text NOT NULL DEFAULT 'new',
  outreach_count integer NOT NULL DEFAULT 0,
  last_contacted timestamptz,
  notes text,
  place_id text UNIQUE,
  rating numeric,
  review_count integer,
  archived boolean NOT NULL DEFAULT false,
  website_goal text,
  client_assets jsonb,
  unsplash_images jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outreach_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  subject text,
  body text,
  sent_at timestamptz,
  opened_at timestamptz,
  sequence_number integer,
  status text
);

CREATE TABLE IF NOT EXISTS public.replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  email_id uuid REFERENCES public.outreach_emails(id) ON DELETE SET NULL,
  from_email text,
  subject text,
  body text,
  received_at timestamptz NOT NULL DEFAULT now(),
  intent text,
  classified_at timestamptz,
  confidence float,
  actioned boolean NOT NULL DEFAULT false,
  draft_response text,
  snoozed_until timestamptz,
  archived boolean NOT NULL DEFAULT false,
  reply_time_minutes integer
);

CREATE TABLE IF NOT EXISTS public.mock_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  preview_url text,
  status text NOT NULL DEFAULT 'not-generated',
  requested_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  sent_at timestamptz,
  opened_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  client_input text,
  notes text,
  archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'contacted',
  estimated_value integer,
  actual_value integer,
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  invoice_number text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  line_items jsonb,
  total_cents integer,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  paid_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  business_name text,
  detail text,
  outcome text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  id integer PRIMARY KEY DEFAULT 1,
  operator_name text DEFAULT 'Brad Hemminger',
  reply_to_email text DEFAULT 'weboutreach@bhsites.com',
  outreach_active boolean NOT NULL DEFAULT false,
  sending_enabled boolean NOT NULL DEFAULT true,
  leads_per_cycle integer NOT NULL DEFAULT 10,
  minutes_between_cycles integer NOT NULL DEFAULT 1,
  daily_email_cap integer NOT NULL DEFAULT 1500,
  pacific_send_start time NOT NULL DEFAULT '08:00:00',
  pacific_send_end time NOT NULL DEFAULT '18:00:00',
  min_site_score integer NOT NULL DEFAULT 100,
  last_cycle_at timestamptz,
  last_cycle_completed_at timestamptz,
  invoice_business_name text DEFAULT 'Brad Hemminger',
  invoice_amount integer NOT NULL DEFAULT 500,
  payment_due text DEFAULT 'Due on receipt',
  payment_note text DEFAULT '',
  followup_days integer[] NOT NULL DEFAULT ARRAY[4,9,18],
  CONSTRAINT settings_singleton CHECK (id = 1)
);

INSERT INTO public.settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.followup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  followup_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  draft_body text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT current_date,
  emails_sent integer NOT NULL DEFAULT 0,
  replies_received integer NOT NULL DEFAULT 0,
  mocks_generated integer NOT NULL DEFAULT 0,
  proposals_sent integer NOT NULL DEFAULT 0,
  revenue_cents integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.unsubscribed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  business_name text,
  unsubscribed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operator_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_place_id ON public.leads(place_id);
CREATE INDEX IF NOT EXISTS idx_leads_archived ON public.leads(archived);
CREATE INDEX IF NOT EXISTS idx_replies_actioned ON public.replies(actioned);
CREATE INDEX IF NOT EXISTS idx_replies_intent ON public.replies(intent);
CREATE INDEX IF NOT EXISTS idx_replies_archived ON public.replies(archived);
CREATE INDEX IF NOT EXISTS idx_mock_status ON public.mock_sites(status);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);
CREATE INDEX IF NOT EXISTS idx_activity_created ON public.activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_followup_scheduled ON public.followup_queue(scheduled_for);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsubscribed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies - open access for single user app
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'leads','outreach_emails','replies','mock_sites','deals',
    'invoices','activity_log','settings','notifications',
    'followup_queue','daily_metrics','unsubscribed','operator_notes'
  ]) LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "open_all_%s" ON public.%I; CREATE POLICY "open_all_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      t, t, t, t
    );
  END LOOP;
END $$;

-- Update settings with correct live values
UPDATE public.settings SET
  outreach_active = true,
  sending_enabled = true,
  leads_per_cycle = 10,
  minutes_between_cycles = 1,
  daily_email_cap = 1500,
  pacific_send_start = '08:00:00',
  pacific_send_end = '18:00:00',
  min_site_score = 100
WHERE id = 1;

-- Log the setup
INSERT INTO public.activity_log (action_type, detail, outcome)
VALUES ('system', 'Database initialized — Outreach OS ready for live operation', 'success');
