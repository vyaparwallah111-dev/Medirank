'use server';

import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/lib/dashboard';
import { createAdminClient } from '@/lib/supabase/admin';

const keywordSets: Record<string, { keyword: string; category: string }[]> = {
  dentist: [
    { keyword: 'Painless root canal', category: 'treatment' },
    { keyword: 'Best dental implant', category: 'treatment' },
    { keyword: 'Teeth whitening', category: 'treatment' },
    { keyword: 'Painless tooth extraction', category: 'treatment' },
    { keyword: 'Advanced clinic treatment', category: 'treatment' },
    { keyword: 'Friendly and caring doctor', category: 'behavior' },
    { keyword: 'Explained treatment clearly', category: 'behavior' },
    { keyword: 'Clean and hygienic clinic', category: 'cleanliness' },
  ],
  coaching: [
    { keyword: 'Concepts explained simply & clearly', category: 'teaching' },
    { keyword: 'Daily doubt clearing sessions', category: 'teaching' },
    { keyword: 'Best study material & test series', category: 'teaching' },
    { keyword: 'Helpful and motivating teachers', category: 'faculty' },
    { keyword: 'Personal attention to every student', category: 'faculty' },
    { keyword: 'Disciplined & focused environment', category: 'environment' },
    { keyword: 'High score & rank improvement', category: 'result' },
    { keyword: 'Regular mock tests & paper analysis', category: 'result' },
  ],
  default: [
    { keyword: 'Advanced treatment', category: 'treatment' },
    { keyword: 'Friendly and caring doctor', category: 'behavior' },
    { keyword: 'Explained treatment clearly', category: 'behavior' },
    { keyword: 'Clean and hygienic clinic', category: 'cleanliness' },
    { keyword: 'On-time appointment', category: 'clinic' },
  ],
};

export async function completeOnboarding(formData: FormData) {
  let shouldRedirect = false;
  try {
    const { supabase, user } = await getAuthenticatedUser();
    const db = createAdminClient() || supabase;
    const { data: existing } = await db.from('doctors').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (existing) {
      shouldRedirect = true;
    } else {
      const businessType = String(formData.get('business_type') || 'doctor').trim().toLowerCase() === 'coaching' ? 'coaching' : 'doctor';
      const doctorName = String(formData.get('doctor_name') || '').trim();
      const specialization = String(formData.get('specialization') || '').trim();
      const clinicName = String(formData.get('clinic_name') || '').trim();
      const city = String(formData.get('city') || '').trim();
      const gmbReviewLink = String(formData.get('gmb_review_link') || '').trim() || null;
      const businessCategory = String(formData.get('business_category') || specialization || '').trim() || null;

      if (!doctorName || !clinicName) {
        return { error: businessType === 'coaching' ? 'Please enter institute name and educator name.' : 'Please enter doctor name and clinic name.' };
      }

      const nameToSlug = businessType === 'coaching' ? clinicName : doctorName;
      const base = nameToSlug.replace(/^dr\.?\s*/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clinic';
      const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
      const now = new Date();
      const trialExpiry = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

      const insertData: Record<string, unknown> = {
        auth_user_id: user.id,
        doctor_name: doctorName,
        clinic_name: clinicName,
        specialization: specialization || null,
        city: city || null,
        gmb_review_link: gmbReviewLink,
        slug,
        business_type: businessType,
        business_category: businessCategory,
        plan: 'trial',
        subscription_tier: 'growth',
        plan_started_at: now.toISOString(),
        plan_expires_at: trialExpiry.toISOString(),
      };

      let { data: doctor, error } = await db.from('doctors').insert(insertData).select('id').maybeSingle();

      // If new columns (like business_type or plan_started_at) are not in DB yet (Postgres error 42703), fallback to base schema
      if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('check constraint'))) {
        const fallbackData = {
          auth_user_id: user.id,
          doctor_name: doctorName,
          clinic_name: clinicName,
          specialization: specialization || null,
          city: city || null,
          gmb_review_link: gmbReviewLink,
          slug,
          plan: 'trial',
        };
        const retry = await db.from('doctors').insert(fallbackData).select('id').maybeSingle();
        doctor = retry.data;
        error = retry.error;
      }

      if (error || !doctor) {
        console.error('Failed to create clinic/coaching profile:', error);
        return { error: error?.message || 'Unable to create profile.' };
      }

      let seed = keywordSets.default;
      if (businessType === 'coaching') {
        seed = keywordSets.coaching;
      } else {
        const key = Object.keys(keywordSets).find((k) => specialization.toLowerCase().includes(k));
        seed = keywordSets[key || 'default'];
      }

      try {
        await db.from('doctor_keywords').insert(seed.map((x) => ({ ...x, doctor_id: doctor.id })));
      } catch (keywordErr) {
        console.warn('Keyword seed note:', keywordErr);
      }
      shouldRedirect = true;
    }
  } catch (err: any) {
    if (err?.message?.includes('NEXT_REDIRECT') || err?.digest?.includes('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('completeOnboarding unexpected error:', err);
    return { error: err?.message || 'Unable to complete setup.' };
  }

  if (shouldRedirect) {
    redirect('/dashboard');
  }
}

