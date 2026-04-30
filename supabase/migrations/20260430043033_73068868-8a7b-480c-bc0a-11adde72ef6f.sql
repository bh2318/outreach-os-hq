ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS website_goal text,
  ADD COLUMN IF NOT EXISTS client_assets jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unsplash_images jsonb DEFAULT '[]'::jsonb;