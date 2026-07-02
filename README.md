# MediRank By Vyapar Wallah

Responsive multi-tenant review collection website for doctors and clinics, built with Next.js 14, Supabase, Tailwind CSS, and Google Gemini.

## Local setup

1. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server/admin use only)
   - `NEXT_PUBLIC_SITE_URL`
2. Run the SQL files in `supabase/migrations` in numeric order in the Supabase SQL editor.
3. Create public Storage buckets named `qr-codes` and `clinic-logos` and add policies appropriate to your project.
4. Deploy the Edge Functions with `supabase functions deploy generate-review` and `supabase functions deploy mark-scan`.
5. Add its secret with `supabase secrets set GEMINI_API_KEY=your_key`.
6. Run `npm install` and `npm run dev`.

Without Supabase environment variables, the interface runs in visual demo mode so every route can be reviewed locally.

## Important routes

- `/` marketing site
- `/login`, `/signup`, `/onboarding` authentication and clinic setup
- `/r/[slug]` public patient review flow
- `/dashboard` doctor-only analytics and tools
- `/admin` platform overview (add a matching row in `admins` for each super admin)

## Tenant isolation

The migration enables RLS on every tenant table. Doctor access is derived from `auth.uid()` through `doctors.auth_user_id`; dashboard code must never accept a doctor ID from the URL. Public access is limited to active doctor profile data and scan insertion. Cross-tenant access is available only through `is_admin()`.

Before production, add an explicit server-side admin role check to `/admin`, configure Storage RLS, and run two-account isolation tests against the deployed Supabase project.

## Verification

`npm run build` passes with all application routes compiled successfully.
