import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  QrCode,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "MediRank Pricing | Doctor Google Review Software for Indian Clinics",
  description:
    "Simple MediRank pricing for Indian clinics. Grow clinic patient footfall with doctor Google review software, AI reviews, WhatsApp automation and healthcare growth marketing.",
  keywords: [
    "medical marketing India",
    "grow clinic patient footfall",
    "doctor Google review software",
    "healthcare growth marketing",
    "best CRM for clinics Patna Bihar",
  ],
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Simple, Transparent Pricing for Indian Clinics | MediRank",
    description:
      "AI-powered Google review and clinic growth plans built for doctors across India.",
    type: "website",
    url: "/pricing",
  },
};

const plans = [
  {
    name: "Starter",
    tagline: "For new clinics starting their digital journey.",
    price: "₹0",
    features: [
      "Max 10 Google Review QR scans",
      "Dynamic Hinglish review generator",
      "Basic analytics dashboard",
      "Standard 5-star validation shield",
      "Mobile-responsive patient interface",
    ],
    cta: "Get Started Free",
    href: "/signup",
  },
  {
    name: "Growth",
    tagline: "Best for growing clinics looking to double patient footfall.",
    price: "₹999",
    popular: true,
    features: [
      "Unlimited Google Review QR scans",
      "Custom clinic-branded smart landing page",
      "Advanced English & Hinglish AI review generator",
      "WhatsApp marketing automated messaging integration",
      "Priority patient feedback routing",
      "24/7 premium email support",
    ],
    cta: "Upgrade to Growth",
    href: "/payment?plan=growth",
  },
  {
    name: "Clinic / Premium",
    tagline:
      "For large clinics, multi-specialty setups and hospitals wanting full automation.",
    price: "₹1,999",
    features: [
      "Everything in Growth",
      "Multi-doctor staff accounts and profiles",
      "Dedicated lead manager CRM page",
      "Customized automated WhatsApp patient reminders",
      "Cinematic doctor avatar post templates",
      "API access for hospital management software",
      "Dedicated account manager with Bihar and India support",
    ],
    cta: "Contact Sales / Buy Premium",
    href: "/payment?plan=premium",
  },
] as const;

const steps = [
  {
    title: "Patient Scans QR",
    description:
      "The patient scans your unique smart desk or chamber QR code after treatment—no app or login needed.",
    icon: QrCode,
  },
  {
    title: "AI Generates Review",
    description:
      "MediRank AI understands the treatment—from dentistry to dermatology—and instantly suggests personalized English or Hinglish reviews.",
    icon: Sparkles,
  },
  {
    title: "Automatic Growth",
    description:
      "A one-click Google Business Profile redirect grows authentic reviews and helps your clinic compete for Google's Top 3 Map Pack.",
    icon: TrendingUp,
  },
] as const;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-slate-200/70 bg-white pb-20 pt-16 sm:pb-24 sm:pt-24">
          <div className="absolute -left-32 top-16 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-100/60 blur-3xl" />
          <div className="container-page relative text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800">
              <BadgeCheck aria-hidden="true" size={17} />
              Built for doctors and clinics across India
            </div>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold leading-tight tracking-[-0.04em] text-slate-950 sm:text-6xl">
              Simple, Transparent Pricing for Indian Clinics
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Boost your clinic&apos;s Google reviews, patient footfall, and online
              trust with AI-powered automation.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-medium text-slate-600">
              {["No hidden fees", "Setup in minutes", "Cancel anytime"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="text-emerald-600" size={18} />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="plans-heading" className="py-16 sm:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-brand">
                Plans that grow with you
              </p>
              <h2 id="plans-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Choose the right plan for your clinic
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`relative flex flex-col rounded-3xl border bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:scale-105 sm:p-8 ${
                    "popular" in plan
                      ? "border-blue-600 ring-4 ring-blue-100 lg:-mt-4 lg:mb-4"
                      : "border-slate-200"
                  }`}
                >
                  {"popular" in plan && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-blue-700 to-blue-500 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg">
                      <Star aria-hidden="true" className="mr-1 inline fill-current" size={14} />
                      Most Popular · Best Value
                    </div>
                  )}
                  <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-950">
                    {plan.name}
                  </h2>
                  <p className="mt-3 min-h-12 text-sm leading-6 text-slate-600">{plan.tagline}</p>
                  <div className="mt-7 flex items-end gap-2 border-b border-slate-100 pb-7">
                    <span className="text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
                      {plan.price}
                    </span>
                    <span className="pb-1 text-sm font-semibold text-slate-500">/ Month</span>
                  </div>
                  <ul className="mt-7 flex-1 space-y-4" aria-label={`${plan.name} plan features`}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-3 text-sm leading-6 text-slate-700">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                          <Check aria-hidden="true" size={13} strokeWidth={3} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.href}
                    className={`mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-center font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${
                      "popular" in plan
                        ? "bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow-lg shadow-blue-900/20 hover:scale-[1.02] hover:from-blue-800 hover:to-blue-700"
                        : "border border-slate-300 bg-white text-slate-800 hover:scale-[1.02] hover:border-blue-400 hover:text-blue-700"
                    }`}
                  >
                    {plan.cta} <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="border-y border-slate-200 bg-white py-16 sm:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-brand">How it works</p>
              <h2 id="how-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                From patient visit to clinic growth in three steps
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                Make giving useful, authentic feedback effortless for every happy patient.
              </p>
            </div>
            <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="relative rounded-3xl border border-slate-200 bg-slate-50 p-7 transition-all duration-300 hover:scale-105 hover:border-blue-200 hover:bg-white hover:shadow-soft">
                    <span className="absolute right-6 top-6 text-5xl font-black text-slate-200" aria-hidden="true">
                      0{index + 1}
                    </span>
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-700 to-cyan-500 text-white shadow-lg shadow-blue-900/15">
                      <Icon aria-hidden="true" size={26} />
                    </span>
                    <h3 className="mt-6 text-xl font-extrabold text-slate-950">{step.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{step.description}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="bg-slate-950 py-14 text-white sm:py-18">
          <div className="container-page flex flex-col items-center justify-between gap-7 text-center md:flex-row md:text-left">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">Ready to grow your clinic&apos;s online trust?</h2>
              <p className="mt-2 text-slate-300">Start free today. No credit card required.</p>
            </div>
            <Link href="/signup" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-blue-800 transition-all hover:scale-105 hover:bg-blue-50 sm:w-auto">
              Create your free account <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
