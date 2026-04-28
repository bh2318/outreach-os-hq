ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'yes_reply',
  ADD COLUMN IF NOT EXISTS reply_body text,
  ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acted_on boolean NOT NULL DEFAULT false;

UPDATE public.notifications
SET
  type = COALESCE(NULLIF(type, ''), kind, 'yes_reply'),
  reply_body = COALESCE(reply_body, reply_full),
  read = CASE WHEN status IN ('read', 'dismissed', 'acted') THEN true ELSE read END,
  acted_on = CASE WHEN status = 'acted' THEN true ELSE acted_on END;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;