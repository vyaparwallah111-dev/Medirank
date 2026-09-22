import { redirect } from 'next/navigation';
import { Building2, Check } from 'lucide-react';
import { Logo } from '@/components/logo';
import { getAuthenticatedUser } from '@/lib/dashboard';
import { createAdminClient } from '@/lib/supabase/admin';
import { OnboardingForm } from './onboarding-form';

export default async function Onboarding() {
  const { supabase, user } = await getAuthenticatedUser();
  const db = createAdminClient() || supabase;
  const { data: existing } = await db.from('doctors').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (existing?.id) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-white">
      <header className="border-b py-4">
        <div className="container-page">
          <Logo />
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-5 py-12">
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-2 font-bold text-brand">
            <Check className="rounded-full bg-brand p-1 text-white" size={20} />
            Account
          </span>
          <i className="h-px flex-1 bg-blue-200" />
          <span className="flex items-center gap-2 font-bold">
            <b className="grid h-5 w-5 place-items-center rounded-full bg-brand text-xs text-white">2</b>
            Clinic details
          </span>
          <i className="h-px flex-1 bg-slate-200" />
          <span className="text-slate-400">Your QR</span>
        </div>
        <div className="mt-10">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-brand">
            <Building2 />
          </span>
          <h1 className="mt-5 text-3xl font-extrabold">Tell us about your organization</h1>
          <p className="mt-2 text-slate-600">
            Signed in as {user.email}. We’ll personalise the Google review experience with these details.
          </p>
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
