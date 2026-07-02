'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';

export async function createQrCodeRecord() {
  const doctor = await getCurrentDoctor();
  const { supabase, user } = await getAuthenticatedUser();
  if (doctor.auth_user_id !== user.id) throw new Error('Forbidden');

  // subscription_tier is the canonical plan field. Repair legacy/null records
  // before QR insertion so database triggers never receive a null tier.
  const subscriptionTier = doctor.subscription_tier?.trim().toLowerCase() || 'starter';
  if (!doctor.subscription_tier) {
    const { error: tierError } = await supabase
      .from('doctors')
      .update({ subscription_tier: 'starter' })
      .eq('id', doctor.id)
      .eq('auth_user_id', user.id);
    if (tierError) throw new Error('Unable to initialize your Starter plan.');
  }

  const { count, error: countError } = await supabase
    .from('qr_codes')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctor.id);
  if (countError) throw new Error('Unable to check your QR code allowance.');

  if (subscriptionTier === 'starter' && (count ?? 0) >= 1) throw new Error('Starter plan limit reached (Max 1 QR code). Please upgrade your plan.');
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
