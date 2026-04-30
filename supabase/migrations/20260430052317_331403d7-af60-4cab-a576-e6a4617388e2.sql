
CREATE TABLE IF NOT EXISTS public.unsubscribed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  lead_id uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unsubscribed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_unsubscribed" ON public.unsubscribed FOR ALL USING (true) WITH CHECK (true);

-- Add Pipedream toggle column to settings
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS reply_pipeline_active boolean NOT NULL DEFAULT false;

-- Add invoice operator name + amount + payment_note
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS invoice_amount_cents integer NOT NULL DEFAULT 50000;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS payment_note text NOT NULL DEFAULT '';
