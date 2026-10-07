import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Baby, BadgeCheck, BookOpen, Check, CircleUserRound, Copy,
  GraduationCap, Hospital, Languages, LockKeyhole, MapPin, MessageSquareText,
  Navigation, PhoneCall, QrCode, ScanLine, School, Search, ShieldCheck, Smartphone,
  Sparkles, Star, Stethoscope, TrendingUp, Users, WandSparkles, Workflow, CheckCircle2,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "MediRank — AI Google Review & GMB Ranking Software for Doctors & Coaching Institutes",
  description: "Boost your Google Maps local ranking. MediRank turns patient visits and student feedback into authentic 5-star Google reviews with a smart QR code — built for Clinics, Doctors & Coaching Institutes in India.",
};

const featureCards = [
  {
    title: "Rank #1 on Google Maps",
    copy: "Build a steady, organic stream of authentic 5-star feedback—the #1 local SEO ranking factor for local discovery.",
    icon: TrendingUp,
    eyebrow: "Local SEO Growth",
  },
  {
    title: "Build Immediate Patient & Parent Trust",
    copy: "Recent, authentic reviews help new patients and parents choose your clinic or institute with 100% confidence.",
    icon: Users,
    eyebrow: "Trust & Conversion",
  },
  {
    title: "Zero Work for Staff & Faculty",
    copy: "One smart desk QR guides patients & students through a seamless 60-second experience without manual follow-ups.",
    icon: Workflow,
    eyebrow: "Smart QR Automation",
  },
  {
    title: "Natural English & Hinglish AI",
    copy: "Indian clients naturally mix Hindi & English. MediRank crafts relatable, authentic review drafts tailored to your specialty.",
    icon: Languages,
    eyebrow: "English + Hinglish",
  },
] as const;

const healthcarePractices = [
  { label: "Dentists & Dental Clinics", icon: Sparkles },
  { label: "Dermatologists & Skin Clinics", icon: CircleUserRound },
  { label: "Gynecologists & Maternity Centers", icon: Baby },
  { label: "General Physicians & Surgeons", icon: Stethoscope },
  { label: "Multi-Specialty Hospitals", icon: Hospital },
] as const;

const educationPractices = [
  { label: "NEET & IIT-JEE Coaching", icon: GraduationCap },
  { label: "CBSE & State Board Tuitions", icon: BookOpen },
  { label: "Schools & Colleges", icon: School },
  { label: "Commerce & CA Coaching", icon: TrendingUp },
  { label: "Language & Skill Academies", icon: Sparkles },
] as const;

const reviewBenefits = [
  {
    icon: MessageSquareText,
    title: "Asking directly feels awkward & time-consuming",
    copy: "Busy doctors, educators, and reception staff rarely have the time to chase clients for Google reviews.",
  },
  {
    icon: QrCode,
    title: "A single smart QR makes feedback natural",
    copy: "Patients and students simply scan at the reception desk, tap 1-2 highlights, and copy their review effortlessly.",
  },
  {
    icon: ShieldCheck,
    title: "100% authentic, organic & Google policy-safe",
    copy: "MediRank never auto-posts or fakes reviews. It empowers real visitors to share their genuine experiences safely.",
  },
] as const;

const choiceReasons = [
  {
    icon: ShieldCheck,
    title: "Built for Google Review Safety in 2026",
    copy: "Rolling 24-hour phrase limits, originality checks, and authentic-input guardrails prevent repetitive patterns and protect your Google Business Profile from spam filters.",
  },
  {
    icon: Languages,
    title: "Hinglish + Regional Vocabulary Support",
    copy: "Indian patients and students mix Hindi and English naturally. MediRank's AI config produces genuine Hinglish phrasing while preserving true feedback.",
  },
  {
    icon: LockKeyhole,
    title: "Privacy-Locked Device Verification",
    copy: "A privacy-safe hashed device token applies a seven-day, per-location lock to prevent duplicate submissions by the same phone.",
  },
] as const;

