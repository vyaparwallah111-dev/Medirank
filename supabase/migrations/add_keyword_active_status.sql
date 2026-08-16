-- Add is_active column to doctor_keywords
-- This allows toggling keywords without deletion

ALTER TABLE public.doctor_keywords
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Ensure all existing keywords are active
UPDATE public.doctor_keywords SET is_active = true WHERE is_active IS NULL;

-- Create index for filtering active keywords
CREATE INDEX IF NOT EXISTS idx_doctor_keywords_active
ON public.doctor_keywords(doctor_id, is_active);
