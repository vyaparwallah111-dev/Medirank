'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';

export type CreateQrState = { error: string | null };

export async function createQrCodeRecord(_state: CreateQrState, _formData: FormData): Promise<CreateQrState> {
  const doctor = await getCurrentDoctor();
  const { supabase, user } = await getAuthenticatedUser();
  if (doctor.auth_user_id !== user.id) throw new Error('Forbidden');

  const subscriptionTier = doctor.subscription_tier?.trim().toLowerCase() || 'starter';

  const { count, error: countError } = await supabase
    .from('qr_codes')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctor.id);
  if (countError) {
    console.error('Unable to check QR allowance:', countError.code, countError.message);
    return { error: 'QR service is not ready. Please refresh and try again.' };
  }

  if (subscriptionTier === 'starter' && (count ?? 0) >= 1) {
    return { error: 'Starter plan limit reached (Max 1 QR code). Please upgrade your plan.' };
  }

  const origin = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const targetUrl = `${origin}/r/${encodeURIComponent(doctor.slug)}`;
  const { error } = await supabase.from('qr_codes').insert({
    doctor_id: doctor.id,
    storage_path: `generated/${doctor.id}/review-qr`,
    target_url: targetUrl,
  });
  if (error) {
    console.error('Unable to create QR code:', error.code, error.message);
    return { error: 'Unable to create your QR code. Please try again.' };
  }
  revalidatePath('/dashboard/qr-code');
  return { error: null };
}
