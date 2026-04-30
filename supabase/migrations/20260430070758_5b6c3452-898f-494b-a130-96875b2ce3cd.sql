
-- Add archive support across all tables
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.followup_queue ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.followup_queue ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.mock_sites ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.mock_sites ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_replies_archived ON public.replies (archived);
CREATE INDEX IF NOT EXISTS idx_followup_archived ON public.followup_queue (archived);
CREATE INDEX IF NOT EXISTS idx_deals_archived ON public.deals (archived);
CREATE INDEX IF NOT EXISTS idx_mock_sites_archived ON public.mock_sites (archived);
