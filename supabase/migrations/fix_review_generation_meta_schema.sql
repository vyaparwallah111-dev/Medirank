-- Migration: Fix review_generation_meta schema mismatch
-- This adds all missing columns that the code expects

-- 1. Add missing columns to review_generation_meta if they don't exist
ALTER TABLE review_generation_meta
ADD COLUMN IF NOT EXISTS structure_archetype_key VARCHAR(1),
ADD COLUMN IF NOT EXISTS structure_archetype TEXT,
ADD COLUMN IF NOT EXISTS casing_profile TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_review_generation_meta_doctor_created
ON review_generation_meta(doctor_id, created_at DESC);

-- 3. Verify review_generation_meta has all required columns
-- Expected columns: doctor_id, rating, language, structure_archetype_key,
-- structure_archetype, personality_variant, casing_profile, created_at, id (auto)

-- 4. Note: If this is a fresh migration, these statements are safe:
-- - ADD COLUMN IF NOT EXISTS ensures idempotency
-- - DEFAULT NOW() for created_at means existing rows get current timestamp
-- - This won't delete any existing data
