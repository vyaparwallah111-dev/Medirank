"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HelpCircle, KeyRound, LayoutDashboard, LogOut, QrCode, Settings, UserRound } from "lucide-react";
import { Logo } from "./logo";
import { createClient } from "@/lib/supabase/client";

const nav = [
  [LayoutDashboard, "Overview", "/dashboard"],
  [QrCode, "My QR Code", "/dashboard/qr-code"],
  [KeyRound, "Review keywords", "/dashboard/keywords"],
  [Settings, "Clinic profile", "/dashboard/profile"],
] as const;

export function DashboardShell({ children, doctor }: {
  children: React.ReactNode;
  doctor: { doctor_name: string; clinic_name: string; plan: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isStarter = doctor.plan === "starter" || doctor.plan === "free" || !doctor.plan;

  async function logout() {
    await createClient()?.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-mist">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-white p-5 lg:flex">
        <Logo />
        <nav className="mt-10 space-y-1">
          {nav.map(([Icon, label, href]) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${pathname === href ? "bg-blue-50 text-brand" : "text-slate-500 hover:bg-slate-50"}`}>
              <Icon size={19} />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t pt-4">
          {isStarter ? (
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-slate-600">
              <span className="flex items-center gap-3 text-sm font-semibold"><HelpCircle size={19} />Help & support</span>
              <a href="mailto:support@vyaparwallah.com" className="mt-2 block text-xs font-bold text-slate-500 hover:text-brand">
                Support: Email Only (support@vyaparwallah.com)
              </a>
            </div>
          ) : (
            <a href="mailto:support@vyaparwallah.com" className="flex w-full items-center gap-3 px-3 py-3 text-sm font-semibold text-slate-500"><HelpCircle size={19} />Help & support</a>
          )}
          <button onClick={logout} className="flex w-full items-center gap-3 px-3 py-3 text-sm font-semibold text-slate-500"><LogOut size={19} />Log out</button>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-white/90 px-5 backdrop-blur sm:px-8">
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden lg:block"><p className="text-sm text-slate-500">{doctor.clinic_name}</p></div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right sm:block"><b className="block text-sm">{doctor.doctor_name}</b><small className="text-slate-500">Clinic owner</small></span>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 text-brand"><UserRound size={20} /></span>
          </div>
        </header>
        <main className="p-5 sm:p-8">{children}</main>
      </div>
    </div>
  );
}
