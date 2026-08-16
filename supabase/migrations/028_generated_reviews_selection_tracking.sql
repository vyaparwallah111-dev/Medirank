-- Adds selection tracking to generated_reviews so we can tell which of the 3 drafts a patient
-- actually copied, not just that a batch was generated. The `selected` boolean column already
-- existed (001_initial_schema.sql) but was never set anywhere - this migration adds the missing
-- pieces (draft_index, selected_at) and an index for the new "Selected Reviews" dashboard page.

ALTER TABLE public.generated_reviews
  ADD COLUMN IF NOT EXISTS draft_index SMALLINT,
  ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS generated_reviews_selected_idx
  ON public.generated_reviews (doctor_id, selected_at DESC)
  WHERE selected = true;
