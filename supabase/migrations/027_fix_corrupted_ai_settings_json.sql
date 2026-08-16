-- Fix for double/triple-JSON-encoded patient_concerns and usp_points in doctor_ai_settings.
--
-- ROOT CAUSE: patient_concerns/usp_points are correctly typed as `jsonb` (see
-- 016_ai_settings_error_logs.sql). The current save code (app/dashboard/actions.ts,
-- components/ai-review-settings-consolidated.tsx, components/ai-knowledge-base-settings.tsx)
-- does not explicitly stringify - it passes plain JS arrays through to supabase-js, which
-- serializes them correctly. However, the LOAD-side normalizer (`toList` in both components,
-- `jsonList` in supabase/functions/generate-review/index.ts) never attempted JSON.parse() on a
-- string value before this fix - it just comma-split it. So if a row ever ended up with a
-- JSON-encoded STRING sitting in the jsonb column (e.g. '["fear of pain"]' instead of the real
-- array ["fear of pain"]) - most likely from an older version of this save flow before the
-- current implementation - every subsequent load would comma-split that string into fragments
-- STILL containing literal brackets/quotes, display them in the textarea, and if the doctor
-- saved again without fully cleaning the textarea, that garbled text got written back as "new"
-- data - adding another layer of escaping on every round trip. This explains the deeply nested
-- backslash-escaped corruption in the reported screenshot.
--
-- The code fix (already applied) makes both the loaders and the save-side cleanList() try
-- JSON.parse() first, recursively, before falling back to comma-splitting - so this can no
-- longer get WORSE. This migration is the one-time cleanup for rows already corrupted.

-- ============================================================
-- STEP 1: DETECT - run this first and review the output.
-- A clean row has jsonb_typeof = 'array'. Anything else (typically 'string') is corrupted.
-- ============================================================
SELECT
  d.doctor_name,
  ai.doctor_id,
  jsonb_typeof(ai.patient_concerns) AS concerns_type,
  ai.patient_concerns AS concerns_raw,
  jsonb_typeof(ai.usp_points) AS usp_type,
  ai.usp_points AS usp_raw
FROM public.doctor_ai_settings ai
JOIN public.doctors d ON d.id = ai.doctor_id
WHERE jsonb_typeof(ai.patient_concerns) <> 'array'
   OR jsonb_typeof(ai.usp_points) <> 'array';

-- ============================================================
-- STEP 2: Create a one-time helper that repeatedly unwraps a jsonb value that has been
-- accidentally JSON-encoded as a string one or more times, until it becomes a real array
-- (or gives up safely after 6 attempts, returning an empty array rather than looping forever
-- or throwing on genuinely unrecoverable data).
-- ============================================================
CREATE OR REPLACE FUNCTION public.docrevu_unwrap_json_array(input jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  current_value jsonb := input;
  attempts int := 0;
BEGIN
  WHILE jsonb_typeof(current_value) = 'string' AND attempts < 6 LOOP
    BEGIN
      current_value := (current_value #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      RETURN '[]'::jsonb; -- not valid JSON text at this layer - can't recover further, reset to empty
    END;
    attempts := attempts + 1;
  END LOOP;
  IF jsonb_typeof(current_value) = 'array' THEN
    RETURN current_value;
  END IF;
  RETURN '[]'::jsonb; -- still not an array after 6 unwraps - give up safely rather than guess
END;
$$;

-- ============================================================
-- STEP 3: PREVIEW - see what the cleanup WOULD produce, without writing anything yet.
-- Review the "_after" columns carefully before running Step 4.
-- ============================================================
SELECT
  d.doctor_name,
  ai.doctor_id,
  ai.patient_concerns AS concerns_before,
  public.docrevu_unwrap_json_array(ai.patient_concerns) AS concerns_after,
  ai.usp_points AS usp_before,
  public.docrevu_unwrap_json_array(ai.usp_points) AS usp_after
FROM public.doctor_ai_settings ai
JOIN public.doctors d ON d.id = ai.doctor_id
WHERE jsonb_typeof(ai.patient_concerns) <> 'array'
   OR jsonb_typeof(ai.usp_points) <> 'array';

-- ============================================================
-- STEP 4: APPLY - ONLY uncomment and run this after reviewing Step 3's "_after" columns.
-- This is intentionally commented out - do not run it blind.
-- ============================================================
-- UPDATE public.doctor_ai_settings ai
-- SET patient_concerns = public.docrevu_unwrap_json_array(ai.patient_concerns),
--     usp_points = public.docrevu_unwrap_json_array(ai.usp_points),
--     updated_at = now()
-- WHERE jsonb_typeof(ai.patient_concerns) <> 'array'
--    OR jsonb_typeof(ai.usp_points) <> 'array';

-- ============================================================
-- STEP 5: VERIFY - confirm zero corrupted rows remain (should return 0 rows).
-- ============================================================
-- SELECT doctor_id FROM public.doctor_ai_settings
-- WHERE jsonb_typeof(patient_concerns) <> 'array' OR jsonb_typeof(usp_points) <> 'array';

-- ============================================================
-- STEP 6: cleanup the helper function once done (optional, keeps the DB tidy).
-- ============================================================
-- DROP FUNCTION IF EXISTS public.docrevu_unwrap_json_array(jsonb);
