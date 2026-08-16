-- Adds selection tracking to generated_reviews so we can tell which of the 3 drafts a patient
-- actually copied, not just that a batch was generated.
--
-- CORRECTED: the first version of this migration assumed `selected boolean` already existed
-- (it's in 001_initial_schema.sql's CREATE TABLE statement) and only added draft_index/
-- selected_at. Running it produced "ERROR: 42703: column selected does not exist" - proof that
-- 001_initial_schema.sql was never actually applied to this database in full, the same way
-- 020/026/027 turned out not to be. Trusting a repo migration file as a description of live
-- schema (without being able to query the live DB directly) was the mistake - this version adds
-- every column the current generate-review code path touches, defensively, so it's correct
-- regardless of which older migrations did or didn't actually run.
--
-- If the previous run of this file failed partway through (Supabase's SQL editor generally runs
-- a pasted script as one transaction, so a failure on the CREATE INDEX likely rolled back the
-- ALTER TABLE lines above it too), this re-adds draft_index/selected_at safely either way -
-- IF NOT EXISTS makes every line safe to re-run.

ALTER TABLE public.generated_reviews
  ADD COLUMN IF NOT EXISTS selected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_index SMALLINT,
  ADD COLUMN IF NOT EXISTS selected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding JSONB,
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS generated_reviews_selected_idx
  ON public.generated_reviews (doctor_id, selected_at DESC)
  WHERE selected = true;

-- Verify after running (should show all 5 columns above with no errors):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'generated_reviews'
-- ORDER BY ordinal_position;
