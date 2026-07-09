import { redirect } from 'next/navigation'; import { DashboardShell } from '@/components/dashboard-shell'; import { getCurrentDoctor } from '@/lib/dashboard';
export default async function Layout({children}:{children:React.ReactNode}){const doctor=await getCurrentDoctor();if(!doctor?.id)redirect('/onboarding');return <DashboardShell doctor={doctor}>{children}</DashboardShell>}
