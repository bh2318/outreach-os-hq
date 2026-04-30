-- Add notes column to mock_sites for Mock Studio Additional Context
ALTER TABLE public.mock_sites ADD COLUMN IF NOT EXISTS notes text;

-- Create operator_notes table for the Notes tab workspace
CREATE TABLE IF NOT EXISTS public.operator_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_all_operator_notes"
  ON public.operator_notes
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
