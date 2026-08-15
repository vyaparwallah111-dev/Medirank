import { getCurrentDoctor, getAuthenticatedUser } from '@/lib/dashboard';
import { redirect } from 'next/navigation';
import { AIReviewSettingsConsolidated } from '@/components/ai-review-settings-consolidated';

export const metadata = {
  title: 'AI Review Settings',
  description: 'Configure keywords, locations, concerns, and tone for AI review generation',
};

export default async function AIReviewSettingsPage() {
  const doctor = await getCurrentDoctor();
  const { user } = await getAuthenticatedUser();

  if (!doctor?.id || !user?.id) redirect('/onboarding');
  if (doctor?.auth_user_id !== user?.id) throw new Error('Forbidden');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-3 py-8 sm:px-5 sm:py-12">
      <AIReviewSettingsConsolidated doctorId={doctor.id} />
    </div>
  );
}
