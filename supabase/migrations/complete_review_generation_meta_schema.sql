-- COMPLETE Migration: Fix review_generation_meta schema
-- This adds ALL missing columns that the code expects
-- Run this ONCE - it will add all missing columns safely

-- Add ALL missing columns to review_generation_meta
ALTER TABLE review_generation_meta
ADD COLUMN IF NOT EXISTS language TEXT CHECK (language IN ('english', 'hinglish')),
ADD COLUMN IF NOT EXISTS structure_archetype_key VARCHAR(1),
ADD COLUMN IF NOT EXISTS structure_archetype TEXT,
ADD COLUMN IF NOT EXISTS casing_profile TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Ensure personality_variant column exists (in case it's also missing)
ALTER TABLE review_generation_meta
ADD COLUMN IF NOT EXISTS personality_variant TEXT;

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_review_generation_meta_doctor_id
ON review_generation_meta(doctor_id);

CREATE INDEX IF NOT EXISTS idx_review_generation_meta_created_at
ON review_generation_meta(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_generation_meta_doctor_created
ON review_generation_meta(doctor_id, created_at DESC);

-- Verify schema is correct
-- Query to check all columns exist:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'review_generation_meta'
-- ORDER BY ordinal_position;

-- Expected columns after migration:
-- - id (auto primary key)
-- - doctor_id (UUID)
-- - rating (INTEGER)
-- - language (TEXT)
-- - structure_archetype_key (VARCHAR)
-- - structure_archetype (TEXT)
-- - personality_variant (TEXT)
-- - casing_profile (TEXT)
-- - created_at (TIMESTAMP)
-- - (any other columns that existed before)
