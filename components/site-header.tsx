"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";

const nav = [
  { label: "How it works", href: "/#how", match: "" },
  { label: "Features", href: "/#features", match: "" },
  { label: "Pricing", href: "/pricing", match: "/pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="container-page flex items-center justify-between py-4">
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
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden px-4 py-2 text-sm font-semibold text-slate-700 sm:block">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary !px-4 !py-2.5 text-sm">
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
