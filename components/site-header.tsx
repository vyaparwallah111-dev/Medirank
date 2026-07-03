"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

const nav = [
  { label: "How it works", href: "/#how", match: "" },
  { label: "Features", href: "/#features", match: "" },
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
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex" aria-label="Main navigation">
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
          <Link href="/login" className="hidden px-4 py-2 text-sm font-semibold text-slate-700 md:block">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary !hidden !px-4 !py-2.5 text-sm md:!inline-flex">
            Get started
          </Link>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-brand md:hidden"
            aria-label="Open navigation menu"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMenuOpen(true)}
          >
            <Menu size={23} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={`fixed inset-0 z-50 md:hidden ${isMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`} aria-hidden={!isMenuOpen}>
        <button type="button" aria-label="Close navigation menu" onClick={() => setIsMenuOpen(false)} className={`absolute inset-0 bg-slate-950/35 backdrop-blur-sm transition-opacity duration-300 ${isMenuOpen ? "opacity-100" : "opacity-0"}`} />
        <aside id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Mobile navigation" className={`absolute right-0 top-0 flex h-[100dvh] w-[min(88vw,24rem)] flex-col bg-white p-5 shadow-2xl transition-transform duration-300 ease-out ${isMenuOpen ? "translate-x-0" : "translate-x-full"}`}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-5">
            <Logo />
            <button type="button" onClick={() => setIsMenuOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700" aria-label="Close navigation menu"><X size={22} aria-hidden="true" /></button>
          </div>
          <nav className="mt-7 flex flex-col gap-2" aria-label="Mobile navigation">
            {nav.map((item) => <Link key={item.label} href={item.href} onClick={() => setIsMenuOpen(false)} className="rounded-xl px-4 py-3.5 text-base font-semibold text-slate-800 transition hover:bg-blue-50 hover:text-brand">{item.label}</Link>)}
            <Link href="/login" onClick={() => setIsMenuOpen(false)} className="rounded-xl px-4 py-3.5 text-base font-semibold text-slate-800 transition hover:bg-blue-50 hover:text-brand">Admin / Dashboard Login</Link>
          </nav>
          <div className="mt-auto border-t border-slate-100 pt-5">
            <Link href="/signup" onClick={() => setIsMenuOpen(false)} className="btn-primary min-h-14 w-full text-base">Get Started Now</Link>
          </div>
        </aside>
      </div>
    </header>
  );
}
