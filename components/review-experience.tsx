"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Clipboard, ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Language = "english" | "hinglish";
type Theme = { primary?: string; accent?: string; background?: string };
type Doctor = { id: string; doctor_name: string; clinic_name: string; specialization: string | null; gmb_review_link: string | null; logo_url?: string | null; theme_config?: Theme | null };
type Location = { latitude: number; longitude: number };
type RoutingState = { operationalScanSequence: number; allowLanguageStep: boolean; allowDetailForm: boolean };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ThankYouAnimation = dynamic(() => import("./thank-you-animation"), { ssr: false });
const fallbackTheme = { primary: "#0A4C95", accent: "#F37021", background: "#F8FAFC" };
const MIN_DETAIL_CHIPS = 2;
const fallbackReviews: Record<Language, string[]> = {
  english: [
    "My clinic visit went well overall.\nThe doctor explained things clearly and the staff was polite.\nI felt comfortable through the appointment.",
    "The appointment was comfortable and well managed.\nThe team handled things smoothly, and the doctor answered my concerns.\nOverall it felt simple and reassuring.",
    "I visited with a few doubts in mind.\nThe doctor listened patiently and explained the next steps clearly.\nThe clinic experience felt calm and professional.",
    "The clinic felt clean and organised.\nThe staff was polite, and the doctor guided me properly.\nOverall, it was a positive visit.",
  ],
  hinglish: [
    "Clinic visit ka experience kaafi acha raha.\nStaff helpful tha aur doctor ne baat clearly samjhai.\nOverall mujhe comfortable feel hua.",
    "Mera visit smooth raha.\nDoctor ne calmly guide kiya, zyada rush jaisa feel nahi hua.\nClinic ka environment bhi neat tha.",
    "Aaj ka visit genuinely theek laga.\nStaff ne process simple rakha aur doctor se baat karke confidence aaya.\nMain overall satisfied hoon.",
    "Clinic mein experience acha tha.\nDoctor aur team ne concerns dhyan se sune.\nFollow-up ke liye bhi clear guidance mili.",
  ],
};
const copy = {
  english: {
    chooseLanguage: "Choose your language",
    languageHint: "Select the language you feel most comfortable with.",
    detailTitle: "Add visit details",
    detailHint: "Pick at least 2 highlights. Name and locality are optional.",
    name: "Name",
    locality: "Locality",
    namePlaceholder: "Your name",
    localityPlaceholder: "Area or neighbourhood",
    chipsTitle: "Pick visit highlights",
    chipsHint: "These options are managed by the clinic.",
    minChips: "Select at least 2 highlights to continue.",
    generating: "Writing your drafts...",
    draftsTitle: "Choose your favorite draft",
    copyReview: "Copy Review",
    thankTitle: "Thank you for visiting!",
    thankBody: "Your review is copied safely.",
    preparing: "Preparing Google Maps...",
    google: "Open Google Maps to Paste Review",
    noGoogle: "Google Maps link is not configured for this clinic.",
    empty: "Select a rating and highlights to generate review options.",
  },
  hinglish: {
    chooseLanguage: "Apni language chunein",
    languageHint: "Jis language mein aap comfortable hain, use select karein.",
    detailTitle: "Visit details add karein",
    detailHint: "Kam se kam 2 highlights select karein. Name aur locality optional hain.",
    name: "Name",
    locality: "Locality",
    namePlaceholder: "Aapka name",
    localityPlaceholder: "Area ya neighbourhood",
    chipsTitle: "Visit highlights chunein",
    chipsHint: "Ye options clinic dashboard se aate hain.",
    minChips: "Aage badhne ke liye kam se kam 2 highlights select karein.",
    generating: "Aapke drafts ban rahe hain...",
    draftsTitle: "Apna favorite draft chunein",
    copyReview: "Review Copy Karein",
    thankTitle: "Visit karne ke liye dhanyavaad!",
    thankBody: "Aapka review safely copy ho gaya hai.",
    preparing: "Google Maps taiyaar ho raha hai...",
    google: "Google Maps kholein aur review paste karein",
    noGoogle: "Is clinic ka Google Maps link configure nahi hai.",
    empty: "Rating aur highlights select karke review options generate karein.",
  },
} as const;

