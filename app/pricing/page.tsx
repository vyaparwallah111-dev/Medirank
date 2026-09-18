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
    id: "1-month",
    name: "1 Month Plan",
    tagline: "Ideal for trying out AI review generation & smart QR desk standee.",
    price: "₹699",
    originalPrice: "₹999",
    period: "/ Month",
    savings: null,
    trialBadge: "3-Day Free Trial",
    features: [
      "Full 3-Day Free Trial (No Card Needed)",
      "Unlimited AI Google Review QR scans",
      "English & Hinglish AI review generator",
      "Smart 5-star validation shield",
      "Clinic-branded reception QR standee design",
      "WhatsApp review recovery sharing",
      "Live patient analytics dashboard",
      "Standard email & chat support",
    ],
    cta: "Start 3-Day Free Trial",
    href: "/signup",
    popular: false,
  },
  {
    id: "3-month",
    name: "3 Months (Quarterly)",
    tagline: "Best for growing clinics looking to double authentic Google reviews.",
    price: "₹1,799",
    originalPrice: "₹2,499",
    period: "/ 3 Months (₹599/mo)",
    savings: "Save 15%",
    trialBadge: "3-Day Free Trial Included",
    popular: true,
    features: [
      "Everything in 1 Month Plan",
      "Full 3-Day Free Trial Included",
      "Priority Google Map Pack Top 3 SEO strategy",
      "Multi-doctor & clinic staff feedback support",
      "Custom clinic-branded patient landing page",
      "Automated WhatsApp review reminders",
      "Advanced conversion & keyword analytics",
      "Priority WhatsApp & phone support",
    ],
    cta: "Start Free Trial / Upgrade",
    href: "/payment?plan=3-month",
  },
  {
    id: "6-month",
    name: "6 Months (Half-Yearly)",
    tagline: "For busy clinics wanting long-term review dominance in their city.",
    price: "₹3,299",
    originalPrice: "₹4,499",
    period: "/ 6 Months (₹549/mo)",
    savings: "Save 25%",
    trialBadge: "Best ROI",
    features: [
      "Everything in 3 Months Plan",
      "Full 3-Day Free Trial Included",
      "Dedicated account manager for clinic growth",
      "Customized patient treatment keywords setup",
      "Negative review alert & resolution shield",
      "High-resolution physical acrylic standee print file",
      "Quarterly Google Business Profile audit",
      "24/7 VIP priority support",
    ],
    cta: "Start Free Trial / Upgrade",
    href: "/payment?plan=6-month",
  },
  {
    id: "1-year",
    name: "1 Year (Annual)",
    tagline: "Complete 365-day autopilot growth for established hospitals & clinics.",
    price: "₹5,999",
    originalPrice: "₹8,999",
    period: "/ Year (₹499/mo)",
    savings: "Save 35%",
    trialBadge: "Maximum Savings",
    features: [
      "Everything in 6 Months Plan",
      "Full 3-Day Free Trial Included",
      "Multi-branch clinic & hospital profile setup",
      "Annual clinic SEO & reputation management",
      "Automated WhatsApp CRM & feedback sync",
      "Custom API integration assistance",
      "Full team onboarding & reception training",
      "Dedicated Senior Growth Partner",
    ],
    cta: "Start Free Trial / Upgrade",
    href: "/payment?plan=1-year",
  },
] as const;

