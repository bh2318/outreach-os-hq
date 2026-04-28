
-- LEADS
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  niche text,
  website_url text,
  site_score integer,
  site_audit_json jsonb,
  status text NOT NULL DEFAULT 'new',
  outreach_count integer NOT NULL DEFAULT 0,
  last_contacted timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- OUTREACH EMAILS
CREATE TABLE public.outreach_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  subject text,
  body text,
  sent_at timestamptz,
  opened_at timestamptz,
  sequence_number integer,
  status text
);

-- REPLIES
CREATE TABLE public.replies (
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
  actioned boolean NOT NULL DEFAULT false
);

-- MOCK SITES
CREATE TABLE public.mock_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  preview_url text,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  sent_at timestamptz,
  opened_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz
);

-- DEALS
CREATE TABLE public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'contacted',
  estimated_value integer,
  actual_value integer,
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- INVOICES
CREATE TABLE public.invoices (
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

-- ACTIVITY LOG
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  business_name text,
  detail text,
  outcome text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- SETTINGS (single row)
CREATE TABLE public.settings (
  id integer PRIMARY KEY DEFAULT 1,
  operator_name text DEFAULT '',
  operator_city text DEFAULT '',
  reply_to_email text DEFAULT '',
  daily_send_limit integer NOT NULL DEFAULT 50,
  send_window_start time NOT NULL DEFAULT '09:00',
  send_window_end time NOT NULL DEFAULT '17:00',
  require_approval boolean NOT NULL DEFAULT false,
  auto_followup boolean NOT NULL DEFAULT true,
  followup_days integer[] NOT NULL DEFAULT ARRAY[4,9,18],
  min_site_score integer NOT NULL DEFAULT 45,
  default_lead_volume integer NOT NULL DEFAULT 100,
  excluded_niches text[] NOT NULL DEFAULT ARRAY[]::text[],
  invoice_business_name text DEFAULT '',
  invoice_address text DEFAULT '',
  payment_terms_days integer NOT NULL DEFAULT 14,
  payment_instructions text DEFAULT '',
  google_places_key text,
  claude_api_key text,
  stripe_connected boolean NOT NULL DEFAULT false,
  calendly_connected boolean NOT NULL DEFAULT false,
  CONSTRAINT settings_singleton CHECK (id = 1)
);

INSERT INTO public.settings (id) VALUES (1);

-- Indices
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_created ON public.leads(created_at DESC);
CREATE INDEX idx_replies_actioned ON public.replies(actioned);
CREATE INDEX idx_replies_intent ON public.replies(intent);
CREATE INDEX idx_mock_status ON public.mock_sites(status);
CREATE INDEX idx_deals_stage ON public.deals(stage);
CREATE INDEX idx_activity_created ON public.activity_log(created_at DESC);

-- RLS — single-user private tool, Phase 1 has no auth.
-- Enable RLS and grant full access to anon + authenticated.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['leads','outreach_emails','replies','mock_sites','deals','invoices','activity_log','settings']) LOOP
    EXECUTE format('CREATE POLICY "open_all_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- SEED DATA: 8 example leads spanning statuses
WITH seed AS (
  INSERT INTO public.leads (business_name, owner_name, email, phone, city, state, niche, website_url, site_score, status, outreach_count, last_contacted, notes)
  VALUES
    ('Ridgeline Plumbing', 'Mark Halloway', 'mark@ridgelineplumbing.com', '555-204-9911', 'Boise', 'ID', 'plumbers', 'http://ridgelineplumbing.com', 32, 'contacted', 1, now() - interval '2 days', 'Old site, no SSL'),
    ('Cedar & Oak Landscaping', 'Diana Reyes', 'diana@cedaroakland.com', '555-771-2210', 'Portland', 'OR', 'landscapers', NULL, NULL, 'replied', 2, now() - interval '1 day', 'No website at all'),
    ('Apex Roofing Co', 'Tony Marchetti', 'tony@apexroofs.com', '555-880-3344', 'Denver', 'CO', 'roofers', 'http://apexroofs.com', 41, 'replied', 3, now() - interval '6 hours', 'Hot lead — wants call'),
    ('Bluebird HVAC', 'Sara Linn', 'sara@bluebirdhvac.com', '555-661-1190', 'Austin', 'TX', 'hvac', 'http://bluebirdhvac.com', 58, 'qualified', 2, now() - interval '3 days', NULL),
    ('GreenLeaf Electric', 'Pete Okafor', 'pete@greenleafelec.com', '555-220-7781', 'Seattle', 'WA', 'electricians', NULL, NULL, 'qualified', 1, now() - interval '12 hours', 'Mock requested'),
    ('Stonecrest Concrete', 'Jim Vance', 'jim@stonecrestconc.com', '555-330-2204', 'Phoenix', 'AZ', 'concrete', 'http://stonecrestconc.com', 27, 'won', 4, now() - interval '8 days', 'Closed — $2400'),
    ('Harbor Auto Detail', 'Lena Choi', 'lena@harborauto.com', '555-994-1120', 'San Diego', 'CA', 'auto detailing', NULL, NULL, 'new', 0, NULL, NULL),
    ('Northgate Pest Control', 'Owen Bryce', 'owen@northgatepest.com', '555-117-2390', 'Minneapolis', 'MN', 'pest control', 'http://northgatepest.com', 49, 'new', 0, NULL, NULL)
  RETURNING id, business_name, status, niche, city
)
SELECT 1;

-- Seed outreach emails for contacted leads
INSERT INTO public.outreach_emails (lead_id, subject, body, sent_at, sequence_number, status)
SELECT id, 'Quick idea for ' || business_name, 'Hi — noticed your site could use a refresh...', now() - interval '2 days', 1, 'sent'
FROM public.leads WHERE status IN ('contacted','replied','qualified','won');

-- Seed replies (3)
INSERT INTO public.replies (lead_id, from_email, subject, body, intent, classified_at, confidence, actioned)
SELECT id, email, 'Re: Quick idea', 'Yes please call me Thursday afternoon if possible.', 'call_request', now(), 0.94, false
FROM public.leads WHERE business_name = 'Apex Roofing Co';

INSERT INTO public.replies (lead_id, from_email, subject, body, intent, classified_at, confidence, actioned)
SELECT id, email, 'Re: Quick idea', 'Could you send a mock so I can see what you have in mind?', 'mock_request', now(), 0.91, false
FROM public.leads WHERE business_name = 'Cedar & Oak Landscaping';

INSERT INTO public.replies (lead_id, from_email, subject, body, intent, classified_at, confidence, actioned)
SELECT id, email, 'Re: Quick idea', 'What would something like this cost?', 'price_inquiry', now(), 0.88, false
FROM public.leads WHERE business_name = 'Bluebird HVAC';

-- Seed mock sites
INSERT INTO public.mock_sites (lead_id, status, requested_at, expires_at)
SELECT id, 'pending', now() - interval '4 hours', now() + interval '7 days'
FROM public.leads WHERE business_name = 'Cedar & Oak Landscaping';

INSERT INTO public.mock_sites (lead_id, status, requested_at, generated_at, preview_url, expires_at)
SELECT id, 'ready', now() - interval '1 day', now() - interval '20 hours', 'https://mock.example.com/greenleaf', now() + interval '7 days'
FROM public.leads WHERE business_name = 'GreenLeaf Electric';

-- Seed deals
INSERT INTO public.deals (lead_id, stage, estimated_value, stage_entered_at)
SELECT id, 'replied', 180000, now() - interval '6 hours' FROM public.leads WHERE business_name = 'Apex Roofing Co';

INSERT INTO public.deals (lead_id, stage, estimated_value, stage_entered_at)
SELECT id, 'mock_sent', 150000, now() - interval '20 hours' FROM public.leads WHERE business_name = 'GreenLeaf Electric';

INSERT INTO public.deals (lead_id, stage, estimated_value, stage_entered_at)
SELECT id, 'call_scheduled', 220000, now() - interval '2 days' FROM public.leads WHERE business_name = 'Bluebird HVAC';

INSERT INTO public.deals (lead_id, stage, estimated_value, actual_value, stage_entered_at)
SELECT id, 'won', 240000, 240000, now() - interval '4 days' FROM public.leads WHERE business_name = 'Stonecrest Concrete';

-- Seed activity log
INSERT INTO public.activity_log (action_type, business_name, detail, outcome, created_at) VALUES
  ('scraped', NULL, 'Scraper run: 8 leads found for plumbers, Boise. 6 qualified.', 'success', now() - interval '3 days'),
  ('emailed', 'Ridgeline Plumbing', 'Outreach email #1 sent', 'success', now() - interval '2 days'),
  ('emailed', 'Apex Roofing Co', 'Outreach email #1 sent', 'success', now() - interval '2 days'),
  ('replied', 'Apex Roofing Co', 'Reply received — classified as call_request', 'success', now() - interval '6 hours'),
  ('replied', 'Cedar & Oak Landscaping', 'Reply received — classified as mock_request', 'success', now() - interval '4 hours'),
  ('mock_generated', 'GreenLeaf Electric', 'Mock site generated', 'success', now() - interval '20 hours'),
  ('deal_updated', 'Stonecrest Concrete', 'Deal moved to won — $2400', 'success', now() - interval '4 days'),
  ('emailed', 'Northgate Pest Control', 'Email bounced', 'warning', now() - interval '1 day');
