# 🔍 Diagnosis Testing - Find Root Cause

## Why Keywords Are Missing

The screenshots show **hardcoded fallbackReviews from the frontend**, not API-generated reviews.

This happens when the API returns an error OR fewer than 3 reviews:
```typescript
// From review-experience.tsx line 320
setReviews(!response.ok || returned.length < 3 ? fallback : returned);
```

## Test Steps

### Step 1: Check Server Logs

The API now has comprehensive logging. Check the dev server console:

```bash
# Terminal where dev server is running (npm run dev)
# Watch for these logs:
🔍 DIAGNOSIS START
Doctor ID: [uuid]
Selected Chips: [keywords]
High Priority Keywords: [keywords]
📤 Sending to Gemini...
📥 RAW GEMINI RESPONSE (first 500 chars): [response]
```

### Step 2: Make a Test Request with Logging

Open browser console and run:

```javascript
const response = await fetch('/functions/v1/generate-review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    doctor_id: 'YOUR_DOCTOR_ID_HERE',
    device_token: crypto.randomUUID(),
    rating: 5,
    language: 'english',
    selected_chips: ['Best dental implant', 'Teeth whitening']
  })
});
const data = await response.json();
console.log('Response status:', response.status);
console.log('Response data:', data);
console.log('Reviews count:', data.reviews?.length);
console.log('Quality:', data.quality);
```

### Step 3: Check Server Logs for Error

Look for one of these patterns in server console:

**Pattern A - Gemini API Error:**
```
❌ GEMINI API ERROR
{status: 401/403/429/500, error: "..."}
⚠️  USING FALLBACK (API ERROR)
```

**Pattern B - Response Parse Error:**
```
❌ INVALID RESPONSE STRUCTURE
{parts: undefined/null}
⚠️  USING FALLBACK (PARSE ERROR)
```

**Pattern C - Fallback Used (Low Gemini Output):**
```
✅ PARSED X reviews from Gemini (where X < 3)
⚠️  Only X reviews from Gemini, using emergencyDrafts
```

**Pattern D - Success (What We Want):**
```
✅ PARSED 3 reviews from Gemini (no fallback needed)
✅ All 3 reviews from Gemini
📋 FINAL OUTPUT - 3 reviews being returned:
=== REVIEW 1 ===
[full review text]
Contains high-priority keywords:
  "Best dental implant": X times
  "Teeth whitening": Y times
```

### Step 4: Send Me Exact Logs

Once you run a test, **copy-paste the EXACT console output** from the dev server. Look for:

1. Full "🔍 DIAGNOSIS START" section
2. "📤 Sending to Gemini..."  section
3. "📥 RAW GEMINI RESPONSE..." section (the actual response from Gemini)
4. "✅ PARSED X reviews" section
5. Any error messages ("❌" lines)
6. "📋 FINAL OUTPUT" section

This will tell us EXACTLY what's failing.

---

## Expected Results

### If SUCCESS (Keywords Appearing):
```
🔍 DIAGNOSIS START
Doctor ID: 550e8400-e29b-41d4-a716-446655440000
Selected Chips: ["Best dental implant", "Teeth whitening"]
High Priority Keywords: ["Best dental implant", "Teeth whitening"]

📤 Sending to Gemini prompt with keywords: ["Best dental implant", "Teeth whitening"]
Prompt length: 2847 chars

📥 RAW GEMINI RESPONSE (first 500 chars):
[{"review":"My clinic visit was excellent...Best dental implant was explained...Teeth whitening procedure..."},{"review":"..."}...]

✅ PARSED 3 reviews from Gemini (no fallback needed)

✅ All 3 reviews from Gemini (no fallback needed)

📋 FINAL OUTPUT - 3 reviews being returned:
=== REVIEW 1 ===
My clinic visit was excellent. The doctor explained the best dental implant procedure in detail. They discussed teeth whitening options as well...
---
Contains high-priority keywords:
  "Best dental implant": 2 times
  "Teeth whitening": 2 times
```

### If FAILING (Keywords Missing):
```
❌ GEMINI API ERROR
{status: 401, error: "Invalid API key..."}
⚠️  USING FALLBACK (API ERROR) - emergencyDrafts called

OR

⚠️  Only 0 reviews from Gemini, using emergencyDrafts

OR

❌ INVALID RESPONSE STRUCTURE - parts is not array
```

---

## What Each Log Means

| Log | Meaning | Next Step |
|-----|---------|-----------|
| `❌ GEMINI API ERROR {status: 401}` | API key is invalid/expired | Check GEMINI_API_KEY env var |
| `❌ GEMINI API ERROR {status: 429}` | Rate limited | Wait, retry later |
| `❌ INVALID RESPONSE STRUCTURE` | Gemini returned unexpected format | Check Gemini API version |
| `✅ PARSED 0 reviews` | JSON parse succeeded but no reviews returned | Check Gemini prompt |
| `⚠️  USING FALLBACK` | Falling back to emergencyDrafts | Check why Gemini failed |
| `📥 RAW GEMINI RESPONSE... []` | Gemini returned empty array | Keywords missing from prompt |

---

## Quick Checklist

Before running test, confirm:

- [ ] `.env.local` has GEMINI_API_KEY set
- [ ] GEMINI_API_KEY is valid (check at console.cloud.google.com)
- [ ] No rate limiting (last test was >30s ago)
- [ ] Dev server is running (`npm run dev`)
- [ ] No syntax errors in generate-review/index.ts

---

## Run Test Now

```bash
# 1. Start dev server (if not running)
npm run dev

# 2. Open browser console in another window
# Ctrl+Shift+J (or F12 → Console tab)

# 3. Paste and run the test request from Step 2 above

# 4. Watch server console logs in original terminal
# Look for 🔍, 📤, 📥, ❌, ⚠️, ✅ markers

# 5. Copy-paste EXACT output and send to me
```

Once I see the actual logs, I can identify the exact problem and fix it!
