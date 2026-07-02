import Link from 'next/link';
import { LockKeyhole, QrCode } from 'lucide-react';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';
import { QRDownload } from '@/components/qr-download';
import { createQrCodeRecord } from './actions';

export const dynamic = 'force-dynamic';

export default async function QRCodePage() {
  const doctor = await getCurrentDoctor();
  const { supabase } = await getAuthenticatedUser();
  const { count } = await supabase.from('qr_codes').select('*', { count: 'exact', head: true }).eq('doctor_id', doctor.id);
  const qrCount = count ?? 0;
  const subscriptionTier = doctor.subscription_tier?.trim().toLowerCase() || 'starter';
  const isStarter = subscriptionTier === 'starter';
  const starterLimitReached = isStarter && qrCount >= 1;
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || '';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-extrabold">Your clinic QR code</h1>
      <p className="mt-2 text-slate-500">Print it, display it, and let happy patients do the rest.</p>
      {starterLimitReached && (
        <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <LockKeyhole className="mt-0.5 shrink-0" size={19} />
          <div>Starter plan limit reached. <Link href="/pricing" className="underline underline-offset-2">Upgrade to Growth.</Link></div>
        </div>
      )}
      {qrCount > 0 ? (
        <>
          <QRDownload slug={doctor.slug} appOrigin={configuredOrigin} clinic={doctor.clinic_name} />
          {isStarter && <button type="button" disabled className="btn-secondary mt-4 min-h-12 w-full cursor-not-allowed opacity-50"><LockKeyhole size={18} /> Create New QR</button>}
        </>
      ) : (
        <div className="card mt-8 p-7 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-brand"><QrCode size={32} /></span>
          <h2 className="mt-5 text-xl font-bold">Create your patient review QR</h2>
          <p className="mt-2 text-sm text-slate-500">Your Starter plan includes one reusable clinic QR code.</p>
          <form action={createQrCodeRecord}><button className="btn-primary mt-6 min-h-12 w-full">Create New QR</button></form>
        </div>
      )}
    </div>
  );
}
