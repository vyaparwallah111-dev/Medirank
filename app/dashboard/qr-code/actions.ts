'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';

export async function createQrCodeRecord() {
  const doctor = await getCurrentDoctor();
  const { supabase, user } = await getAuthenticatedUser();
  if (doctor.auth_user_id !== user.id) throw new Error('Forbidden');

  const { count, error: countError } = await supabase
    .from('qr_codes')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctor.id);
  if (countError) throw new Error('Unable to check your QR code allowance.');

  const isStarter = doctor.plan === 'starter' || doctor.plan === 'free' || !doctor.plan;
  if (isStarter && (count ?? 0) >= 1) throw new Error('Starter plan tier limit reached (Max 1 QR code). Please upgrade your plan.');
  if ((count ?? 0) >= 1) return;

  const origin = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const targetUrl = `${origin}/r/${encodeURIComponent(doctor.slug)}`;
  const { error } = await supabase.from('qr_codes').insert({
    doctor_id: doctor.id,
    storage_path: `generated/${doctor.id}/review-qr`,
    target_url: targetUrl,
  });
  if (error) throw new Error('Unable to create your QR code.');
  revalidatePath('/dashboard/qr-code');
}
