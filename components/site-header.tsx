"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

const nav = [
  { label: "How it works", href: "/#how", match: "" },
  { label: "Features", href: "/#features", match: "" },
  { label: "For Institutes & Clinics", href: "/#categories", match: "" },
  { label: "Pricing", href: "/pricing", match: "/pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => setIsMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm font-medium md:flex" aria-label="Main navigation">
          {nav.map((item) => {
            const active = Boolean(item.match && pathname.startsWith(item.match));
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-2 transition-colors after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:rounded-full after:transition-transform ${
                  active
                    ? "font-bold text-brand after:scale-x-100 after:bg-brand"
                    : "text-slate-600 after:scale-x-0 after:bg-blue-300 hover:text-brand hover:after:scale-x-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {/* Quick Mobile Login Button */}
          <Link
            href="/login"
            className="flex items-center gap-1 rounded-xl border border-[#0A4C95]/20 bg-blue-50/70 px-3 py-2 text-xs font-bold text-[#0A4C95] transition hover:bg-blue-100 md:hidden"
          >
            <User size={14} /> Log in
          </Link>
          <Link href="/login" className="hidden px-4 py-2 text-sm font-semibold text-slate-700 hover:text-brand md:block">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary !hidden !px-4 !py-2.5 text-sm md:!inline-flex">
            Get started <ArrowRight size={15} />
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-brand md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={21} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={`fixed inset-0 z-50 md:hidden ${isMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!isMenuOpen}>
        <button type="button" aria-label="Close navigation menu" onClick={() => setIsMenuOpen(false)} className={`absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-300 ${isMenuOpen ? "opacity-100" : "opacity-0"}`} />
        <aside id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className={`absolute right-0 top-0 flex h-[100dvh] w-[min(88vw,24rem)] flex-col bg-white p-5 shadow-2xl transition-transform duration-300 ease-out ${isMenuOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <Logo />
            <button type="button" onClick={() => setIsMenuOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-label="Close navigation menu"><X size={20} aria-hidden="true" /></button>
          </div>
          <nav className="mt-6 flex flex-col gap-1.5" aria-label="Mobile navigation">
            {nav.map((item) => (
              <Link key={item.label} href={item.href} onClick={() => setIsMenuOpen(false)} className="rounded-xl px-4 py-3 text-base font-semibold text-slate-800 transition hover:bg-blue-50 hover:text-brand">
                {item.label}
              </Link>
            ))}
            <div className="my-2 border-t border-slate-100" />
            <Link href="/login" onClick={() => setIsMenuOpen(false)} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-base font-bold text-[#0A4C95] transition hover:bg-blue-50">
              <span>Admin / Dashboard Login</span>
              <User size={18} />
            </Link>
          </nav>
          <div className="mt-auto border-t border-slate-100 pt-4">
            <Link href="/signup" onClick={() => setIsMenuOpen(false)} className="btn-primary min-h-12 w-full text-base flex items-center justify-center gap-2">
              Get Started Free <ArrowRight size={18} />
            </Link>
          </div>
        </aside>
      </div>
    </header>
  );
}

