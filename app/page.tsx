import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Baby, BadgeCheck, Check, CircleUserRound, Copy,
  Hospital, Languages, LockKeyhole, MapPin, MessageSquareText,
  Navigation, PhoneCall, QrCode, ScanLine, Search, ShieldCheck, Smartphone,
  Sparkles, Star, Stethoscope, TrendingUp, Users, WandSparkles, Workflow,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Logo } from "@/components/logo";

export const metadata:Metadata={
  title:"Medirank — Google Review & GMB Ranking Software for Doctors",
  description:"Help your clinic rank higher on Google Maps. Medirank turns patient visits into genuine Google reviews with a simple QR code — built for doctors, clinics & hospitals in India.",
};

const featureCards=[
  {title:"Higher Google Maps ranking",copy:"Build a steady stream of genuine patient feedback—an important local visibility and discovery signal.",icon:TrendingUp,eyebrow:"Local SEO signal"},
  {title:"More patient trust",copy:"Recent, authentic reviews help new patients feel confident before they book their first appointment.",icon:Users,eyebrow:"Trust & conversion"},
  {title:"Zero extra work for your staff",copy:"One clinic QR guides patients through the feedback flow without repetitive follow-ups from reception.",icon:Workflow,eyebrow:"Simple automation"},
  {title:"Built for Indian clinics",copy:"Natural English and Hinglish support makes the experience familiar across diverse Indian patient groups.",icon:Languages,eyebrow:"English + Hinglish"},
] as const;

const practices=[
  {label:"Dentists & Dental Clinics",icon:Sparkles},
  {label:"Dermatologists & Skin Clinics",icon:CircleUserRound},
  {label:"Gynecologists & Maternity Centers",icon:Baby},
  {label:"General Physicians",icon:Stethoscope},
  {label:"Multi-Specialty Hospitals",icon:Hospital},
] as const;
const reviewBenefits=[
  {icon:MessageSquareText,title:"Asking patients directly feels awkward",copy:"Busy doctors and reception teams rarely have time for repeated review requests."},
  {icon:QrCode,title:"A simple QR makes feedback natural",copy:"Patients scan after their visit and move through a clear, guided experience at their own pace."},
  {icon:ShieldCheck,title:"Authenticity stays at the center",copy:"MediRank helps patients express their own experience without auto-posting or replacing patient choice."},
] as const;
const choiceReasons=[
  {icon:ShieldCheck,title:"Built for Google Review Safety in 2026",copy:"Rolling 24-hour phrase limits, originality checks, and authentic-input guardrails reduce repetitive patterns and help protect the integrity of your Google Business Profile. No platform can guarantee immunity from Google enforcement."},
  {icon:Languages,title:"Hinglish + Regional Vocabulary Support",copy:"Indian patients naturally mix Hindi and English. MediRank’s specialized Ai configuration supports familiar Hinglish phrasing while preserving the patient’s selected facts and meaning."},
  {icon:LockKeyhole,title:"Privacy-Locked Device Verification",copy:"A privacy-safe hashed device token applies a seven-day, per-clinic generation lock to discourage repeated submissions by staff, competitors, or the same device."},
] as const;
const conversionSteps=[
  {icon:Navigation,number:"01",title:"Smart Verification Scan",copy:"The patient scans your clinic’s custom QR code at the reception. Our intelligent system automatically verifies the visit instantly and seamlessly prepares a localized feedback session tailored to your practice branch—ensuring only real, physical footfall is converted into profile visibility"},
  {icon:WandSparkles,number:"02",title:"One-Click Smart Variations",copy:"The patient effortlessly selects 1 or 2 quick highlights of their visit (like friendly staff or painless treatment). MediRank instantly generates authentic, highly personalized drafts that match true patient experiences, removing all typing friction completely."},
  {icon:Copy,number:"03",title:"Seamless Organic Publishing",copy:"Once the patient selects their preferred draft, they are beautifully guided forward to your official Google Maps profile. With a natural and intuitive click-path, pasting their real experience takes less than 2 seconds, boosting your local ranking safely."},
] as const;

