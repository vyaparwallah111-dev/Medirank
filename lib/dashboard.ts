import 'server-only';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type Doctor = {
  id: string; auth_user_id: string; doctor_name: string; clinic_name: string;
  specialization: string | null; slug: string; gmb_review_link: string | null;
  city: string | null; phone: string | null; logo_url: string | null;
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
  const { data, error } = await supabase.from('doctors').select('id,auth_user_id,doctor_name,clinic_name,specialization,slug,gmb_review_link,city,phone,logo_url,theme_config,knowledge_base').eq('auth_user_id', user.id).maybeSingle();
  if (error) throw new Error('Unable to load your clinic profile.');
  if (!data) redirect('/onboarding');
  return data as Doctor;
}

export function displayDoctorName(name: string) {
  return name.replace(/^dr\.?\s*/i, '').trim();
}
