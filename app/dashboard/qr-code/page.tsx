import { getCurrentDoctor } from '@/lib/dashboard';
import { QRDownload } from '@/components/qr-download';

export const dynamic = 'force-dynamic';

export default async function QRCodePage() {
  const doctor = await getCurrentDoctor();
  // If APP_URL is omitted, the client uses the browser's current origin. This
  // prevents a stale localhost/SITE_URL value from being embedded in production QR codes.
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || '';
  return <div className="mx-auto max-w-3xl"><h1 className="text-3xl font-extrabold">Your clinic QR code</h1><p className="mt-2 text-slate-500">Print it, display it, and let happy patients do the rest.</p><QRDownload slug={doctor.slug} appOrigin={configuredOrigin} clinic={doctor.clinic_name}/></div>;
}
