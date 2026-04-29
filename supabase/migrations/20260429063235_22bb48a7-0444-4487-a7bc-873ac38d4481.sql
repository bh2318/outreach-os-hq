ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS place_id text,
  ADD COLUMN IF NOT EXISTS rating numeric,
  ADD COLUMN IF NOT EXISTS review_count integer;

CREATE UNIQUE INDEX IF NOT EXISTS leads_place_id_unique
  ON public.leads (place_id)
  WHERE place_id IS NOT NULL;