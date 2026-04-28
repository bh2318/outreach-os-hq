-- Notifications for YES popup
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'yes_reply',
  business_name text NOT NULL,
  reply_preview text,
  reply_full text,
  lead_id uuid,
  mock_site_id uuid,
  status text NOT NULL DEFAULT 'unread',
  acted_at timestamptz
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY open_all_notifications ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- Lead extensions
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS county text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Mock-sites public bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('mock-sites', 'mock-sites', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "mock_sites_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'mock-sites');
CREATE POLICY "mock_sites_public_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'mock-sites');
CREATE POLICY "mock_sites_public_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'mock-sites');