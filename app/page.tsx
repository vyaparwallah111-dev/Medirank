import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  MessageSquareText,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Logo } from "@/components/logo";
const features = [
  [
    "AI-written, human-sounding",
    "Natural review suggestions tailored to each patient visit.",
    Sparkles,
  ],
  [
    "Built for healthcare",
    "A calm, trustworthy experience patients feel comfortable using.",
    ShieldCheck,
  ],
  [
    "Know what works",
    "Track scans, generated reviews and conversions in real time.",
    BarChart3,
  ],
] as const;
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-white pb-20 pt-16 sm:pt-24">
          <div className="absolute -right-24 top-10 h-96 w-96 rounded-full bg-orange-100/60 blur-3xl" />
          <div className="absolute -left-36 bottom-0 h-96 w-96 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="container-page relative grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-brand">
                <Sparkles size={15} />
                AI-powered patient reviews
              </div>
              <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-[-.04em] text-slate-950 sm:text-6xl">
                Turn happy visits into{" "}
                <span className="text-brand">trusted reviews.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                MediRank helps your patients share authentic Google reviews in
                under 60 seconds—with a simple scan and a little help from AI.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signup" className="btn-primary">
                  Get your clinic QR <ArrowRight size={18} />
                </Link>
                <Link href="/r/dr-mehta" className="btn-secondary">
                  Try patient experience
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
                {[
                  "No app needed",
                  "Setup in 5 minutes",
                  "Made for clinics",
                ].map((x) => (
                  <span key={x} className="flex items-center gap-1.5">
                    <Check size={16} className="text-emerald-500" />
                    {x}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-lg">
              <div className="card relative p-5 sm:p-7">
                <div className="flex items-center justify-between border-b border-slate-100 pb-5">
                  <div>
                    <p className="font-bold">Good morning, Dr. Mehta</p>
                    <p className="text-sm text-slate-500">
                      Here’s how your clinic is growing.
                    </p>
                  </div>
                  <span className="rounded-xl bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                    +18%
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 py-5">
                  <div className="rounded-2xl bg-blue-50 p-4">
                    <ScanLine className="text-brand" />
                    <p className="mt-4 text-3xl font-extrabold">1,248</p>
                    <p className="text-sm text-slate-500">Total scans</p>
                  </div>
                  <div className="rounded-2xl bg-orange-50 p-4">
                    <Star className="fill-orange text-orange" />
                    <p className="mt-4 text-3xl font-extrabold">386</p>
                    <p className="text-sm text-slate-500">Reviews posted</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-950 p-5 text-white">
                  <div className="flex justify-between">
                    <div>
                      <p className="text-sm text-slate-400">Conversion rate</p>
                      <p className="mt-1 text-3xl font-extrabold">30.9%</p>
                    </div>
                    <div className="flex h-14 items-end gap-1">
                      {[25, 40, 30, 55, 48, 70, 62, 86].map((h, i) => (
                        <i
                          key={i}
                          className="w-2 rounded-full bg-orange"
                          style={{ height: h + "%" }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-5 -left-5 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                  <Star fill="currentColor" size={20} />
                </div>
                <div>
                  <p className="font-bold">New 5-star review!</p>
                  <p className="text-xs text-slate-500">Just now · Google</p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section id="how" className="py-20">
          <div className="container-page text-center">
            <p className="font-bold uppercase tracking-widest text-orange">
              Simple by design
            </p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
              Three taps from visit to review
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-600">
              No logins, downloads, or awkward follow-ups. Just an effortless
              patient experience.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                [
                  QrCode,
                  "1",
                  "Scan",
                  "Patients scan your clinic’s unique QR code.",
                ],
                [
                  MessageSquareText,
                  "2",
                  "AI suggests",
                  "They pick visit highlights and get a natural review.",
                ],
                [
                  Star,
                  "3",
                  "Post to Google",
                  "One tap copies the review and opens Google.",
                ],
              ].map(([Icon, n, t, d]: any) => (
                <div key={n} className="card p-7 text-left">
                  <div className="flex items-center justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-brand">
                      <Icon />
                    </span>
                    <span className="text-5xl font-black text-slate-100">
                      {n}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-bold">{t}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="features" className="bg-slate-950 py-20 text-white">
          <div className="container-page">
            <div className="max-w-xl">
              <p className="font-bold uppercase tracking-widest text-orange">
                Made for better care
              </p>
              <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
                Grow your reputation while you focus on patients.
              </h2>
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {features.map(([t, d, Icon]) => (
                <div key={t}>
                  <Icon size={28} className="text-orange" />
                  <h3 className="mt-5 text-xl font-bold">{t}</h3>
                  <p className="mt-2 leading-7 text-slate-400">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="pricing" className="py-20">
          <div className="container-page text-center">
            <h2 className="text-3xl font-extrabold sm:text-4xl">
              Start collecting better reviews today
            </h2>
            <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-3">
              {[
                ["Free", "₹0", "50 scans / month"],
                ["Pro", "₹999", "Unlimited scans"],
                ["Premium", "₹2,499", "Multi-location + team"],
              ].map((p, i) => (
                <div
                  key={p[0]}
                  className={`card p-7 text-left ${i === 1 ? "border-brand ring-2 ring-blue-100" : ""}`}
                >
                  {i === 1 && (
                    <span className="rounded-full bg-orange px-3 py-1 text-xs font-bold text-white">
                      MOST POPULAR
                    </span>
                  )}
                  <h3 className="mt-4 text-xl font-bold">{p[0]}</h3>
                  <p className="mt-3 text-4xl font-black">
                    {p[1]}
                    <span className="text-sm font-normal text-slate-500">
                      {" "}
                      /mo
                    </span>
                  </p>
                  <p className="mt-4 text-slate-600">{p[2]}</p>
                  <Link
                    href="/signup"
                    className={`mt-7 w-full ${i === 1 ? "btn-primary" : "btn-secondary"}`}
                  >
                    Choose {p[0]}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t bg-white py-8">
        <div className="container-page flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo />
          <p className="text-sm text-slate-500">
            A product by <b className="text-slate-700">Vyapar Wallah</b> · ©
            2026
          </p>
        </div>
      </footer>
    </>
  );
}
