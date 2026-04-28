CREATE TABLE public.incoming_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  reply_text text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  classified_as text,
  processed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.incoming_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_incoming_replies"
ON public.incoming_replies
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_incoming_replies_processed ON public.incoming_replies(processed, received_at DESC);
CREATE INDEX idx_incoming_replies_lead ON public.incoming_replies(lead_id);