const unique = (items: string[]) => Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
const sanitizeText = (value: string, maxLength: number) => value
  .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, " ")
  .replace(/\b(?:javascript|data|vbscript):/gi, " ")
  .replace(/[<>{}`\\]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);
const titleCase = (value: string) => value.trim().split(/\s+/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}` : "").join(" ");
const pickFallbackReviews = (language: Language) => {
  const source = fallbackReviews[language];
  const offset = Math.floor(Math.random() * source.length);
  return Array.from({ length: 4 }, (_, index) => source[(offset + index) % source.length]);
};

export function ReviewExperience({
  doctor,
  experienceKeywords,
  topServices,
  scanId,
  routingState,
  isStarter: _isStarter,
  isGrowth: _isGrowth,
}: {
  doctor: Doctor;
  experienceKeywords: string[];
  topServices: string[];
  scanId: string | null;
  routingState?: RoutingState;
  isStarter: boolean;
  isGrowth: boolean;
}) {
  const theme = { ...fallbackTheme, ...doctor.theme_config };
  const style = { "--patient-primary": theme.primary, "--patient-accent": theme.accent, "--patient-bg": theme.background } as CSSProperties;
  const allowLanguageStep = routingState?.allowLanguageStep ?? true;
  const allowDetailForm = routingState?.allowDetailForm ?? true;
  const initialLanguage: Language | null = allowLanguageStep ? null : "english";
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(initialLanguage);
  const [keywordOptions, setKeywordOptions] = useState<string[]>(() => unique([...experienceKeywords, ...topServices]));
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState("");
  const [patientName, setPatientName] = useState("");
  const [patientLocality, setPatientLocality] = useState("");
  const [reviews, setReviews] = useState<string[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [patientLocation, setPatientLocation] = useState<Location | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [analyticsDoctorId, setAnalyticsDoctorId] = useState("");
  const [analyticsScanId, setAnalyticsScanId] = useState(scanId);
  const analyticsDoctorIdRef = useRef("");
  const analyticsScanIdRef = useRef<string | null>(scanId);
  const scanInitializedRef = useRef(false);
  const draftsSectionRef = useRef<HTMLElement | null>(null);
  const autoGenerationKeyRef = useRef("");

  const t = currentLanguage ? copy[currentLanguage] : copy.english;
  const doctorName = titleCase(doctor.doctor_name.replace(/^dr\.?\s*/i, ""));
  const clinicName = doctor.clinic_name.trim();
  const displayDoctorName = `Dr. ${doctorName}`;
  const visitQuestion = currentLanguage === "hinglish"
    ? `${clinicName} mein ${displayDoctorName} ke saath aapka experience kaisa raha?`
    : `How was your experience with ${displayDoctorName} at ${clinicName}?`;
  const initials = doctorName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const chipOptions = useMemo(() => unique(keywordOptions).slice(0, 18), [keywordOptions]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    if (!supabase || !uuidPattern.test(doctor.id)) return;
    void supabase
      .from("doctor_keywords")
      .select("keyword,category")
      .eq("doctor_id", doctor.id)
      .order("created_at")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Review keyword lookup failed", error);
          return;
        }
        const dynamicKeywords = unique((data || []).map((row) => typeof row.keyword === "string" ? row.keyword : ""));
        if (dynamicKeywords.length) setKeywordOptions(dynamicKeywords);
      });
    return () => { cancelled = true; };
  }, [doctor.id]);

  useEffect(() => {
    try {
      const token = localStorage.getItem("medirank_device_token") || crypto.randomUUID();
      localStorage.setItem("medirank_device_token", token);
      setDeviceToken(token);
    } catch {
      setDeviceToken(crypto.randomUUID());
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setPatientLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
      );
    }
  }, []);

  useEffect(() => {
    const nextDoctorId = uuidPattern.test(doctor.id) ? doctor.id : "";
    analyticsDoctorIdRef.current = nextDoctorId;
    setAnalyticsDoctorId(nextDoctorId);
  }, [doctor.id]);

  useEffect(() => {
    if (scanInitializedRef.current || !analyticsDoctorId) return;
    scanInitializedRef.current = true;
    void logAnalyticsEvent("scan");
  }, [analyticsDoctorId]);

  useEffect(() => {
    if (!showThankYou) { setGoogleEnabled(false); return; }
    const timer = window.setTimeout(() => setGoogleEnabled(true), 1500);
    return () => window.clearTimeout(timer);
  }, [showThankYou]);

  useEffect(() => {
    if (!currentLanguage || loading || selectedChips.length !== MIN_DETAIL_CHIPS) return;
    const generationKey = `${selectedChips.join("|")}:${selectedRating ?? "default"}`;
    if (autoGenerationKeyRef.current === generationKey) return;
    autoGenerationKeyRef.current = generationKey;
    scrollDraftsIntoView();
    void generate(selectedRating ?? 5);
  }, [currentLanguage, loading, selectedChips, selectedRating]);

  function rememberScanId(nextScanId?: string) {
    if (!nextScanId) return;
    analyticsScanIdRef.current = nextScanId;
    setAnalyticsScanId(nextScanId);
  }

  function toggleChip(value: string) {
    setValidationError("");
    const safeValue = sanitizeText(value, 80);
    if (!safeValue) return;
    setSelectedChips((current) => current.includes(safeValue) ? current.filter((item) => item !== safeValue) : [...current, safeValue].slice(0, 5));
  }

  function scrollDraftsIntoView() {
    window.setTimeout(() => draftsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function generate(ratingOverride: number = selectedRating ?? 5) {
    if (!currentLanguage || loading) return;
    const chips = unique(selectedChips.map((chip) => sanitizeText(chip, 80))).slice(0, 5);
    if (chips.length < MIN_DETAIL_CHIPS) {
      setValidationError(t.minChips);
      return;
    }
    setLoading(true);
    setValidationError("");
    setReviews([]);
    setSelectedChips(chips);
    scrollDraftsIntoView();
    const token = deviceToken || crypto.randomUUID();
    if (!deviceToken) setDeviceToken(token);
    const fallback = pickFallbackReviews(currentLanguage);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Review generation is not configured.");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          doctor_id: doctor.id,
          scan_id: analyticsScanId,
          selected_chips: chips,
          selected_keywords: chips,
          selected_experiences: chips,
          selected_chip: chips[0],
          rating: ratingOverride,
          custom_notes: sanitizeText(customNotes, 240) || null,
          patient_name: allowDetailForm ? sanitizeText(patientName, 60) || null : null,
          patient_locality: allowDetailForm ? sanitizeText(patientLocality, 60) || null : null,
          language: currentLanguage,
          device_token: token,
          ...(patientLocation || {}),
        }),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeout));
      const responseText = await response.text();
      if (!response.ok) console.error("generate-review non-ok response", { status: response.status, body: responseText });
      let data: Record<string, unknown> = {};
      try { data = responseText ? JSON.parse(responseText) as Record<string, unknown> : {}; } catch (error) { console.error("generate-review invalid JSON response", error); }
      const returned = Array.isArray(data.reviews) ? data.reviews.filter((review: unknown): review is string => typeof review === "string" && review.trim().length > 0).map((review) => review.trim()).slice(0, 4) : [];
      const quality = data.quality && typeof data.quality === "object" ? data.quality as Record<string, unknown> : {};
      setReviewRating(typeof quality.generated_rating === "number" ? quality.generated_rating : ratingOverride);
      setReviews(!response.ok || returned.length < 2 ? fallback : returned);
      scrollDraftsIntoView();
      const supabase = createClient();
      if (supabase && analyticsScanIdRef.current) void supabase.functions.invoke("mark-scan", { body: { scan_id: analyticsScanIdRef.current, event: "generated" } });
    } catch (error) {
      console.error("generate-review request failed; using local fallback", error);
      setReviewRating(ratingOverride);
      setReviews(fallback);
      scrollDraftsIntoView();
    } finally {
      setLoading(false);
    }
  }

  async function logAnalyticsEvent(eventType: "scan" | "copy" | "click_maps") {
    const doctorId = analyticsDoctorIdRef.current;
    if (!uuidPattern.test(doctorId)) return;
    try {
      const response = await fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctor_id: doctorId, scan_id: analyticsScanIdRef.current, event_type: eventType }),
        keepalive: eventType === "click_maps",
      });
      if (response.ok) {
        const result = await response.json() as { scan_id?: string };
        rememberScanId(result.scan_id);
        window.dispatchEvent(new CustomEvent("medirank:analytics-event", { detail: { eventType } }));
        localStorage.setItem("medirank_analytics_pulse", `${Date.now()}:${eventType}`);
      }
    } catch (error) {
      console.error("Analytics event request failed", { eventType, error });
    }
  }

  async function copyReview(review: string) {
    try {
      await navigator.clipboard.writeText(review);
      void logAnalyticsEvent("copy");
      const supabase = createClient();
      if (supabase && analyticsScanIdRef.current) void supabase.functions.invoke("mark-scan", { body: { scan_id: analyticsScanIdRef.current, event: "copied" } });
      setShowThankYou(true);
    } catch (error) {
      console.error("Clipboard access was blocked.", error);
    }
  }

  function trackGoogleProceed() {
    if (!googleEnabled) return;
    void logAnalyticsEvent("click_maps");
    const supabase = createClient();
    if (supabase && analyticsScanIdRef.current) void supabase.functions.invoke("mark-scan", { body: { scan_id: analyticsScanIdRef.current, event: "posted" } });
  }

  const BrandHeader = () => <a href="/" className="relative z-50 mx-auto flex min-h-12 w-full max-w-xl flex-nowrap items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-2xl border border-slate-200 bg-white px-2 text-xs font-black shadow-sm sm:min-h-14 sm:px-3 sm:text-base"><span className="text-[#0A4C95]">MediRank</span><span className="text-slate-700">by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span><ExternalLink size={14} className="ml-0.5 shrink-0 text-slate-500" /></a>;
  const BrandFooter = () => <footer className="relative z-50 px-2 py-5 text-center text-xs font-black text-slate-900 sm:px-3 sm:py-6 sm:text-sm"><a href="https://www.vyaparwallah.com/digital-marketing-for-doctors" target="_blank" rel="noreferrer" className="inline-flex min-h-11 max-w-full items-center gap-1 overflow-hidden rounded-xl bg-white px-3 shadow-sm ring-1 ring-slate-200 sm:min-h-12 sm:px-4"><span>Powered by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span></a></footer>;
  const GoogleStar = ({ active, size = 34 }: { active: boolean; size?: number }) => <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className="block transition-transform duration-75 ease-out group-active:scale-90"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={active ? "#F4B400" : "transparent"} stroke={active ? "#F4B400" : "#B8C0CC"} strokeWidth="1.8" strokeLinejoin="round" /></svg>;

  if (!currentLanguage) return <main style={style} className="flex min-h-[100dvh] flex-col bg-[var(--patient-bg)] px-2 pt-2 text-slate-950 sm:px-5 sm:pt-5"><BrandHeader /><div className="grid flex-1 place-items-center py-5 sm:py-8"><section className="w-full max-w-md rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-2xl sm:rounded-[2rem] sm:p-8"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#0A4C95] text-xl font-black text-white sm:h-16 sm:w-16 sm:text-2xl">Aa</span><p className="mt-4 text-xs font-black uppercase tracking-[.16em] text-[#0A4C95] sm:mt-5 sm:tracking-[.2em]">MediRank</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">{t.chooseLanguage}</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-700 sm:mt-3 sm:text-base">{t.languageHint}</p><div className="mt-6 grid gap-2.5 sm:mt-7 sm:gap-3"><button type="button" onClick={() => setCurrentLanguage("english")} className="min-h-14 rounded-2xl border-2 border-[#0A4C95] bg-white text-base font-black text-slate-950 shadow-md transition active:scale-[.98] sm:min-h-16 sm:text-lg">English</button><button type="button" onClick={() => setCurrentLanguage("hinglish")} className="min-h-14 rounded-2xl bg-[#0A4C95] text-base font-black text-white shadow-lg transition active:scale-[.98] sm:min-h-16 sm:text-lg">Hinglish</button></div></section></div><BrandFooter /></main>;

  return <main style={style} className="min-h-[100dvh] overflow-x-hidden bg-[var(--patient-bg)] pb-10 text-slate-950 sm:pb-14">
    <div className="pointer-events-none fixed inset-0 z-20 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
    <div className="relative z-50 px-2 pt-2 sm:px-5 sm:pt-5"><BrandHeader /></div>
    <div className="mx-auto w-full max-w-xl space-y-5 px-2 pt-3 sm:space-y-8 sm:px-5 sm:pt-4">
      <header className="relative z-30 rounded-3xl bg-white px-3 py-5 text-center shadow-xl sm:px-4 sm:py-6">{doctor.logo_url ? <img src={doctor.logo_url} alt={clinicName} className="mx-auto h-14 w-14 rounded-2xl object-contain ring-1 ring-slate-200 sm:h-16 sm:w-16" /> : <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#0A4C95] text-lg font-black text-white sm:h-16 sm:w-16 sm:text-xl">{initials}</span>}<p className="mt-3 break-words text-xs font-black text-[#0A4C95] sm:text-sm">{clinicName}</p><h1 className="mt-2 text-xl font-black leading-snug sm:text-2xl sm:leading-relaxed">{visitQuestion}</h1>{allowLanguageStep && <button type="button" onClick={() => setCurrentLanguage(null)} className="mt-3 min-h-10 px-3 text-sm font-bold text-[#0A4C95] sm:mt-4 sm:min-h-12">{currentLanguage === "english" ? "English" : "Hinglish"}</button>}</header>

      <section className="relative z-30 rounded-3xl border border-blue-100 bg-white p-4 shadow-xl sm:p-6"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.14em] text-[#0A4C95] sm:tracking-[.18em]">Tap your rating</p><div className="mt-3 flex justify-center gap-1.5 sm:mt-4 sm:gap-2" role="radiogroup" aria-label="Select star rating" onMouseLeave={() => setHoverRating(null)}>{Array.from({ length: 5 }).map((_, index) => { const value = index + 1; const previewRating = hoverRating ?? selectedRating ?? 0; return <button key={value} type="button" role="radio" aria-checked={selectedRating === value} onMouseEnter={() => setHoverRating(value)} onFocus={() => setHoverRating(value)} onBlur={() => setHoverRating(null)} onClick={() => setSelectedRating(value)} className="group grid h-10 w-10 place-items-center rounded-full transition-colors duration-75 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4] active:bg-slate-200 sm:h-11 sm:w-11"><GoogleStar active={value <= previewRating} /></button>; })}</div><p className="mt-2 min-h-5 text-sm font-extrabold text-slate-700">{selectedRating ? selectedRating >= 5 ? "Loved it" : selectedRating === 4 ? "Good, with small feedback" : "Needs improvement" : "Select your rating"}</p></div></section>

      <section className="relative z-30 rounded-3xl border border-blue-100 bg-white p-4 shadow-xl sm:p-6">
        {allowDetailForm && <><h2 className="text-lg font-black sm:text-xl">{t.detailTitle}</h2><p className="mt-1 text-sm font-semibold leading-5 text-slate-600">{t.detailHint}</p><div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2 sm:gap-4"><div><label className="label">{t.name}</label><input value={patientName} onChange={(event) => setPatientName(sanitizeText(event.target.value, 60))} className="input" placeholder={t.namePlaceholder} maxLength={60} /></div><div><label className="label">{t.locality}</label><input value={patientLocality} onChange={(event) => setPatientLocality(sanitizeText(event.target.value, 60))} className="input" placeholder={t.localityPlaceholder} maxLength={60} /></div></div></>}
        <div className={allowDetailForm ? "mt-5" : ""}><div className="flex items-end justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-black sm:text-xl">{t.chipsTitle}</h2><p className="mt-1 text-xs font-bold leading-5 text-slate-500">{allowDetailForm ? t.chipsHint : "Select at least 2 active dashboard keywords."}</p></div><span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0A4C95]">{selectedChips.length}/{MIN_DETAIL_CHIPS}</span></div><div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:mt-4 sm:gap-2.5">{chipOptions.map((value) => <button key={value} type="button" disabled={loading} aria-pressed={selectedChips.includes(value)} onClick={() => toggleChip(value)} className={`min-h-12 rounded-2xl border-2 px-3 py-2.5 text-left text-sm font-black leading-5 transition active:scale-[.98] disabled:opacity-60 sm:min-h-14 sm:px-4 sm:py-3 ${selectedChips.includes(value) ? "border-[#0A4C95] bg-blue-50 text-[#0A4C95] shadow-md" : "border-slate-200 bg-white text-slate-950 shadow-sm"}`}><span className="flex min-w-0 items-center gap-2 break-words">{selectedChips.includes(value) && <Check size={17} className="shrink-0" />}{value}</span></button>)}</div></div>
        {validationError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700">{validationError}</p>}
        {loading && <div className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 text-sm font-black text-[#0A4C95]"><Loader2 size={18} className="animate-spin" />{t.generating}</div>}
      </section>

      <section ref={draftsSectionRef} className="relative z-30 scroll-mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-xl sm:scroll-mt-6 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-lg font-black sm:text-xl">{t.draftsTitle}</h2>{selectedChips.length > 0 && <p className="mt-1 break-words text-xs font-bold leading-5 text-slate-500 sm:text-sm">{selectedChips.join(", ")} - {reviewRating} star tone</p>}</div>{loading && <Loader2 size={22} className="shrink-0 animate-spin text-[#0A4C95]" />}</div>{loading ? <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4" aria-live="polite">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="rounded-2xl border border-slate-200 p-3 sm:p-4"><div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" /><div className="mt-4 space-y-2"><div className="h-3 w-full animate-pulse rounded-full bg-slate-100" /><div className="h-3 w-11/12 animate-pulse rounded-full bg-slate-100" /><div className="h-3 w-8/12 animate-pulse rounded-full bg-slate-100" /></div><div className="mt-4 h-10 animate-pulse rounded-xl bg-blue-50 sm:h-11" /></div>)}</div> : reviews.length ? <div className="mt-4 space-y-3 sm:space-y-4">{reviews.map((review, index) => <article key={index} className="rounded-2xl border-2 border-slate-200 p-3 sm:p-4"><div className="flex gap-1.5">{Array.from({ length: 5 }).map((_, star) => <GoogleStar key={star} active={star < reviewRating} size={16} />)}</div><p className="mt-3 whitespace-pre-line break-words text-sm font-semibold leading-6 sm:text-base sm:leading-7">{review}</p><button type="button" onClick={() => void copyReview(review)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0A4C95] px-3 text-sm font-black text-white sm:min-h-12 sm:px-4 sm:text-base"><Clipboard size={18} />{t.copyReview}</button></article>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500 sm:mt-5 sm:p-6">{t.empty}</div>}</section>
    </div>
    <BrandFooter />

    {showThankYou && <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-slate-950/70 px-3 pt-3 backdrop-blur-md sm:px-5 sm:pt-5" role="dialog" aria-modal="true" aria-label={t.thankTitle}><BrandHeader /><div className="grid flex-1 place-items-center py-5"><section className="w-full max-w-md rounded-[2rem] bg-white p-6 text-center shadow-2xl sm:p-8"><ThankYouAnimation /><h2 className="text-2xl font-black text-slate-950">{t.thankTitle}</h2><p className="mt-3 font-bold leading-6 text-slate-900">{t.thankBody}</p>{doctor.gmb_review_link ? <a href={googleEnabled ? doctor.gmb_review_link : undefined} target="_blank" rel="noreferrer" aria-disabled={!googleEnabled} onClick={(event) => { if (!googleEnabled) event.preventDefault(); else trackGoogleProceed(); }} className={`mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-center font-black text-white transition ${googleEnabled ? "bg-[#0A4C95] shadow-[0_0_25px_rgba(10,76,149,.4)]" : "cursor-wait bg-slate-400"}`}>{googleEnabled ? <>{t.google}<ExternalLink size={18} /></> : <><Loader2 size={19} className="animate-spin" />{t.preparing}</>}</a> : <p className="mt-6 rounded-xl bg-amber-100 p-4 font-bold">{t.noGoogle}</p>}</section></div><BrandFooter /></div>}
  </main>;
}
