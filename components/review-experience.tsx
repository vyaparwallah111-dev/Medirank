"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Clipboard, ExternalLink, Loader2, Sparkles, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Language = "english" | "hinglish";
type Theme = { primary?: string; accent?: string; background?: string };
type Doctor = { id: string; doctor_name: string; clinic_name: string; specialization: string | null; gmb_review_link: string | null; logo_url?: string | null; theme_config?: Theme | null };
type Location = { latitude: number; longitude: number };

const ThankYouAnimation = dynamic(() => import("./thank-you-animation"), { ssr: false });
const fallback = { primary: "#0A4C95", accent: "#F37021", background: "#F8FAFC" };
const copy = {
  english: {
    chooseLanguage: "Choose your language", languageHint: "Select the language you feel most comfortable with.", welcome: "How was your visit with", quest: "Review Spotlight", step: "Step",
    experienceTitle: "How did your visit feel?", experienceBubble: "Select up to 3 experiences", treatmentTitle: "What did you visit for?", treatmentBubble: "Select your treatment",
    notesTitle: "Anything else to add?", notesBubble: "Add a note, or simply continue", notesPlaceholder: "Share anything specific about your visit…", optional: "Optional",
    generateTitle: "Ready to create your review?", generateBubble: "Let AI prepare your review drafts", generate: "Generate my review", generating: "Writing your drafts…",
    draftsTitle: "Choose your favorite draft", draftsBubble: "Pick the review that sounds like you", copyReview: "📋 Copy Review", next: "Next Step ➔", selectOne: "Select at least one option to continue.", max: "You can select up to 3 options.",
    checking: "Checking review eligibility…", thankTitle: "Thank you for visiting!", thankBody: "Your review is copied safely.", preparing: "Preparing Google Maps…", google: "Open Google Maps to Paste Review", noGoogle: "Google Maps link is not configured for this clinic.", copyError: "Clipboard access was blocked. Please allow it and try again.", generalExperience: "Good overall experience", consultation: "General consultation",
  },
  hinglish: {
    chooseLanguage: "Apni language chunein", languageHint: "Jis language mein aap comfortable hain, use select karein.", welcome: "Aapka visit kaisa raha", quest: "Review Spotlight", step: "Step",
    experienceTitle: "Aapka experience kaisa raha?", experienceBubble: "Maximum 3 experiences select karein", treatmentTitle: "Aap kis ilaaj ke liye aaye the?", treatmentBubble: "Apna ilaaj select karein",
    notesTitle: "Kuch aur batana chahenge?", notesBubble: "Note likhein, ya seedha aage badhein", notesPlaceholder: "Apne visit ke baare mein kuch khaas likhein…", optional: "Optional",
    generateTitle: "Review banane ke liye ready?", generateBubble: "AI ko review drafts taiyaar karne dein", generate: "Mera review banayein", generating: "Aapke drafts ban rahe hain…",
    draftsTitle: "Apna favorite draft chunein", draftsBubble: "Jo review aapko natural lage, use chunein", copyReview: "📋 Review Copy Karein", next: "Aage Badhein ➔", selectOne: "Aage badhne ke liye kam se kam ek option chunein.", max: "Aap maximum 3 options select kar sakte hain.",
    checking: "Review eligibility check ho rahi hai…", thankTitle: "Visit karne ke liye dhanyavaad!", thankBody: "Aapka review safely copy ho gaya hai.", preparing: "Google Maps taiyaar ho raha hai…", google: "Google Maps Kholein aur Review Paste Karein", noGoogle: "Is clinic ka Google Maps link configure nahi hai.", copyError: "Clipboard access block ho gaya. Permission dekar dobara try karein.", generalExperience: "Overall achha experience", consultation: "General consultation",
  },
} as const;