const steps = [
  {
    title: "Start 3-Day Free Trial",
    description:
      "Sign up in 30 seconds. Get your clinic's smart QR code instantly with zero commitment and no credit card required.",
    icon: Sparkles,
  },
  {
    title: "Patient Scans & Reviews",
    description:
      "Patients scan your chamber or reception desk QR code. MediRank AI generates 3 authentic, natural English or Hinglish reviews in seconds.",
    icon: QrCode,
  },
  {
    title: "1-Click Google Maps Post",
    description:
      "Happy patients post to your Google Business Profile with one tap, boosting your clinic into Google's Top 3 Local Map Pack.",
    icon: TrendingUp,
  },
] as const;

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-slate-200/70 bg-white pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div className="absolute -left-32 top-16 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" />
          <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-cyan-100/60 blur-3xl" />
          <div className="container-page relative text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#0A4C95]/20 bg-blue-50 px-4 py-2 text-sm font-extrabold text-[#0A4C95]">
              <BadgeCheck aria-hidden="true" size={18} className="text-[#F37021]" />
              🎁 3-Day Full-Access Free Trial for All New Signups • No Card Needed
            </div>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold leading-tight tracking-[-0.04em] text-slate-950 sm:text-6xl">
              Transparent, High-ROI Plans for Indian Doctors & Clinics
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Turn happy patients into authentic 5-star Google reviews. Boost your clinic&apos;s patient footfall and local trust with AI automation.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-semibold text-slate-700">
              {["3-Day Full-Access Free Trial", "Instant QR Code Activation", "Cancel or upgrade anytime", "No hidden charges"].map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="text-emerald-600" size={18} strokeWidth={3} />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="plans-heading" className="py-16 sm:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#F37021]">
                Simple Duration Plans
              </p>
              <h2 id="plans-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Choose the best plan for your clinic
              </h2>
              <p className="mt-3 text-slate-600">
                All plans start with a <strong>3-Day 100% Free Trial</strong>. Recharge whenever you&apos;re ready.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`relative flex flex-col rounded-3xl border bg-white p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-xl sm:p-7 ${
                    plan.popular
                      ? "border-[#0A4C95] ring-4 ring-blue-100 lg:-mt-3 lg:mb-3"
                      : "border-slate-200"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#0A4C95] to-blue-600 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg">
                      <Star aria-hidden="true" className="mr-1 inline fill-current text-[#F37021]" size={13} />
                      Most Popular · Best Value
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-extrabold text-slate-950">
                      {plan.name}
                    </h3>
                    {plan.savings && (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-black text-emerald-700">
                        {plan.savings}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{plan.tagline}</p>

                  <div className="mt-5 border-b border-slate-100 pb-5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                        {plan.price}
                      </span>
                      {plan.originalPrice && (
                        <span className="text-sm font-bold text-slate-400 line-through">
                          {plan.originalPrice}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{plan.period}</p>
                  </div>

                  <ul className="mt-6 flex-1 space-y-3" aria-label={`${plan.name} features`}>
                    {plan.features.map((feature, idx) => (
                      <li key={feature} className={`flex gap-2.5 text-xs leading-5 ${idx === 0 ? "font-bold text-[#0A4C95]" : "text-slate-700"}`}>
                        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                          <Check aria-hidden="true" size={11} strokeWidth={3} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className={`mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      plan.popular
                        ? "bg-[#0A4C95] text-white shadow-md hover:bg-blue-900"
                        : "border-2 border-[#0A4C95] bg-white text-[#0A4C95] hover:bg-blue-50"
                    }`}
                  >
                    {plan.cta} <ArrowRight aria-hidden="true" size={16} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-heading" className="border-y border-slate-200 bg-white py-16 sm:py-24">
          <div className="container-page">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-[#F37021]">How it works</p>
              <h2 id="how-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                From patient visit to 5-star Google review in 3 easy steps
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
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#0A4C95] to-blue-600 text-white shadow-lg shadow-blue-900/15">
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
              <span className="inline-block rounded-full bg-[#F37021]/20 px-3 py-1 text-xs font-black text-[#F37021]">3 DAYS 100% FREE</span>
              <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Ready to grow your clinic&apos;s Google reviews?</h2>
              <p className="mt-2 text-slate-300">Start your 3-day free trial today. No credit card required.</p>
            </div>
            <Link href="/signup" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-[#0A4C95] transition-all hover:scale-105 hover:bg-blue-50 sm:w-auto">
              Start 3-Day Free Trial <ArrowRight aria-hidden="true" size={18} />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
