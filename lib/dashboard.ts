import 'server-only';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type Doctor = {
  id: string; auth_user_id: string; doctor_name: string; clinic_name: string;
  specialization: string | null; slug: string; gmb_review_link: string | null;
  city: string | null; phone: string | null; logo_url: string | null;
  plan: string | null;
  is_active: boolean;
  subscription_tier: string | null;
  theme_config: { primary: string; accent: string; background: string } | null;
  knowledge_base: { area_name: string; city_name: string; top_services: string[] } | null;
};

export async function getAuthenticatedUser() {
  const supabase = createClient();
  if (!supabase) redirect('/login');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function getCurrentDoctor(): Promise<Doctor> {
  noStore();
  const { supabase, user } = await getAuthenticatedUser();
  const baseFields = 'id,auth_user_id,doctor_name,clinic_name,specialization,slug,gmb_review_link,city,phone,logo_url,plan,is_active';
  const currentFields = `${baseFields},subscription_tier,theme_config,knowledge_base`;
  let { data, error } = await supabase.from('doctors').select(currentFields).eq('auth_user_id', user.id).maybeSingle();

  // Keep local/legacy databases usable while newer additive migrations are
  // being applied. Supabase reports a missing selected column as 42703.
  if (error?.code === '42703') {
    const legacy = await supabase.from('doctors').select(baseFields).eq('auth_user_id', user.id).maybeSingle();
    data = legacy.data ? { ...legacy.data, subscription_tier: null, theme_config: null, knowledge_base: null } : null;
    error = legacy.error;
  }
  if (error) {
    console.error('Unable to load clinic profile:', error.code, error.message);
    throw new Error('Unable to load your clinic profile.');
  }
  if (!data) redirect('/onboarding');
  if (data.is_active === false) redirect('/login?blocked=1');
  return data as Doctor;
}

export function displayDoctorName(name: string | null | undefined) {
  return (name || '').replace(/^dr\.?\s*/i, '').trim();
}