export function ReviewExperience({ doctor, experienceKeywords, topServices, scanId, isStarter: _isStarter, isGrowth: _isGrowth }: { doctor: Doctor; experienceKeywords: string[]; topServices: string[]; scanId: string | null; isStarter: boolean; isGrowth: boolean }) {
  const theme = { ...fallback, ...doctor.theme_config };
  const style = { "--patient-primary": theme.primary, "--patient-accent": theme.accent, "--patient-bg": theme.background } as CSSProperties;
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState("");
  const [reviews, setReviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [eligibilityChecking, setEligibilityChecking] = useState(true);
  const [eligibilityError, setEligibilityError] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [patientLocation, setPatientLocation] = useState<Location | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem("medirank_device_token") || crypto.randomUUID();
    localStorage.setItem("medirank_device_token", token); setDeviceToken(token);
    async function precheck(location: Location | null) {
      if (location) setPatientLocation(location);
      const supabase = createClient();
      if (!supabase) { if (active) { setEligibilityError("Review generation is not configured."); setEligibilityChecking(false); } return; }
      const { data, error: checkError } = await supabase.functions.invoke("generate-review", { body: { doctor_id: doctor.id, device_token: token, precheck_only: true, ...(location || {}) } });
      if (active) { setEligibilityError(data?.error || checkError?.message || ""); setEligibilityChecking(false); }
    }
    if (!navigator.geolocation) { void precheck(null); return () => { active = false; }; }
    navigator.geolocation.getCurrentPosition((position) => void precheck({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => void precheck(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 });
    return () => { active = false; };
  }, [doctor.id]);

  useEffect(() => {
    if (!showThankYou) { setGoogleEnabled(false); return; }
    const timer = window.setTimeout(() => setGoogleEnabled(true), 1500);
    return () => window.clearTimeout(timer);
  }, [showThankYou]);

  const t = currentLanguage ? copy[currentLanguage] : copy.english;
  const titleCase = (value: string) => value.trim().split(/\s+/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : "").join(" ");
  const doctorName = titleCase(doctor.doctor_name.replace(/^dr\.?\s*/i, ""));
  const clinicName = doctor.clinic_name.trim();
  const displayDoctorName = `Dr. ${doctorName}`;
  const visitQuestion = currentLanguage === "hinglish"
    ? `${clinicName} mein ${displayDoctorName} ke saath aapka experience kaisa raha?`
    : `How was your experience with ${displayDoctorName} at ${clinicName}?`;
  const initials = doctorName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  function toggleChoice(value: string, selected: string[], setSelected: (values: string[]) => void) {
    setValidationError("");
    if (selected.includes(value)) { setSelected(selected.filter((item) => item !== value)); return; }
    if (selected.length >= 3) { setValidationError(t.max); return; }
    setSelected([...selected, value]);
  }

  function advance(step: number, selected?: string[]) {
    if (selected && !selected.length) { setValidationError(t.selectOne); return; }
    setValidationError(""); setCurrentStep(step + 1);
    window.setTimeout(() => stepRefs.current[step]?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }

  async function generate() {
    if (currentStep !== 5 || !currentLanguage || eligibilityChecking || eligibilityError || !deviceToken) return;
    setLoading(true); setError("");
    const supabase = createClient();
    if (!supabase) { setError("Review generation is not configured."); setLoading(false); return; }
    const { data, error: invokeError } = await supabase.functions.invoke("generate-review", { body: { doctor_id: doctor.id, selected_keywords: selectedExperiences, selected_treatments: selectedServices, selected_treatment_keyword: selectedServices[0] || null, rating: 5, custom_notes: customNotes.trim() || null, language: currentLanguage, device_token: deviceToken, ...(patientLocation || {}) } });
    const returned = Array.isArray(data?.reviews) ? data.reviews.filter((review: unknown): review is string => typeof review === "string" && review.trim().length > 0).map((review: string) => review.trim()).slice(0, 5) : [];
    if (invokeError || data?.error || returned.length < 2) { setError(data?.error || invokeError?.message || "Unable to generate a review right now."); setLoading(false); return; }
    setReviews(returned); setLoading(false);
    if (scanId) void supabase.functions.invoke("mark-scan", { body: { scan_id: scanId, event: "generated" } });
    advance(5);
  }

  async function copyReview(review: string) {
    try {
      await navigator.clipboard.writeText(review);
      const supabase = createClient();
      if (supabase && scanId) void supabase.functions.invoke("mark-scan", { body: { scan_id: scanId, event: "copied" } });
      setCurrentStep(7);
      setShowThankYou(true);
    } catch { setError(t.copyError); }
  }

  function trackGoogleProceed() {
    if (!googleEnabled) return;
    const supabase = createClient();
    if (supabase && scanId) void supabase.functions.invoke("mark-scan", { body: { scan_id: scanId, event: "posted" } });
  }

  const Bubble = ({ children, orange = false }: { children: React.ReactNode; orange?: boolean }) => <div className={`absolute -top-14 left-4 z-10 max-w-[calc(100%-2rem)] rounded-2xl px-4 py-3 text-sm font-extrabold text-white shadow-xl ${orange ? "bg-[#F37021]" : "bg-[#0A4C95]"}`}><span className={`absolute -bottom-2 left-7 h-4 w-4 rotate-45 ${orange ? "bg-[#F37021]" : "bg-[#0A4C95]"}`} /> <span className="relative">{children}</span></div>;
  const levelClass = (step: number) => `relative scroll-mt-32 rounded-3xl border bg-white p-4 transition-all duration-300 sm:p-6 ${currentStep === step + 1 ? "z-30 border-[#0A4C95] opacity-100 ring-4 ring-[#0A4C95]/20 shadow-[0_18px_50px_rgba(10,76,149,.20)]" : "pointer-events-none z-10 border-slate-200 opacity-25"}`;
  const Chip = ({ value, selected, onClick }: { value: string; selected: boolean; onClick: () => void }) => <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-12 rounded-xl border-2 px-3 py-3 text-left text-sm font-extrabold capitalize leading-5 text-slate-950 transition active:scale-[.98] ${selected ? "border-[#0A4C95] bg-blue-50 text-[#0A4C95]" : "border-slate-300 bg-white"}`}><span className="flex items-center gap-2">{selected && <Check size={17} />}{value}</span></button>;
  const BrandHeader = () => <a href="/" className="relative z-50 mx-auto flex min-h-14 w-full max-w-xl flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black shadow-sm sm:text-base"><span className="text-[#0A4C95]">MediRank</span><span className="text-slate-700">by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span><ExternalLink size={14} className="ml-1 text-slate-500" /></a>;
  const BrandFooter = () => <footer className="relative z-50 px-3 py-6 text-center text-sm font-black text-slate-900"><a href="https://www.vyaparwallah.com/digital-marketing-for-doctors" target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-1 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200"><span>Powered by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span></a></footer>;

  if (!currentLanguage) return <main style={style} className="flex min-h-[100dvh] flex-col bg-[var(--patient-bg)] px-3 pt-3 text-slate-950 sm:px-5 sm:pt-5"><BrandHeader /><div className="mx-auto mt-5 w-full max-w-md rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"><div className="flex justify-between text-sm font-black"><span>Step 1/7</span><span className="text-[#0A4C95]">Review Spotlight</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[14.2857%] rounded-full bg-[#0A4C95]" /></div></div><div className="grid flex-1 place-items-center py-8"><section className="w-full max-w-md rounded-[2rem] border border-blue-100 bg-white p-6 text-center shadow-2xl sm:p-8"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#0A4C95] text-2xl text-white">🌐</span><p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-[#0A4C95]">MediRank</p><h1 className="mt-2 text-3xl font-black">Choose your language</h1><p className="mt-3 font-semibold leading-6 text-slate-700">Select the language you feel most comfortable with.</p><div className="mt-7 grid gap-3"><button type="button" onClick={() => { setCurrentLanguage("english"); setCurrentStep(2); }} className="min-h-16 rounded-2xl border-2 border-[#0A4C95] bg-white text-lg font-black text-slate-950 shadow-md transition active:scale-[.98]">🇬🇧 English</button><button type="button" onClick={() => { setCurrentLanguage("hinglish"); setCurrentStep(2); }} className="min-h-16 rounded-2xl bg-[#0A4C95] text-lg font-black text-white shadow-lg transition active:scale-[.98]">🇮🇳 Hinglish</button></div></section></div><BrandFooter /></main>;

  return <main style={style} className="min-h-[100dvh] bg-[var(--patient-bg)] pb-14 text-slate-950">
    <div className="pointer-events-none fixed inset-0 z-20 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
    <div className="relative z-50 px-3 pt-3 sm:px-5 sm:pt-5"><BrandHeader /></div>
    <div className="sticky top-0 z-40 mt-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl"><div className="mx-auto max-w-xl"><div className="flex justify-between text-sm font-black"><span>{t.step} {currentStep}/7</span><span className="text-[#0A4C95]">{t.quest}</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#0A4C95] transition-all duration-500" style={{ width: `${(currentStep / 7) * 100}%` }} /></div></div></div>
    <div className="mx-auto w-full max-w-xl space-y-20 px-3 pt-4 sm:px-5">
      <header className="relative z-30 rounded-3xl bg-white px-4 py-6 text-center shadow-xl">{doctor.logo_url ? <img src={doctor.logo_url} alt={clinicName} className="mx-auto h-16 w-16 rounded-2xl object-contain ring-1 ring-slate-200" /> : <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#0A4C95] text-xl font-black text-white">{initials}</span>}<p className="mt-3 text-sm font-black text-[#0A4C95]">{clinicName}</p><h1 className="mt-2 text-2xl font-black leading-relaxed">{visitQuestion}</h1><button type="button" onClick={() => setCurrentLanguage(null)} className="mt-4 min-h-12 px-3 text-sm font-bold text-[#0A4C95]">🌐 {currentLanguage === "english" ? "English" : "Hinglish"}</button></header>

      <section ref={(node) => { stepRefs.current[1] = node; }} className={levelClass(1)}><Bubble>{t.experienceBubble}</Bubble><h2 className="text-xl font-black">{t.experienceTitle}</h2><div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">{(experienceKeywords.length ? experienceKeywords : [t.generalExperience]).map((value) => <Chip key={value} value={value} selected={selectedExperiences.includes(value)} onClick={() => toggleChoice(value, selectedExperiences, setSelectedExperiences)} />)}</div><p className="mt-3 text-right text-sm font-black text-slate-900">{selectedExperiences.length}/3</p>{validationError && <p className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-900">{validationError}</p>}<button type="button" onClick={() => advance(2, selectedExperiences)} className="mt-4 min-h-12 w-full rounded-xl bg-[#0A4C95] px-5 font-black text-white">{t.next}</button></section>

      <section ref={(node) => { stepRefs.current[2] = node; }} className={levelClass(2)}><Bubble orange>{t.treatmentBubble}</Bubble><h2 className="text-xl font-black">{t.treatmentTitle}</h2><div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">{(topServices.length ? topServices : [doctor.specialization || t.consultation]).map((value) => <Chip key={value} value={value} selected={selectedServices.includes(value)} onClick={() => toggleChoice(value, selectedServices, setSelectedServices)} />)}</div><p className="mt-3 text-right text-sm font-black">{selectedServices.length}/3</p>{validationError && <p className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-900">{validationError}</p>}<button type="button" onClick={() => advance(3, selectedServices)} className="mt-4 min-h-12 w-full rounded-xl bg-[#0A4C95] px-5 font-black text-white">{t.next}</button></section>

      <section ref={(node) => { stepRefs.current[3] = node; }} className={levelClass(3)}><Bubble>{t.notesBubble}</Bubble><h2 className="text-xl font-black">{t.notesTitle} <span className="text-sm">({t.optional})</span></h2><textarea value={customNotes} onChange={(event) => setCustomNotes(event.target.value.slice(0, 500))} rows={4} maxLength={500} placeholder={t.notesPlaceholder} className="input mt-4 resize-y text-base text-slate-950 placeholder:text-slate-600" /><p className="mt-2 text-right text-xs font-black">{customNotes.length}/500</p><button type="button" onClick={() => advance(4)} className="mt-4 min-h-12 w-full rounded-xl bg-[#0A4C95] px-5 font-black text-white">{t.next}</button></section>

      <section ref={(node) => { stepRefs.current[4] = node; }} className={levelClass(4)}><Bubble orange>{t.generateBubble}</Bubble><h2 className="text-xl font-black">{t.generateTitle}</h2>{eligibilityChecking && <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-slate-100 p-3 text-sm font-bold"><Loader2 size={17} className="animate-spin" />{t.checking}</p>}{eligibilityError && <p className="mt-4 rounded-xl bg-amber-100 p-3 text-sm font-bold">{eligibilityError}</p>}{error && <p className="mt-4 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-900">{error}</p>}<button type="button" onClick={generate} disabled={loading || eligibilityChecking || !!eligibilityError} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4C95] px-5 font-black text-white shadow-[0_0_24px_rgba(10,76,149,.45)] disabled:opacity-40">{loading ? <><Loader2 size={20} className="animate-spin" />{t.generating}</> : <><Sparkles size={20} />{t.generate}</>}</button></section>

      <section ref={(node) => { stepRefs.current[5] = node; }} className={levelClass(5)}><Bubble>{t.draftsBubble}</Bubble><h2 className="text-xl font-black">{t.draftsTitle}</h2>{error && <p className="mt-4 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-900">{error}</p>}<div className="mt-4 space-y-4">{reviews.map((review, index) => <article key={index} className="rounded-2xl border-2 border-slate-200 p-4"><div className="flex gap-1 text-[#F37021]">{Array.from({ length: 5 }).map((_, star) => <Star key={star} fill="currentColor" size={14} />)}</div><p className="mt-3 text-base font-semibold leading-7">{review}</p><button type="button" onClick={() => void copyReview(review)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4C95] px-4 font-black text-white"><Clipboard size={18} />{t.copyReview}</button></article>)}</div></section>
    </div>
    <BrandFooter />

    {showThankYou && <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-slate-950/70 px-3 pt-3 backdrop-blur-md sm:px-5 sm:pt-5" role="dialog" aria-modal="true" aria-label={t.thankTitle}><BrandHeader /><div className="grid flex-1 place-items-center py-5"><section className="w-full max-w-md rounded-[2rem] bg-white p-6 text-center shadow-2xl sm:p-8"><ThankYouAnimation /><h2 className="text-2xl font-black text-slate-950">{t.thankTitle}</h2><p className="mt-3 font-bold leading-6 text-slate-900">{t.thankBody}</p>{doctor.gmb_review_link ? <a href={googleEnabled ? doctor.gmb_review_link : undefined} target="_blank" rel="noreferrer" aria-disabled={!googleEnabled} onClick={(event) => { if (!googleEnabled) event.preventDefault(); else trackGoogleProceed(); }} className={`mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-center font-black text-white transition ${googleEnabled ? "bg-[#0A4C95] shadow-[0_0_25px_rgba(10,76,149,.4)]" : "cursor-wait bg-slate-400"}`}>{googleEnabled ? <>{t.google}<ExternalLink size={18} /></> : <><Loader2 size={19} className="animate-spin" />{t.preparing}</>}</a> : <p className="mt-6 rounded-xl bg-amber-100 p-4 font-bold">{t.noGoogle}</p>}</section></div><BrandFooter /></div>}
  </main>;
}
