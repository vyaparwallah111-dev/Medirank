"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Clipboard, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Language = "english" | "hinglish";
type Theme = { primary?: string; accent?: string; background?: string };
type Doctor = { id: string; doctor_name: string; clinic_name: string; specialization: string | null; gmb_review_link: string | null; logo_url?: string | null; theme_config?: Theme | null };
type Location = { latitude: number; longitude: number };
type RoutingState = { operationalScanSequence: number; allowLanguageStep: boolean };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ThankYouAnimation = dynamic(() => import("./thank-you-animation"), { ssr: false });
const fallbackTheme = { primary: "#0A4C95", accent: "#F37021", background: "#F8FAFC" };
const MIN_DETAIL_CHIPS = 2;
// NOTE: There is deliberately no hardcoded local fallback review text anymore. Showing a patient a
// pre-written template when generation fails is misleading - they'd see a "review" that never came
// from AI at all. On failure we now show a clear status message + Try Again button instead (see
// GENERATION_BUSY_MESSAGE below and the generationFailed state in ReviewExperience).
const GENERATION_BUSY_MESSAGE = "Our AI review assistant is a bit busy right now. Please try again in a moment.";
const copy = {
  english: {
    chooseLanguage: "Choose your language",
    languageHint: "Select the language you feel most comfortable with.",
    ratingStepTitle: "Tap your rating",
    chipsTitle: "Pick visit highlights",
    chipsHint: "These options are managed by the clinic.",
    minChips: "Select at least 2 highlights to continue.",
    ratingRequired: "Please select your star rating first.",
    generating: "Writing your drafts...",
    generatingSlow: "Still working on it, almost there...",
    draftsTitle: "Choose your favorite draft",
    copyReview: "Copy Review",
    thankTitle: "Thank you for visiting!",
    thankBody: "Your review is copied safely.",
    preparing: "Preparing Google Maps...",
    google: "Open Google Maps to Paste Review",
    noGoogle: "Google Maps link is not configured for this clinic.",
    empty: "Select a rating and highlights to generate review options.",
    next: "Next",
    back: "Back",
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  },
  hinglish: {
    chooseLanguage: "Apni language chunein",
    languageHint: "Jis language mein aap comfortable hain, use select karein.",
    ratingStepTitle: "Apni rating dein",
    chipsTitle: "Visit highlights chunein",
    chipsHint: "Ye options clinic dashboard se aate hain.",
    minChips: "Aage badhne ke liye kam se kam 2 highlights select karein.",
    ratingRequired: "Pehle apni star rating select karein.",
    generating: "Aapke drafts ban rahe hain...",
    generatingSlow: "Thoda time lag raha hai, bas ho hi gaya...",
    draftsTitle: "Apna favorite draft chunein",
    copyReview: "Review Copy Karein",
    thankTitle: "Visit karne ke liye dhanyavaad!",
    thankBody: "Aapka review safely copy ho gaya hai.",
    preparing: "Google Maps taiyaar ho raha hai...",
    google: "Google Maps kholein aur review paste karein",
    noGoogle: "Is clinic ka Google Maps link configure nahi hai.",
    empty: "Rating aur highlights select karke review options generate karein.",
    next: "Aage",
    back: "Peeche",
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
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
  const initialLanguage: Language | null = allowLanguageStep ? null : "english";
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(initialLanguage);
  const [keywordOptions, setKeywordOptions] = useState<string[]>(() => unique([...experienceKeywords, ...topServices]));
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [customNotes, setCustomNotes] = useState("");
  // Each draft's own generated_reviews.id (nullable - persistence can fail without blocking the
  // patient's review, in which case copy-selection just can't be tracked for that one draft).
  const [reviews, setReviews] = useState<{ id: string | null; content: string }[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [patientLocation, setPatientLocation] = useState<Location | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [analyticsDoctorId, setAnalyticsDoctorId] = useState("");
  const [analyticsScanId, setAnalyticsScanId] = useState(scanId);
  // Step-based flow (1 = rating, 2 = chips, 3 = loading/drafts) - only one step is visible at a
  // time so the patient never has to scroll through a long stacked form (language selection, when
  // shown, is its own full-screen gate before this and isn't counted in `step`).
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const totalSteps = allowLanguageStep ? 4 : 3;
  const stepNumber = (allowLanguageStep ? 1 : 0) + step;
  const analyticsDoctorIdRef = useRef("");
  const analyticsScanIdRef = useRef<string | null>(scanId);
  const scanInitializedRef = useRef(false);
  const draftsSectionRef = useRef<HTMLElement | null>(null);

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
      .select("keyword,category,is_active")
      .eq("doctor_id", doctor.id)
      .eq("is_active", true)
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
        (error) => console.debug('Geolocation unavailable (non-blocking):', error.code),
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300_000 }, // Non-blocking, reduced timeout
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
    if (!loading) { setLoadingSlow(false); return; }
    // A single successful attempt typically finishes in a few seconds; if we're still waiting past
    // that, it usually means the internal retry kicked in. Reassure the patient it's still working
    // rather than let the spinner sit there looking stuck.
    const timer = window.setTimeout(() => setLoadingSlow(true), 4500);
    return () => window.clearTimeout(timer);
  }, [loading]);

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

  function selectRating(value: number) {
    setHoverRating(null);
    setSelectedRating(value);
    setValidationError("");
  }

  function scrollToTop() {
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }

  function goToStep(next: 1 | 2 | 3) {
    setStep(next);
    setValidationError("");
    scrollToTop();
  }

  function proceedToChips() {
    if (!selectedRating) { setValidationError(t.ratingRequired); return; }
    goToStep(2);
  }

  function proceedToDrafts() {
    const chips = unique(selectedChips.map((chip) => sanitizeText(chip, 80))).slice(0, 5);
    if (chips.length < MIN_DETAIL_CHIPS) { setValidationError(t.minChips); return; }
    setSelectedChips(chips);
    goToStep(3);
    void generate(selectedRating ?? 0, chips);
  }

  async function generate(ratingOverride: number, chips: string[]) {
    if (!currentLanguage || loading) return;
    setLoading(true);
    setValidationError("");
    setGenerationFailed(false);
    setReviews([]);
    const token = deviceToken || crypto.randomUUID();
    if (!deviceToken) setDeviceToken(token);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Review generation is not configured.");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 20000); // 20 seconds (allows for DB queries + Gemini + one internal retry)
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
      // Backend now returns reviews as {id, content}[] (id = the generated_reviews row, used to
      // record which draft the patient actually copies - see copyReview). id may be null if
      // persistence failed without blocking generation; content is always required.
      const returned = Array.isArray(data.reviews)
        ? data.reviews
          .filter((review: unknown): review is { id?: unknown; content?: unknown } => !!review && typeof review === "object")
          .map((review) => ({ id: typeof review.id === "string" ? review.id : null, content: typeof review.content === "string" ? review.content.trim() : "" }))
          .filter((review) => review.content.length > 0)
          .slice(0, 3)
        : [];
      // Backend contract: {success:true, reviews:[...]} on real AI output, {success:false, error} on
      // any failure (Gemini down, both retries exhausted, bad request, etc). Never trust a partial
      // or malformed payload as a success - if it isn't explicitly success:true with 3 reviews, treat
      // it as a failure and show the "try again" state rather than guessing at fallback text.
      if (response.ok && data.success === true && returned.length === 3) {
        const quality = data.quality && typeof data.quality === "object" ? data.quality as Record<string, unknown> : {};
        setReviewRating(typeof quality.generated_rating === "number" ? quality.generated_rating : ratingOverride);
        setReviews(returned);
        setGenerationFailed(false);
        const supabase = createClient();
        if (supabase && analyticsScanIdRef.current) void supabase.functions.invoke("mark-scan", { body: { scan_id: analyticsScanIdRef.current, event: "generated" } });
      } else {
        setReviews([]);
        setGenerationFailed(true);
      }
    } catch (error) {
      console.error("generate-review request failed", error);
      setReviews([]);
      setGenerationFailed(true);
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

  async function copyReview(review: { id: string | null; content: string }) {
    try {
      await navigator.clipboard.writeText(review.content);
      void logAnalyticsEvent("copy");
      const supabase = createClient();
      if (supabase && analyticsScanIdRef.current) void supabase.functions.invoke("mark-scan", { body: { scan_id: analyticsScanIdRef.current, event: "copied" } });
      // Records exactly which of the 3 drafts got copied (id references the generated_reviews row,
      // which already carries rating/language/keywords from generation time) - separate from the
      // "copy" analytics_events row above, which only says a copy happened at all, not which draft.
      if (review.id && uuidPattern.test(doctor.id)) {
        void fetch("/api/analytics/select-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doctor_id: doctor.id, review_id: review.id }),
        }).catch((error) => console.error("Select-review tracking failed", error));
      }
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

  const BrandHeader = () => <a href="/" className="relative z-50 mx-auto flex min-h-10 w-full max-w-xl flex-nowrap items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap rounded-xl border border-slate-200 bg-white px-1.5 text-xs font-black shadow-sm sm:min-h-14 sm:gap-1 sm:px-3 sm:rounded-2xl sm:text-base"><span className="text-[#0A4C95]">MediRank</span><span className="text-slate-700">by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span><ExternalLink size={12} className="ml-0.5 shrink-0 text-slate-500 sm:size-[14px]" /></a>;
  const BrandFooter = () => <footer className="relative z-50 px-4 py-3 text-center text-xs font-black text-slate-900 sm:px-5 sm:py-6 sm:text-sm"><a href="https://www.vyaparwallah.com/digital-marketing-for-doctors" target="_blank" rel="noreferrer" className="inline-flex min-h-9 max-w-full items-center gap-0.5 overflow-hidden rounded-lg bg-white px-2.5 shadow-sm ring-1 ring-slate-200 sm:min-h-12 sm:gap-1 sm:px-4 sm:rounded-xl"><span>Powered by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span></a></footer>;
  const GoogleStar = ({ active, size = 34 }: { active: boolean; size?: number }) => <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className="block transition-transform duration-75 ease-out group-active:scale-90"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={active ? "#F4B400" : "transparent"} stroke={active ? "#F4B400" : "#B8C0CC"} strokeWidth="1.8" strokeLinejoin="round" /></svg>;
  // Step indicator dots - shown on every screen (including the language picker, which is always
  // step 1 when it's shown at all) so the patient always knows how much of the flow is left.
  const StepDots = ({ current }: { current: number }) => <div className="flex items-center justify-center gap-1.5" role="status"><span className="sr-only">{t.stepOf(current, totalSteps)}</span>{Array.from({ length: totalSteps }).map((_, index) => <span key={index} aria-hidden="true" className={`h-1.5 rounded-full transition-all ${index + 1 === current ? "w-6 bg-[#0A4C95]" : "w-1.5 bg-slate-200"}`} />)}</div>;

  if (!currentLanguage) return <main style={style} className="flex min-h-[100dvh] flex-col bg-[var(--patient-bg)] px-4 pt-4 text-slate-950 sm:px-5 sm:pt-5"><BrandHeader /><div className="mt-4 sm:mt-5"><StepDots current={1} /></div><div className="grid flex-1 place-items-center py-3 sm:py-8"><section className="w-full max-w-sm rounded-3xl border border-blue-100 bg-white p-4 text-center shadow-2xl sm:rounded-[2rem] sm:max-w-md sm:p-8"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#0A4C95] text-lg font-black text-white sm:h-16 sm:w-16 sm:text-2xl">Aa</span><p className="mt-3 text-xs font-black uppercase tracking-[.12em] text-[#0A4C95] sm:mt-5 sm:tracking-[.2em]">MediRank</p><h1 className="mt-2 text-xl font-black leading-tight sm:text-3xl">{t.chooseLanguage}</h1><p className="mt-2 text-xs font-semibold leading-5 text-slate-700 sm:mt-3 sm:text-base sm:leading-6">{t.languageHint}</p><div className="mt-5 grid gap-2 sm:mt-7 sm:gap-3"><button type="button" onClick={() => setCurrentLanguage("english")} className="min-h-12 rounded-2xl border-2 border-[#0A4C95] bg-white text-sm font-black text-slate-950 shadow-md transition active:scale-[.98] sm:min-h-16 sm:text-lg">English</button><button type="button" onClick={() => setCurrentLanguage("hinglish")} className="min-h-12 rounded-2xl bg-[#0A4C95] text-sm font-black text-white shadow-lg transition active:scale-[.98] sm:min-h-16 sm:text-lg">Hinglish</button></div></section></div><BrandFooter /></main>;

  return <main style={style} className="min-h-[100dvh] overflow-x-hidden bg-white pb-12 text-slate-950 sm:pb-14">
    <div className="relative z-50 px-4 pt-4 sm:px-5 sm:pt-5"><BrandHeader /></div>
    <div className="mx-auto w-full max-w-xl space-y-5 px-4 pt-4 sm:space-y-6 sm:px-5 sm:pt-6">
      <header className="relative z-30 bg-white py-4 text-center sm:py-6">{doctor.logo_url ? <img src={doctor.logo_url} alt={clinicName} className="mx-auto h-13 w-13 rounded-xl object-contain ring-1 ring-slate-200 sm:h-16 sm:w-16" /> : <span className="mx-auto grid h-13 w-13 place-items-center rounded-xl bg-[#0A4C95] text-lg font-black text-white sm:h-16 sm:w-16 sm:text-xl">{initials}</span>}<p className="mt-3 break-words text-xs font-black text-[#0A4C95] sm:mt-4 sm:text-sm">{clinicName}</p><h1 className="mt-3 text-lg font-black leading-snug sm:mt-4 sm:text-2xl sm:leading-relaxed">{visitQuestion}</h1>{allowLanguageStep && <button type="button" onClick={() => setCurrentLanguage(null)} className="mt-4 min-h-10 px-3 text-xs font-bold text-[#0A4C95] transition hover:bg-blue-50 sm:mt-5 sm:min-h-12 sm:text-sm">{currentLanguage === "english" ? "English" : "Hinglish"}</button>}</header>

      <StepDots current={stepNumber} />

      {/* STEP 1: rating - only this section is visible, no long stacked-scroll form */}
      {step === 1 && <section className="relative z-30 bg-white py-2 sm:py-4"><div className="text-center"><p className="text-xs font-black uppercase tracking-[.12em] text-[#0A4C95] sm:tracking-[.18em]">{t.ratingStepTitle} <span className="text-red-600">*</span></p><div className="mt-5 flex justify-center gap-2 sm:mt-6 sm:gap-3" role="radiogroup" aria-label="Select star rating" onMouseLeave={() => setHoverRating(null)}>{Array.from({ length: 5 }).map((_, index) => { const value = index + 1; const previewRating = hoverRating ?? selectedRating ?? 0; return <button key={value} type="button" role="radio" aria-checked={selectedRating === value} onMouseEnter={() => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setHoverRating(value); }} onFocus={() => setHoverRating(value)} onBlur={() => setHoverRating(null)} onTouchStart={(event) => { event.preventDefault(); selectRating(value); }} onClick={() => selectRating(value)} className="group grid h-12 w-12 touch-manipulation place-items-center rounded-full transition-colors duration-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4] active:bg-slate-200 sm:h-14 sm:w-14 sm:hover:bg-slate-100"><GoogleStar active={value <= previewRating} size={36} /></button>; })}</div><p className="mt-4 min-h-6 text-xs font-extrabold text-slate-700 sm:mt-5 sm:text-sm">{selectedRating ? selectedRating >= 5 ? "Loved it" : selectedRating === 4 ? "Good, with small feedback" : "Needs improvement" : "Select your rating"}</p></div>{validationError && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-xs font-black text-red-700 sm:mt-6 sm:px-5 sm:py-3.5 sm:text-sm">{validationError}</p>}<button type="button" onClick={proceedToChips} disabled={!selectedRating} className="mt-6 min-h-12 w-full rounded-2xl bg-[#0A4C95] text-sm font-black text-white shadow-lg transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 sm:mt-8 sm:min-h-14 sm:text-base">{t.next}</button></section>}

      {/* STEP 2: highlight chips */}
      {step === 2 && <section className="relative z-30 bg-white py-2 sm:py-4"><div className="flex items-center justify-between gap-3 sm:gap-4"><div className="min-w-0"><h2 className="text-base font-black sm:text-xl">{t.chipsTitle}</h2><p className="mt-1 text-xs font-bold leading-4 text-slate-500 sm:mt-1.5 sm:leading-5">{t.chipsHint}</p></div><span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0A4C95] sm:px-3 sm:py-1.5">{selectedChips.length}/{MIN_DETAIL_CHIPS}</span></div><div className="mt-4 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:mt-5 sm:gap-3">{chipOptions.map((value) => <button key={value} type="button" aria-pressed={selectedChips.includes(value)} onClick={() => toggleChip(value)} className={`min-h-12 rounded-xl border-2 px-3 py-2.5 text-left text-xs font-black leading-4 transition active:scale-[.98] sm:min-h-14 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm sm:leading-5 ${selectedChips.includes(value) ? "border-[#0A4C95] bg-blue-50 text-[#0A4C95] shadow-md" : "border-slate-200 bg-white text-slate-950 shadow-sm"}`}><span className="flex min-w-0 items-center gap-2 break-words">{selectedChips.includes(value) && <Check size={16} className="shrink-0 sm:size-[17px]" />}{value}</span></button>)}</div>{validationError && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-black text-red-700 sm:mt-5 sm:px-5 sm:py-3.5 sm:text-sm">{validationError}</p>}<div className="mt-6 flex gap-3 sm:mt-8"><button type="button" onClick={() => goToStep(1)} className="min-h-12 shrink-0 rounded-2xl border-2 border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition active:scale-[.98] sm:min-h-14 sm:text-base">{t.back}</button><button type="button" onClick={proceedToDrafts} disabled={selectedChips.length < MIN_DETAIL_CHIPS} className="min-h-12 flex-1 rounded-2xl bg-[#0A4C95] text-sm font-black text-white shadow-lg transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-14 sm:text-base">{t.next}</button></div></section>}

      {/* STEP 3: loading -> drafts. This step can scroll internally (3 full reviews won't fit one
          screen) - steps 1-2 above never need scrolling since only one is ever rendered. */}
      {step === 3 && <section ref={draftsSectionRef} className="relative z-30 bg-white py-2 sm:py-4"><div className="flex items-start justify-between gap-3 sm:gap-4"><div className="min-w-0"><h2 className="text-base font-black sm:text-xl">{t.draftsTitle}</h2>{selectedChips.length > 0 && <p className="mt-1.5 break-words text-xs font-bold leading-4 text-slate-500 sm:mt-2 sm:text-sm sm:leading-5">{selectedChips.join(", ")} - {reviewRating} star tone</p>}</div>{loading && <Loader2 size={20} className="shrink-0 animate-spin text-[#0A4C95] sm:size-[24px]" />}</div>{loading ? <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-5" aria-live="polite"><p className="text-xs font-black text-[#0A4C95] sm:text-sm">{loadingSlow ? t.generatingSlow : t.generating}</p>{Array.from({ length: 2 }).map((_, index) => <div key={index} className="rounded-xl border border-slate-200 p-3.5 sm:rounded-2xl sm:p-5"><div className="h-3.5 w-28 animate-pulse rounded-full bg-slate-200 sm:h-4 sm:w-32" /><div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3"><div className="h-2.5 w-full animate-pulse rounded-full bg-slate-100 sm:h-3" /><div className="h-2.5 w-11/12 animate-pulse rounded-full bg-slate-100 sm:h-3" /><div className="h-2.5 w-8/12 animate-pulse rounded-full bg-slate-100 sm:h-3" /></div><div className="mt-4 h-10 animate-pulse rounded-lg bg-blue-50 sm:mt-5 sm:rounded-xl sm:h-12" /></div>)}</div> : generationFailed ? <div className="mt-5 rounded-xl border-2 border-amber-200 bg-amber-50 p-5 text-center sm:mt-6 sm:rounded-2xl sm:p-8"><p className="text-xs font-bold leading-5 text-amber-900 sm:text-sm sm:leading-6">{GENERATION_BUSY_MESSAGE}</p><button type="button" onClick={() => void generate(selectedRating ?? reviewRating, selectedChips)} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0A4C95] px-5 text-xs font-black text-white transition active:scale-[.98] sm:mt-5 sm:min-h-12 sm:rounded-xl sm:text-sm"><RefreshCw size={16} className="sm:size-[18px]" />Try Again</button></div> : reviews.length ? <div className="mt-5 space-y-4 sm:mt-6 sm:space-y-5">{reviews.map((review, index) => <article key={review.id ?? index} className="rounded-xl border-2 border-slate-200 p-4 sm:rounded-2xl sm:p-5"><div className="flex gap-1.5">{Array.from({ length: 5 }).map((_, star) => <GoogleStar key={star} active={star < reviewRating} size={16} />)}</div><p className="mt-3 whitespace-pre-line break-words text-xs font-semibold leading-5 sm:mt-4 sm:text-base sm:leading-7">{review.content}</p><button type="button" onClick={() => void copyReview(review)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0A4C95] px-3 text-xs font-black text-white transition active:scale-[.98] sm:mt-5 sm:min-h-12 sm:rounded-xl sm:px-4 sm:text-base"><Clipboard size={16} className="sm:size-[18px]" />{t.copyReview}</button></article>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs font-bold text-slate-500 sm:mt-6 sm:rounded-2xl sm:p-8 sm:text-sm">{t.empty}</div>}{!loading && <button type="button" onClick={() => goToStep(2)} className="mt-5 min-h-11 w-full rounded-xl border-2 border-slate-200 bg-white text-xs font-black text-slate-700 transition active:scale-[.98] sm:mt-6 sm:min-h-12 sm:text-sm">{t.back}</button>}</section>}
    </div>
    <BrandFooter />

    {showThankYou && <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-slate-950/70 px-4 pt-4 backdrop-blur-md sm:px-5 sm:pt-5" role="dialog" aria-modal="true" aria-label={t.thankTitle}><BrandHeader /><div className="grid flex-1 place-items-center py-3 sm:py-5"><section className="w-full max-w-sm rounded-2xl bg-white p-4 text-center shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-8"><ThankYouAnimation /><h2 className="text-xl font-black text-slate-950 sm:text-2xl">{t.thankTitle}</h2><p className="mt-2 text-xs font-bold leading-5 text-slate-900 sm:mt-3 sm:text-base sm:leading-6">{t.thankBody}</p>{doctor.gmb_review_link ? <a href={googleEnabled ? doctor.gmb_review_link : undefined} target="_blank" rel="noreferrer" aria-disabled={!googleEnabled} onClick={(event) => { if (!googleEnabled) event.preventDefault(); else trackGoogleProceed(); }} className={`mt-5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-center text-xs font-black text-white transition active:scale-[.98] sm:mt-7 sm:min-h-14 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-base ${googleEnabled ? "bg-[#0A4C95] shadow-[0_0_25px_rgba(10,76,149,.4)]" : "cursor-wait bg-slate-400"}`}>{googleEnabled ? <>{t.google}<ExternalLink size={14} className="sm:size-[18px]" /></> : <><Loader2 size={16} className="animate-spin sm:size-[19px]" />{t.preparing}</>}</a> : <p className="mt-4 rounded-lg bg-amber-100 p-3 text-xs font-bold sm:mt-6 sm:rounded-xl sm:p-4 sm:text-base">{t.noGoogle}</p>}</section></div><BrandFooter /></div>}
  </main>;
}
