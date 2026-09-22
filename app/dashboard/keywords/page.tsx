import { DashboardKeywordsManager } from '@/components/dashboard-keywords-manager';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';
import { redirect } from 'next/navigation';

const defaults: Record<string, { keyword: string; category: string }[]> = {
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
  dermatologist: [
    { keyword: 'Clear diagnosis', category: 'treatment' },
    { keyword: 'Professional care', category: 'behavior' },
    { keyword: 'Clean and hygienic clinic', category: 'cleanliness' },
    { keyword: 'Helpful skincare advice', category: 'treatment' },
  ],
  default: [
    { keyword: 'Advanced treatment', category: 'treatment' },
    { keyword: 'Friendly and caring doctor', category: 'behavior' },
    { keyword: 'Clean and hygienic clinic', category: 'cleanliness' },
    { keyword: 'Explained treatment clearly', category: 'behavior' },
  ],
};

export default async function Keywords() {
  const doctor = await getCurrentDoctor();
  const { supabase, user } = await getAuthenticatedUser();
  if (!doctor?.id || !user?.id) redirect('/onboarding');
  if (doctor?.auth_user_id !== user?.id) throw new Error('Forbidden');
  const isCoaching = doctor.business_type === 'coaching';

  let { data: items, error } = await supabase.from('doctor_keywords').select('id,keyword,category,is_active').eq('doctor_id', doctor.id).order('created_at');
  if (error) throw new Error(error.message);
  if (!items?.length) {
    let seed = defaults.default;
    if (isCoaching) {
      seed = defaults.coaching;
    } else {
      const specialization = (doctor.specialization || '').toLowerCase();
      const key = Object.keys(defaults).find((k) => specialization.includes(k));
      seed = defaults[key || 'default'];
    }
    const result = await supabase.from('doctor_keywords').insert(seed.map((x) => ({ ...x, doctor_id: doctor.id, is_active: true }))).select('id,keyword,category,is_active');
    if (result.error) throw new Error(result.error.message);
    items = result.data;
  }

  return (
    <div className="mx-auto max-w-4xl px-1 sm:px-0">
      <h1 className="text-2xl font-extrabold sm:text-3xl">
        {isCoaching ? 'Coaching & Review Keywords' : 'Review keywords'}
      </h1>
      <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">
        {isCoaching
          ? 'Manage the subjects, teaching strengths, facilities (e.g. NEET prep, Islamic environment, doubt sessions), and highlights students can pick.'
          : 'Manage the treatment and care highlights patients can choose.'}
      </p>
      <DashboardKeywordsManager initialItems={items ?? []} businessType={doctor.business_type || 'doctor'} />
    </div>
  );
}

