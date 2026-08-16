# 🚀 Complete Deployment & Schema Fix Guide

## PROBLEM 1: Model Still Shows gemini-2.5-flash

**Root Cause:** Supabase Edge Functions need explicit redeployment after code changes

**Solution:**

### Option A: Deploy via Supabase CLI (RECOMMENDED)

```bash
# 1. Login to Supabase
supabase login

# 2. Link to your project
supabase link --project-id YOUR_SUPABASE_PROJECT_ID

# 3. Deploy the function
supabase functions deploy generate-review

# 4. Verify deployment
supabase functions list
supabase functions describe generate-review

# 5. Watch logs
supabase functions logs generate-review
```

### Option B: Deploy via Vercel Deployment

If your Edge Function is deployed via Vercel:

```bash
# Just push code and Vercel redeploys automatically
git push origin main
# Wait for Vercel deployment to complete
# Then test the live URL
```

### Verification

After deployment, test and check logs for:

```
✅ CORRECT: model: "gemini-3.5-flash"
❌ WRONG: model: "gemini-2.5-flash"
```

---

## PROBLEM 2: Database Schema Mismatch

### Step 1: Run Migration

Go to Supabase Dashboard → SQL Editor → Run New Query

Copy-paste **entire** content of:
```
supabase/migrations/fix_review_generation_meta_schema.sql
```

This will add all missing columns:
- `structure_archetype_key`
- `structure_archetype`
- `casing_profile`
- `created_at`

### Step 2: Verify Schema

Run this query to confirm columns exist:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'review_generation_meta'
ORDER BY ordinal_position;
```

Expected output should include:
- doctor_id
- rating
- language
- structure_archetype_key
- structure_archetype
- casing_profile
- created_at
- personality_variant
- id
- (any others that existed before)

---

## STEP-BY-STEP FIX CHECKLIST

### Phase 1: Deploy Code Changes
- [ ] Code change verified (gemini-3.5-flash at line 10)
- [ ] Run: `supabase functions deploy generate-review`
- [ ] OR push to main for Vercel auto-deploy
- [ ] Wait 2-3 minutes for deployment

### Phase 2: Fix Database Schema
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy migration SQL from `fix_review_generation_meta_schema.sql`
- [ ] Run the migration
- [ ] Verify schema with SELECT query above

### Phase 3: Test Live API
- [ ] Wait 5+ minutes for all changes to propagate
- [ ] Run test request (see below)
- [ ] Check logs for model name
- [ ] Verify reviews returned successfully

---

## TEST REQUEST (After Both Fixes)

Run in browser console on your live site:

```javascript
const response = await fetch('https://your-domain.vercel.app/functions/v1/generate-review', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'apikey': 'YOUR_SUPABASE_ANON_KEY'
  },
  body: JSON.stringify({
    doctor_id: '548fb82c-022d-4918-b299-5430346b3063',
    device_token: crypto.randomUUID(),
    rating: 5,
    language: 'english',
    selected_chips: ['Best dental implant', 'Teeth whitening']
  })
});

const data = await response.json();
console.log('=== RESPONSE ===');
console.log(JSON.stringify(data, null, 2));
console.log('\n=== FIRST REVIEW ===');
console.log(data.reviews?.[0]);
```

### Expected Success Output

```json
{
  "reviews": [
    "My clinic visit went well overall. The doctor explained the best dental implant procedure in detail. The teeth whitening options were also discussed. I felt confident with the treatment plan.",
    "...",
    "..."
  ],
  "target_count": 3,
  "quality": {
    "model": "gemini-3.5-flash",
    "timing_ms": 4521,
    ...
  }
}
```

### Check For

✅ Status: `200` (not 404)
✅ Reviews count: `3`
✅ Model: `"gemini-3.5-flash"` (not "gemini-2.5-flash")
✅ Keywords present: "Best dental implant" AND "Teeth whitening" appear in reviews
✅ No errors: No "column does not exist" errors

---

## Troubleshooting

### If Still Showing gemini-2.5-flash

1. Check Supabase function was deployed:
   ```bash
   supabase functions describe generate-review
   ```

2. Check environment variables:
   ```bash
   supabase secrets list
   ```
   
   If `GEMINI_MODEL` is set to old value, update it:
   ```bash
   supabase secrets set GEMINI_MODEL=gemini-3.5-flash
   supabase functions deploy generate-review
   ```

### If Column Missing Error

1. Verify migration ran successfully:
   ```sql
   SELECT * FROM information_schema.columns 
   WHERE table_name = 'review_generation_meta';
   ```

2. If column still missing, manually add:
   ```sql
   ALTER TABLE review_generation_meta ADD COLUMN structure_archetype_key VARCHAR(1);
   ALTER TABLE review_generation_meta ADD COLUMN structure_archetype TEXT;
   ALTER TABLE review_generation_meta ADD COLUMN casing_profile TEXT;
   ALTER TABLE review_generation_meta ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
   ```

---

## Summary of Changes

### Code Changes (Committed)
- ✅ `gemini-2.5-flash` → `gemini-3.5-flash`
- ✅ Model now configurable via env var
- ✅ Timeout fixes applied
- ✅ Geolocation non-blocking
- ✅ Duplicate-retry disabled (performance)

### Database Changes (Migration)
- ✅ Add structure_archetype_key column
- ✅ Add structure_archetype column
- ✅ Add casing_profile column
- ✅ Add created_at with default timestamp

### Expected Results
- ✅ API returns 200 (not 404)
- ✅ Reviews generated with gemini-3.5-flash
- ✅ Keywords appear 2+ times in each review
- ✅ No database column errors
- ✅ Request completes in 4-8 seconds

---

**Status:** Ready for deployment and testing
**Timeline:** 15-20 minutes total (5-10 min deploy + 5-10 min testing)