const conversionSteps = [
  {
    icon: Navigation,
    number: "01",
    title: "Smart Desk QR Scan",
    copy: "The patient or student scans your custom branded QR code at your reception or classroom desk. No mobile app download needed.",
  },
  {
    icon: WandSparkles,
    number: "02",
    title: "1-Tap AI Experience Drafts",
    copy: "They tap 1-2 quick highlights (like friendly faculty, painless treatment, or concept clarity). MediRank instantly generates 3 natural review variations.",
  },
  {
    icon: Copy,
    number: "03",
    title: "Instant Google Maps Paste",
    copy: "With a single tap, the review is copied and your official Google Business Profile review dialog opens directly for instant 5-star submission.",
  },
] as const;

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="bg-white overflow-hidden">
        {/* HERO SECTION */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white pb-16 pt-10 sm:pb-24 sm:pt-20">
          <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-orange-100/60 blur-3xl" />
          <div className="absolute -left-36 bottom-0 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" />
          
          <div className="container-page relative grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-brand shadow-sm sm:text-sm">
                <Sparkles size={15} className="text-brand shrink-0" />
                <span>AI Reviews for Healthcare & Education</span>
              </div>
              
              <h1 className="max-w-2xl text-3xl font-bold leading-[1.15] tracking-tight text-slate-950 min-[400px]:text-4xl sm:text-5xl lg:text-6xl">
                Turn happy visitors into <span className="text-brand">5-star Google reviews.</span>
              </h1>
              
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-950 sm:text-lg sm:leading-8">
                MediRank helps <b className="font-semibold text-black">Clinics, Doctors & Coaching Institutes</b> collect authentic, high-converting Google reviews in under 60 seconds with a simple QR code.
              </p>

              {/* Action Buttons */}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="btn-primary min-h-12 w-full text-center text-sm font-semibold shadow-lg shadow-blue-900/10 sm:w-auto sm:text-base flex items-center justify-center gap-2"
                >
                  Create Your Free QR Code <ArrowRight size={18} />
                </Link>
                <Link
                  href="/r/dr-mehta"
                  className="btn-secondary min-h-12 w-full text-center text-sm font-semibold sm:w-auto sm:text-base flex items-center justify-center gap-2"
                >
                  Try Live Demo
                </Link>
              </div>

              {/* Trust Badges */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-950 sm:text-sm">
                {["No app download", "Setup in 2 minutes", "For Clinics & Institutes", "100% Google Safe"].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Live Dashboard Preview Card */}
            <div className="relative mx-auto w-full max-w-md lg:max-w-none">
              <div className="card relative overflow-hidden p-5 shadow-2xl shadow-blue-900/10 sm:p-7 border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand font-bold text-sm">
                      MR
                    </span>
                    <div>
                      <p className="font-bold text-sm sm:text-base text-slate-950">Vyapar Wallah Hub</p>
                      <p className="text-xs font-medium text-slate-900">Live Reputation Monitor</p>
                    </div>
                  </div>
                  <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    +24% Growth
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 py-4">
                  <div className="rounded-2xl bg-blue-50/70 p-3.5 sm:p-4">
                    <ScanLine className="text-brand size-5" />
                    <p className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">1,480</p>
                    <p className="text-xs font-medium text-slate-950">Total QR Scans</p>
                  </div>
                  <div className="rounded-2xl bg-orange-50/70 p-3.5 sm:p-4">
                    <Star className="fill-orange text-orange size-5" />
                    <p className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">492</p>
                    <p className="text-xs font-medium text-slate-950">5★ Reviews Posted</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-[#0A4C95] p-4 text-white sm:p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-blue-100">Visitor-to-Review Conversion</p>
                      <p className="mt-0.5 text-2xl font-bold text-white sm:text-3xl">33.2%</p>
                    </div>
                    <div className="flex h-11 items-end gap-1 sm:h-13">
                      {[30, 45, 38, 60, 52, 75, 68, 92].map((h, i) => (
                        <span key={i} className="w-1.5 rounded-full bg-[#F37021] sm:w-2" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating 5-star badge */}
              <div className="absolute -bottom-4 -left-2 flex items-center gap-2.5 rounded-2xl bg-white p-3 shadow-xl border border-slate-100 sm:-left-4 sm:p-4">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-50 text-amber-500 sm:h-10 sm:w-10">
                  <Star fill="currentColor" size={19} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-950 sm:text-sm">New 5-Star Review!</p>
                  <p className="text-[11px] font-medium text-slate-900">Google Maps · Just now</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: GOOGLE MAPS RANKING DEMO */}
        <section id="how" className="relative overflow-hidden bg-white py-16 sm:py-24 border-t border-slate-100">
          <div className="container-page relative grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Visual Google Search Preview */}
            <div className="relative mx-auto w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0A4C95] text-white shrink-0">
                  <Search size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-800">Google Maps Local Search</p>
                  <p className="font-bold text-sm text-slate-950 truncate">
                    best clinic & coaching near me
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {/* #1 Result */}
                <div className="relative overflow-hidden rounded-2xl border-2 border-[#F37021] bg-orange-50/20 p-3.5 sm:p-4 shadow-md">
                  <span className="absolute right-3 top-3 rounded-full bg-[#F37021] px-2 py-0.5 text-[9px] font-bold uppercase text-white">
                    Rank #1
                  </span>
                  <div className="flex gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0A4C95] text-white">
                      <Sparkles size={19} />
                    </span>
                    <div>
                      <p className="font-bold text-sm text-slate-950 sm:text-base">Your Clinic / Institute</p>
                      <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-[#F37021]">
                        4.9 {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={12} fill="currentColor" />
                        ))}
                        <span className="ml-1 text-slate-950 font-medium">(480+ Google Reviews)</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-900">
                        <MapPin size={12} /> Open · 450 m away · Highly Rated
                      </p>
                    </div>
                  </div>
                </div>

                {/* Competitors */}
                {[
                  ["Competitor Profile A", "4.2", "48"],
                  ["Competitor Profile B", "3.9", "22"],
                ].map(([name, rating, reviews], index) => (
                  <div key={name} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-200 text-xs font-bold text-slate-800">
                      {index + 2}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-slate-950 truncate">{name}</p>
                      <p className="text-[11px] font-medium text-slate-900">
                        ★ {rating} <span className="text-slate-700">({reviews} reviews)</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="absolute -right-2 -top-3 flex items-center gap-1.5 rounded-xl bg-[#0A4C95] px-3 py-2 text-xs font-semibold text-white shadow-lg sm:-right-4">
                <TrendingUp size={15} className="text-[#F37021]" /> Top Local Visibility
              </div>
            </div>

            {/* Text details */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#F37021]">Why Reputation Matters</p>
              <h2 className="mt-3 text-2xl font-bold leading-tight text-slate-950 sm:text-4xl">
                Google Reviews Drive 80%+ of Local Customer Choices
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-950">
                When people search for doctors, dental care, NEET/JEE coaching, or local tutors, Google Maps is their first choice. Fresh, genuine reviews with keyword mentions directly boost your local search ranking and convert searchers into walk-in inquiries.
              </p>

              <div className="mt-6 space-y-4">
                {reviewBenefits.map(({ icon: Icon, title, copy }) => (
                  <div key={title} className="flex gap-3 sm:gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand">
                      <Icon size={19} />
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-950">{title}</h3>
                      <p className="mt-0.5 text-xs sm:text-sm leading-relaxed text-slate-950 font-normal">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: FEATURES GRID */}
        <section id="features" className="bg-slate-50/70 py-16 sm:py-24 border-t border-slate-200/60">
          <div className="container-page">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-[#F37021]">Designed for Measurable Growth</p>
              <h2 className="mt-3 text-2xl font-bold text-slate-950 sm:text-4xl">
                How MediRank Powers Your Reputation
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base text-slate-950">
                A simple 3-step automated workflow that fits naturally at the end of any clinic visit or classroom session.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featureCards.map(({ title, copy, icon: Icon, eyebrow }, index) => (
                <article
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-brand/40 hover:shadow-md"
                >
                  <span className={`grid h-11 w-11 place-items-center rounded-xl text-white ${index % 2 ? "bg-[#F37021]" : "bg-[#0A4C95]"}`}>
                    <Icon size={20} />
                  </span>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-[#F37021]">{eyebrow}</p>
                  <h3 className="mt-1.5 text-base font-bold text-slate-950">{title}</h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-950 font-normal">{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 4: 3-STEP PROCESS */}
        <section className="bg-white py-16 sm:py-24 border-t border-slate-100">
          <div className="container-page">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-[#F37021]">Zero Friction Experience</p>
              <h2 className="mt-3 text-2xl font-bold text-slate-950 sm:text-4xl">
                How It Works in 3 Easy Steps
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-950">
                Your patients or students complete the whole feedback process in under 60 seconds on their phone.
              </p>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {conversionSteps.map(({ icon: Icon, number, title, copy }) => (
                <div key={number} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <span className="absolute right-4 top-3 text-4xl font-bold text-slate-200">{number}</span>
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0A4C95] text-white">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-slate-950">{title}</h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-950 font-normal">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 5: SAFETY & INTEGRITY */}
        <section className="bg-slate-50/80 px-4 py-16 sm:py-24 border-t border-slate-200/60">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#F37021]">2026 Google Policy Compliant</p>
              <h2 className="mt-3 text-2xl font-bold text-slate-950 sm:text-4xl">
                Engineered for Safe & Organic Growth
              </h2>
              <div className="mt-6 space-y-5">
                {choiceReasons.map(({ icon: Icon, title, copy }) => (
                  <div key={title} className="flex gap-3 sm:gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0A4C95] text-white">
                      <Icon size={19} />
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-950">{title}</h3>
                      <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-950 font-normal">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl sm:p-7">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-[11px] font-bold uppercase text-[#F37021]">Reputation Guardrails</p>
                  <p className="text-base font-bold text-slate-950">Anti-Spam & Natural Phrasing</p>
                </div>
                <BadgeCheck size={26} className="text-emerald-600" />
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="font-bold text-xs text-emerald-950 flex items-center gap-1.5">
                    <Check size={16} className="text-emerald-700" /> MediRank Safe Flow
                  </p>
                  <ul className="mt-3 space-y-2 text-xs font-medium text-slate-950">
                    <li>✓ 24-hr phrase variation limits</li>
                    <li>✓ 7-day device lock protection</li>
                    <li>✓ Genuine visitor choice</li>
                    <li>✓ No bot auto-posting</li>
                  </ul>
                </div>

                <div className="rounded-2xl border border-red-200 bg-red-50/40 p-4">
                  <p className="font-bold text-xs text-red-900 flex items-center gap-1.5">
                    <AlertTriangle size={15} className="text-red-600" /> Generic Fake Systems
                  </p>
                  <ul className="mt-3 space-y-2 text-xs font-medium text-slate-950">
                    <li>✕ Repeated bot templates</li>
                    <li>✕ Keyword stuffing penalties</li>
                    <li>✕ Fake bulk submissions</li>
                    <li>✕ Risk of Google GMB suspension</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: SUPPORTED VERTICALS (HEALTHCARE & EDUCATION) */}
        <section id="categories" className="bg-white py-16 sm:py-24 border-t border-slate-100">
          <div className="container-page">
            <div className="rounded-[2.5rem] bg-[#0A4C95] px-5 py-10 text-center text-white shadow-2xl sm:px-10 sm:py-14">
              <p className="text-xs font-bold uppercase tracking-wider text-[#F37021]">Built for Indian Practitioners & Educators</p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-4xl">
                Made for Healthcare & Education Businesses
              </h2>
              
              {/* Healthcare List */}
              <div className="mt-8 text-left max-w-4xl mx-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-3 text-center sm:text-left">
                  🏥 Healthcare Practices
                </p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2.5">
                  {healthcarePractices.map(({ label, icon: Icon }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-white hover:text-[#0A4C95]"
                    >
                      <Icon size={15} className="text-[#F37021]" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Education List */}
              <div className="mt-7 text-left max-w-4xl mx-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-100 mb-3 text-center sm:text-left">
                  🎓 Education & Coaching Institutes
                </p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2.5">
                  {educationPractices.map(({ label, icon: Icon }) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-white hover:text-[#0A4C95]"
                    >
                      <Icon size={15} className="text-[#F37021]" />
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-10">
                <Link
                  href="/signup"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#F37021] px-7 font-bold text-white shadow-xl transition hover:scale-[1.03] active:scale-[.98]"
                >
                  Get Started Free Today <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="container-page flex flex-col items-center justify-between gap-4 sm:flex-row text-center sm:text-left">
          <Logo />
          <p className="text-xs sm:text-sm font-normal text-slate-950">
            A product by <b className="font-semibold text-black">Vyapar Wallah</b> · © 2026 MediRank. All rights reserved.
          </p>
        </div>
      </footer>
    </>
  );
}

