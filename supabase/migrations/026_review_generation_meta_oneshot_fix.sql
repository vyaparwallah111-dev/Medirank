-- One-shot fix for review_generation_meta schema.
--
-- Root cause: migration 020_review_generation_meta.sql already defines every
-- column below with the correct type, but the repeated "column does not
-- exist" errors in production indicate 020 was never actually applied to
-- the live database (only created ad-hoc via the Dashboard SQL editor for
-- some columns). This migration is idempotent (IF NOT EXISTS everywhere)
-- and safe to run even if some columns already exist.
--
-- Types match the exact columns reported in the "Meta persist failed"
-- error's columns_attempted list, using the same types as 020:
--   doctor_id                uuid  (FK to doctors)
--   rating                   integer
--   language                 text
--   structure_archetype_key  text
--   structure_archetype      text
--   personality_variant      text
--   casing_profile           text
--   created_at               timestamptz

ALTER TABLE public.review_generation_meta
  ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES public.doctors(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS rating INTEGER,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'english',
  ADD COLUMN IF NOT EXISTS structure_archetype_key TEXT,
  ADD COLUMN IF NOT EXISTS structure_archetype TEXT,
  ADD COLUMN IF NOT EXISTS personality_variant TEXT,
  ADD COLUMN IF NOT EXISTS casing_profile TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill created_at for any pre-existing rows that got a NULL default
UPDATE public.review_generation_meta SET created_at = NOW() WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_review_generation_meta_doctor_created
  ON public.review_generation_meta(doctor_id, created_at DESC);

-- Verify after running:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'review_generation_meta'
-- ORDER BY ordinal_position;