export default function Home(){return <>
  <SiteHeader/>
  <main className="bg-white">
    {/* Existing screenshot hero intentionally preserved. */}
    <section className="relative overflow-hidden bg-white pb-20 pt-16 sm:pt-24">
      <div className="absolute -right-24 top-10 h-96 w-96 rounded-full bg-orange-100/60 blur-3xl"/>
      <div className="absolute -left-36 bottom-0 h-96 w-96 rounded-full bg-blue-100/70 blur-3xl"/>
      <div className="container-page relative grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-brand"><Sparkles size={15}/>AI-powered patient reviews</div>
          <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-[-.04em] text-slate-950 sm:text-6xl">Turn happy visits into <span className="text-brand">trusted reviews.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-900">MediRank helps your patients share authentic Google reviews in under 60 seconds—with a simple scan and a little help from AI.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/signup" className="btn-primary">Get your clinic QR <ArrowRight size={18}/></Link><Link href="/r/dr-mehta" className="btn-secondary">Try patient experience</Link></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-900">{["No app needed","Setup in 5 minutes","Made for clinics"].map(item=><span key={item} className="flex items-center gap-1.5"><Check size={16} className="text-[#0A4C95]"/>{item}</span>)}</div>
        </div>
        <div className="relative mx-auto w-full max-w-lg">
          <div className="card relative p-5 sm:p-7"><div className="flex items-center justify-between border-b border-slate-100 pb-5"><div><p className="font-bold">Good morning, Dr. Mehta</p><p className="text-sm text-slate-900">Here’s how your clinic is growing.</p></div><span className="rounded-xl bg-blue-50 px-3 py-1 text-xs font-bold text-brand">+18%</span></div>
            <div className="grid grid-cols-2 gap-3 py-5"><div className="rounded-2xl bg-blue-50 p-4"><ScanLine className="text-brand"/><p className="mt-4 text-3xl font-extrabold">1,248</p><p className="text-sm font-medium text-slate-900">Total scans</p></div><div className="rounded-2xl bg-orange-50 p-4"><Star className="fill-orange text-orange"/><p className="mt-4 text-3xl font-extrabold">386</p><p className="text-sm font-medium text-slate-900">Reviews posted</p></div></div>
            <div className="rounded-2xl bg-[#0A4C95] p-5 text-white"><div className="flex justify-between"><div><p className="text-sm font-semibold text-white">Conversion rate</p><p className="mt-1 text-3xl font-extrabold">30.9%</p></div><div className="flex h-14 items-end gap-1">{[25,40,30,55,48,70,62,86].map((height,index)=><i key={index} className="w-2 rounded-full bg-[#F37021]" style={{height:`${height}%`}}/>)}</div></div></div>
          </div>
          <div className="absolute -bottom-5 -left-2 flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft sm:-left-5"><div className="grid h-11 w-11 place-items-center rounded-full bg-blue-50 text-brand"><Star fill="currentColor" size={20}/></div><div><p className="font-bold">New 5-star review!</p><p className="text-xs font-medium text-slate-900">Just now · Google</p></div></div>
        </div>
      </div>
    </section>

    <section id="how" className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="pointer-events-none absolute -left-32 top-1/4 h-80 w-80 animate-pulse rounded-full bg-[#0A4C95]/[.055] blur-3xl"/><div className="pointer-events-none absolute -right-28 bottom-0 h-72 w-72 animate-pulse rounded-full bg-[#F37021]/[.06] blur-3xl [animation-delay:900ms]"/>
      <div className="container-page relative grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div className="relative mx-auto w-full max-w-xl rounded-[2rem] border border-[#0A4C95]/15 bg-white p-5 shadow-2xl shadow-[#0A4C95]/10 sm:p-7">
          <div className="flex items-center gap-3 border-b border-[#0A4C95]/10 pb-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0A4C95] text-white"><Search size={20}/></span><div><p className="text-xs font-bold text-[#0A4C95]">Google Maps search</p><p className="font-extrabold text-[#0A4C95]">best dental clinic near me</p></div></div>
          <div className="mt-5 space-y-3">
            <div className="relative overflow-hidden rounded-2xl border-2 border-[#F37021] bg-white p-4 shadow-lg shadow-[#F37021]/10"><span className="absolute right-3 top-3 rounded-full bg-[#F37021] px-2.5 py-1 text-[10px] font-black text-white">POSITION #1</span><div className="flex gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0A4C95] text-white"><Stethoscope size={21}/></span><div><p className="font-black text-[#0A4C95]">Mehta Dental Care</p><div className="mt-1 flex items-center gap-1 text-sm font-bold text-[#F37021]">4.9 {Array.from({length:5}).map((_,index)=><Star key={index} size={13} fill="currentColor"/>)} <span className="ml-1 text-[#0A4C95]">386 reviews</span></div><p className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#0A4C95]"><MapPin size={13}/>Open · 650 m away</p></div></div></div>
            {[['City Smile Clinic','4.6','142'],['Family Dental Point','4.4','89']].map(([name,rating,reviews],index)=><div key={name} className="flex items-center gap-3 rounded-2xl border border-[#0A4C95]/10 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#0A4C95]/10 font-black text-[#0A4C95]">{index+2}</span><div><p className="font-bold text-[#0A4C95]">{name}</p><p className="text-xs font-semibold text-[#F37021]">★ {rating} <span className="text-[#0A4C95]">({reviews} reviews)</span></p></div></div>)}
          </div>
          <div className="absolute -right-3 -top-4 flex items-center gap-2 rounded-xl bg-[#0A4C95] px-4 py-2.5 text-xs font-bold text-white shadow-xl sm:-right-6"><TrendingUp size={16} className="text-[#F37021]"/>Rising in local search</div>
        </div>
        <div><p className="text-sm font-black uppercase tracking-[.18em] text-[#F37021]">Visibility creates growth</p><h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#0A4C95] sm:text-4xl">Why Google Reviews Matter for Your Clinic&apos;s Growth</h2><p className="mt-6 text-lg leading-8 text-slate-900">When patients search for care nearby, Google Maps often becomes their first shortlist. Review quality, recency, relevance, and a trustworthy clinic profile can strongly influence visibility and booking confidence.</p>
          <div className="mt-7 space-y-5">{reviewBenefits.map(({icon:Icon,title,copy})=><div key={title} className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F37021]/10 text-[#F37021]"><Icon size={20}/></span><div><h3 className="font-extrabold text-[#0A4C95]">{title}</h3><p className="mt-1 leading-6 text-slate-900">{copy}</p></div></div>)}</div>
        </div>
      </div>
    </section>

    <section id="features" className="bg-white py-20 sm:py-28"><div className="container-page"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-black uppercase tracking-[.18em] text-[#F37021]">Designed for measurable reputation growth</p><h2 className="mt-4 text-3xl font-black tracking-tight text-[#0A4C95] sm:text-4xl">How Medirank Helps Doctors & Clinics</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-900">A focused review workflow that fits naturally into the end of a patient visit.</p></div>
      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">{featureCards.map(({title,copy,icon:Icon,eyebrow},index)=><article key={title} className="group rounded-2xl border border-[#0A4C95]/15 bg-white p-6 shadow-lg shadow-[#0A4C95]/5 transition-all duration-300 hover:-translate-y-1 hover:border-[#F37021]/40 hover:shadow-xl"><span className={`grid h-12 w-12 place-items-center rounded-xl text-white ${index%2?'bg-[#F37021]':'bg-[#0A4C95]'}`}><Icon size={22}/></span><p className="mt-6 text-xs font-black uppercase tracking-wider text-[#F37021]">{eyebrow}</p><h3 className="mt-2 text-xl font-black leading-snug text-[#0A4C95]">{title}</h3><p className="mt-3 leading-7 text-slate-900">{copy}</p></article>)}</div>
    </div></section>

    <section className="bg-white px-4 py-16 sm:py-24"><div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-16">
      <div><p className="text-sm font-black uppercase tracking-[.18em] text-[#F37021]">Purpose-built, not generic</p><h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#0A4C95] md:text-4xl">Why Indian Doctors Choose MediRank Over Generic Systems</h2><div className="mt-8 space-y-7">{choiceReasons.map(({icon:Icon,title,copy})=><div key={title} className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#0A4C95] text-white"><Icon size={21}/></span><div><h3 className="text-lg font-black text-[#0A4C95]">{title}</h3><p className="mt-2 leading-7 text-slate-900">{copy}</p></div></div>)}</div></div>
      <div className="relative mx-auto w-full max-w-xl"><div className="pointer-events-none absolute -inset-8 rounded-full bg-gradient-to-br from-[#0A4C95]/10 to-[#F37021]/15 blur-3xl"/><div className="relative overflow-hidden rounded-[2rem] border border-[#0A4C95]/15 bg-white p-5 shadow-2xl shadow-[#0A4C95]/10 sm:p-7">
        <div className="flex items-center justify-between border-b border-[#0A4C95]/15 pb-5"><div><p className="text-xs font-black uppercase tracking-wider text-[#F37021]">Review integrity monitor</p><p className="mt-1 text-xl font-black text-[#0A4C95]">Clinic verification health</p></div><span className="grid h-11 w-11 place-items-center rounded-full bg-[#0A4C95] text-white"><BadgeCheck size={23}/></span></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border-2 border-[#0A4C95] p-5"><div className="flex items-center gap-2 font-black text-[#0A4C95]"><BadgeCheck size={20}/>Verified workflow</div><ul className="mt-5 space-y-3 text-sm font-semibold text-slate-900">{['24-hour phrase controls','7-day device lock','Similarity checks','Patient-led rating'].map(item=><li key={item} className="flex items-center gap-2"><Check size={16} className="text-[#0A4C95]"/>{item}</li>)}</ul><div className="mt-5 rounded-xl bg-[#0A4C95] px-3 py-2 text-center text-xs font-black text-white">LOWER ABUSE RISK</div></div>
          <div className="rounded-2xl border-2 border-[#F37021] p-5"><div className="flex items-center gap-2 font-black text-[#F37021]"><AlertTriangle size={20}/>Uncontrolled flow</div><ul className="mt-5 space-y-3 text-sm font-semibold text-slate-900">{['Repeated templates','Unlimited devices','No location context','Keyword stuffing'].map(item=><li key={item} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#F37021]"/>{item}</li>)}</ul><div className="mt-5 rounded-xl bg-[#F37021] px-3 py-2 text-center text-xs font-black text-white">HIGHER POLICY RISK</div></div></div>
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#0A4C95]/[.06] p-4"><ShieldCheck className="shrink-0 text-[#0A4C95]"/><p className="text-sm font-bold leading-6 text-slate-900">Controls support authentic collection; final compliance still depends on clinic and patient behavior.</p></div>
      </div></div>
    </div></section>

    <section className="bg-white px-4 py-16 sm:py-24"><div className="mx-auto max-w-7xl"><div className="mx-auto max-w-3xl text-center"><p className="text-sm font-black uppercase tracking-[.18em] text-[#F37021]">From visit to visible trust</p><h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[#0A4C95] md:text-4xl">Engineered for Multi-Step Patient-to-Review Conversion</h2><p className="mt-5 text-lg leading-8 text-slate-900">A guided journey designed to remove friction while keeping every action transparent and patient-controlled.</p></div>
      <div className="mt-12 flex flex-col gap-12 md:flex-row-reverse md:items-center md:gap-16"><div className="w-full md:w-1/2"><div className="space-y-6">{conversionSteps.map(({icon:Icon,number,title,copy})=><div key={number} className="relative rounded-2xl border border-[#0A4C95]/15 bg-white p-5 shadow-lg shadow-[#0A4C95]/5 sm:p-6"><span className="absolute right-5 top-4 text-4xl font-black text-[#0A4C95]/10">{number}</span><div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#F37021] text-white"><Icon size={21}/></span><div className="pr-6"><h3 className="text-lg font-black text-[#0A4C95]">{title}</h3><p className="mt-2 leading-7 text-slate-900">{copy}</p></div></div></div>)}</div></div>
        <div className="w-full md:w-1/2"><div className="relative mx-auto max-w-xl overflow-hidden rounded-[2rem] bg-[#0A4C95] p-5 text-white shadow-2xl shadow-[#0A4C95]/20 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[#F37021]">Clinic growth intelligence</p><h3 className="mt-2 text-2xl font-black">Patient discovery trend</h3></div><span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#0A4C95]">+68% in 6 months</span></div>
          <div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-4 text-[#0A4C95]"><PhoneCall size={19} className="text-[#F37021]"/><p className="mt-3 text-2xl font-black">842</p><p className="text-xs font-bold text-slate-900">Patient calls</p></div><div className="rounded-2xl bg-white p-4 text-[#0A4C95]"><Navigation size={19} className="text-[#F37021]"/><p className="mt-3 text-2xl font-black">1,294</p><p className="text-xs font-bold text-slate-900">Map directions</p></div></div>
          <div className="mt-5 rounded-2xl bg-white p-4 sm:p-5"><div className="flex items-center justify-between"><p className="text-sm font-black text-[#0A4C95]">Month-over-month activity</p><TrendingUp size={19} className="text-[#F37021]"/></div><div className="mt-6 flex h-40 items-end justify-between gap-2 border-b border-[#0A4C95]/20">{[24,31,39,48,61,78,92].map((height,index)=><div key={height} className="flex flex-1 flex-col items-center justify-end gap-2"><span className="text-[9px] font-black text-[#0A4C95]">{height}</span><div className={`w-full max-w-9 rounded-t-lg ${index===6?'bg-[#F37021]':'bg-[#0A4C95]'}`} style={{height:`${height}%`}}/></div>)}</div><div className="mt-2 flex justify-between text-[10px] font-bold text-slate-900"><span>Jan</span><span>Jul</span></div></div>
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/30 p-4"><Smartphone className="shrink-0 text-[#F37021]"/><p className="text-sm font-bold leading-6 text-white">More recent patient feedback supports stronger trust across calls, directions, and bookings.</p></div>
        </div></div>
      </div>
    </div></section>

    <section className="relative overflow-hidden bg-white py-20 sm:py-28"><div className="absolute inset-x-0 top-1/2 h-px bg-[#0A4C95]/10"/><div className="container-page relative"><div className="rounded-[2rem] bg-[#0A4C95] px-5 py-10 text-center text-white shadow-2xl shadow-[#0A4C95]/15 sm:px-10 sm:py-14"><p className="text-sm font-black uppercase tracking-[.18em] text-[#F37021]">One platform, many specialties</p><h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Built for Every Type of Healthcare Practice</h2><div className="mt-9 flex flex-wrap justify-center gap-3">{practices.map(({label,icon:Icon})=><span key={label} className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-white/25 bg-white px-4 py-2 text-sm font-bold text-[#0A4C95] shadow-lg transition hover:-translate-y-0.5 hover:border-[#F37021]"><Icon size={18} className="text-[#F37021]"/>{label}</span>)}</div>
        <p className="mx-auto mt-10 max-w-3xl text-base font-medium leading-8 text-white">Learn more about how the <Link href="#how" className="font-bold text-white underline decoration-[#F37021] decoration-2 underline-offset-4">review collection process works</Link> or explore our <Link href="/pricing" className="font-bold text-white underline decoration-[#F37021] decoration-2 underline-offset-4">pricing plans for clinics and hospitals</Link>.</p>
        <div className="mt-7"><Link href="/signup" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#F37021] px-6 font-extrabold text-white shadow-xl transition hover:scale-[1.03]">Get Started Now <ArrowRight size={18}/></Link></div>
      </div></div></section>
  </main>
  <footer className="border-t border-[#0A4C95]/10 bg-white py-8"><div className="container-page flex flex-col items-center justify-between gap-4 sm:flex-row"><Logo/><p className="text-sm font-medium text-[#0A4C95]">A product by <b>Vyapar Wallah</b> · © 2026</p></div></footer>
</>}
