"use client";

import type { CSSProperties, TouchEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, ChevronLeft, ChevronRight, Clipboard, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
    brandWriting: "MediRank is writing your reviews...",
    generating: "This takes just a few seconds",
    generatingSlow: "Still working on it, almost there...",
    draftsTitle: "Choose your favorite draft",
    copyReview: "Copy Review",
    thankTitle: "Thank you for visiting!",
    thankBody: "Your review is copied safely.",
    preparing: "Preparing Google Maps...",
    google: "Open Google Maps to Paste Review",
    noGoogle: "Google Maps link is not configured for this clinic.",
    empty: "Select a rating and highlights to generate review options.",
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
    brandWriting: "MediRank aapka review likh raha hai...",
    generating: "Bas kuch second lagenge",
    generatingSlow: "Thoda time lag raha hai, bas ho hi gaya...",
    draftsTitle: "Apna favorite draft chunein",
    copyReview: "Review Copy Karein",
    thankTitle: "Visit karne ke liye dhanyavaad!",
    thankBody: "Aapka review safely copy ho gaya hai.",
    preparing: "Google Maps taiyaar ho raha hai...",
    google: "Google Maps kholein aur review paste karein",
    noGoogle: "Is clinic ka Google Maps link configure nahi hai.",
    empty: "Rating aur highlights select karke review options generate karein.",
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
  // Which of the 3 drafts the carousel is currently showing - layout/navigation state only, does
  // not touch review-generation logic or content.
  const [activeDraft, setActiveDraft] = useState(0);
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
  // Guards the chips->drafts auto-advance below so it fires exactly once per unique chip
  // combination, not on every re-render.
  const autoGenerationKeyRef = useRef("");
  // Tracks touch position for the drafts carousel's swipe gesture (layout/navigation only).
  const touchStartXRef = useRef<number | null>(null);
  // Speculative pre-fetch (UX optimization only, NOT the "real" request - see startSpeculativeGeneration
  // and generate() below): holds the in-flight/completed background generation started the moment the
  // patient picks a rating, plus the exact (rating, chips) key it was generated for, so generate() can
  // tell a moment later whether the patient's actual chip selection matches this guess.
  const speculativeRef = useRef<{ key: string; controller: AbortController; promise: Promise<{ reviews: { id: string | null; content: string }[]; quality: Record<string, unknown> } | null> } | null>(null);

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

  // Auto-advance chips -> drafts the moment MIN_DETAIL_CHIPS is reached - no explicit "Next" tap
  // needed. Effect (not an inline call in toggleChip) so it always reads the latest selectedChips/
  // selectedRating rather than a value captured in a stale closure, and the ref guard stops it
  // re-firing for the same combination (e.g. if the patient uses Back to return to this step
  // without changing anything).
  useEffect(() => {
    if (step !== 2 || loading || !selectedRating || selectedChips.length !== MIN_DETAIL_CHIPS) return;
    const generationKey = `${selectedChips.join("|")}:${selectedRating}`;
    if (autoGenerationKeyRef.current === generationKey) return;
    autoGenerationKeyRef.current = generationKey;
    const chips = unique(selectedChips.map((chip) => sanitizeText(chip, 80))).slice(0, 5);
    const timer = window.setTimeout(() => {
      setStep(3);
      scrollToTop();
      void generate(selectedRating, chips);
    }, 350); // brief pause so the 2nd chip's checkmark is visible before the screen changes
    return () => window.clearTimeout(timer);
  }, [step, loading, selectedChips, selectedRating]);

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
    // Kick off the speculative background pre-fetch the moment the rating is picked - see
    // startSpeculativeGeneration for why this is safe to start before chips are even chosen.
    startSpeculativeGeneration(value);
    // Auto-advance to the chips step - no separate "Next" tap needed. Brief pause so the star-fill
    // animation is visible before the screen changes.
    window.setTimeout(() => goToStep(2), 300);
  }

  function scrollToTop() {
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 60);
  }

  function goToStep(next: 1 | 2 | 3) {
    setStep(next);
    setValidationError("");
    scrollToTop();
  }

  function retryGenerate() {
    if (!selectedRating) return;
    const chips = unique(selectedChips.map((chip) => sanitizeText(chip, 80))).slice(0, 5);
    void generate(selectedRating ?? 0, chips);
  }

  // Drafts carousel navigation - one review draft visible at a time instead of all 3 stacked, so
  // the fixed-height card never needs the page to scroll to compare/choose a draft. Clamped (no
  // wraparound) so the dot indicator always matches the visible draft unambiguously.
  function goToDraft(index: number) {
    setActiveDraft(Math.max(0, Math.min(reviews.length - 1, index)));
  }
  function nextDraft() { goToDraft(activeDraft + 1); }
  function prevDraft() { goToDraft(activeDraft - 1); }
  function handleDraftTouchStart(event: TouchEvent) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }
  function handleDraftTouchEnd(event: TouchEvent) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const deltaX = endX - startX;
    if (Math.abs(deltaX) < 40) return; // ignore small taps/jitter
    if (deltaX < 0) nextDraft(); else prevDraft();
  }

  // Normalizes a (rating, chips) pair into a comparable string so the speculative pre-fetch and the
  // real generate() call can tell whether they're asking for the same thing - order-independent
  // (sorted) since chip selection order doesn't change what gets generated.
  function speculativeKey(ratingArg: number, chipsArg: string[]) {
    return `${ratingArg}:${[...chipsArg].map((chip) => chip.trim().toLowerCase()).filter(Boolean).sort().join("|")}`;
  }

  // Shared network call used by both the real (UI-facing) generation and the speculative background
  // pre-fetch below - returns the parsed result on success, null on a handled failure (backend said
  // success:false, or the response didn't parse into exactly 3 reviews), and throws on abort/network
  // errors so callers can tell "cancelled" apart from "genuinely failed".
  async function fetchGeneration(ratingArg: number, chipsArg: string[], controller: AbortController) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Review generation is not configured.");
    const token = deviceToken || crypto.randomUUID();
    if (!deviceToken) setDeviceToken(token);
    // 22s comfortably covers the backend's own worst-case chain of 4 fallback layers (~17-19s) with
    // margin, whether this call is the real request or a speculative one running in the background.
    const timeout = window.setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/generate-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({
          doctor_id: doctor.id,
          scan_id: analyticsScanIdRef.current,
          selected_chips: chipsArg,
          selected_keywords: chipsArg,
          selected_experiences: chipsArg,
          selected_chip: chipsArg[0],
          rating: ratingArg,
          custom_notes: sanitizeText(customNotes, 240) || null,
          language: currentLanguage,
          device_token: token,
          ...(patientLocation || {}),
        }),
        signal: controller.signal,
      });
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
      // Backend contract: {success:true, reviews:[...]} on real AI output (now the result of up to 4
      // internal fallback layers - see generate-review/index.ts), {success:false, error} only if every
      // layer failed. Never trust a partial or malformed payload as a success - if it isn't explicitly
      // success:true with 3 reviews, treat it as a failure and show the "try again" state.
      if (response.ok && data.success === true && returned.length === 3) {
        const quality = data.quality && typeof data.quality === "object" ? data.quality as Record<string, unknown> : {};
        return { reviews: returned, quality };
      }
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  // Speculative pre-fetch (UX optimization only - NOT the "real" request; see generate() below for
  // where its result actually gets used). Fires the moment the patient picks a rating, i.e. before
  // they've even seen the chips step - selectedChips is always empty at that point in this flow, so
  // this uses the clinic's first configured keyword chips as a best-guess placeholder for what the
  // patient is likely to pick next. If their actual chip selection ends up matching this guess,
  // generate() reuses this in-flight/completed call directly instead of starting a fresh one - by the
  // time the patient finishes tapping through 2 chips, generation has already had a head start (often
  // the full round trip) hidden behind their own selection time, rather than starting cold on step 3.
  function startSpeculativeGeneration(ratingArg: number) {
    if (!currentLanguage) return;
    const placeholderChips = chipOptions.slice(0, 2);
    if (!placeholderChips.length) return;
    const key = speculativeKey(ratingArg, placeholderChips);
    if (speculativeRef.current?.key === key) return; // already running/cached for this exact guess
    speculativeRef.current?.controller.abort(); // superseded by a new rating pick - stop the old guess
    const controller = new AbortController();
    console.log("🔮 SPECULATIVE pre-fetch started", { rating: ratingArg, placeholderChips });
    const promise = fetchGeneration(ratingArg, placeholderChips, controller)
      .then((result) => {
        console.log(result ? "🔮 SPECULATIVE pre-fetch resolved (ready if the patient's final selection matches)" : "🔮 SPECULATIVE pre-fetch returned no usable result");
        return result;
      })
      .catch((error) => {
        if (controller.signal.aborted) console.log("🔮 SPECULATIVE pre-fetch aborted (superseded or selections diverged)");
        else console.error("🔮 SPECULATIVE pre-fetch failed", error);
        return null;
      });
    speculativeRef.current = { key, controller, promise };
  }

  async function generate(ratingOverride: number, chips: string[]) {
    if (!currentLanguage || loading) return;
    setLoading(true);
    setValidationError("");
    setGenerationFailed(false);
    setReviews([]);
    const key = speculativeKey(ratingOverride, chips);
    const speculative = speculativeRef.current;
    try {
      let result: { reviews: { id: string | null; content: string }[]; quality: Record<string, unknown> } | null;
      if (speculative && speculative.key === key) {
        // Speculative hit: the patient's actual selection matches what the background pre-fetch
        // already guessed - reuse it instead of firing a second, duplicate request. If it's still
        // in-flight this just waits for it (with a head start); if it already resolved, this returns
        // instantly.
        console.log("🎯 SPECULATIVE HIT - reusing pre-fetched generation, no duplicate API call");
        speculativeRef.current = null;
        result = await speculative.promise;
      } else {
        if (speculative) {
          // Speculative miss: the patient picked different chips than the placeholder guess used -
          // abort the now-irrelevant background call cleanly rather than letting it run to completion
          // for nothing, and fire the real request with their actual selection.
          console.log("🗑️ SPECULATIVE MISS - final selection differs from the pre-fetch guess, aborting it and firing the real request", { guessKey: speculative.key, actualKey: key });
          speculative.controller.abort();
          speculativeRef.current = null;
        }
        result = await fetchGeneration(ratingOverride, chips, new AbortController());
      }
      if (result) {
        setReviewRating(typeof result.quality.generated_rating === "number" ? result.quality.generated_rating as number : ratingOverride);
        setReviews(result.reviews);
        setActiveDraft(0);
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

  // Compact sizing (smaller min-height/padding than before) so BrandHeader + the fixed card +
  // BrandFooter together always fit within one viewport height with no page-level scroll - text
  // content is unchanged, only the box dimensions around it.
  const BrandHeader = () => <a href="/" className="relative z-50 mx-auto flex min-h-8 w-full max-w-xl flex-nowrap items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap rounded-xl border border-slate-200 bg-white px-1.5 text-[11px] font-black shadow-sm sm:min-h-11 sm:gap-1 sm:px-3 sm:rounded-2xl sm:text-sm"><span className="text-[#0A4C95]">MediRank</span><span className="text-slate-700">by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span><ExternalLink size={11} className="ml-0.5 shrink-0 text-slate-500 sm:size-[13px]" /></a>;
  const BrandFooter = () => <footer className="relative z-50 px-4 py-1.5 text-center text-[11px] font-black text-slate-900 sm:px-5 sm:py-2.5 sm:text-xs"><a href="https://www.vyaparwallah.com/digital-marketing-for-doctors" target="_blank" rel="noreferrer" className="inline-flex min-h-7 max-w-full items-center gap-0.5 overflow-hidden rounded-lg bg-white px-2.5 shadow-sm ring-1 ring-slate-200 sm:min-h-9 sm:gap-1 sm:px-4 sm:rounded-xl"><span>Powered by</span><span className="text-[#0A4C95]">Vyapar</span><span className="text-[#F37021]">Wallah</span></a></footer>;
  const GoogleStar = ({ active, size = 34 }: { active: boolean; size?: number }) => <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className="block transition-transform duration-75 ease-out group-active:scale-90"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill={active ? "#F4B400" : "transparent"} stroke={active ? "#F4B400" : "#B8C0CC"} strokeWidth="1.8" strokeLinejoin="round" /></svg>;
  // Step indicator dots - shown on every screen (including the language picker, which is always
  // step 1 when it's shown at all) so the patient always knows how much of the flow is left.
  const StepDots = ({ current }: { current: number }) => <div className="flex items-center justify-center gap-1.5" role="status"><span className="sr-only">{t.stepOf(current, totalSteps)}</span>{Array.from({ length: totalSteps }).map((_, index) => <span key={index} aria-hidden="true" className={`h-1.5 rounded-full transition-all ${index + 1 === current ? "w-6 bg-[#0A4C95]" : "w-1.5 bg-slate-200"}`} />)}</div>;

  // Fixed-height, single-card layout (pure presentation - no text/copy/keyword/generation logic
  // below differs from before): outer <main> is exactly one viewport tall and never scrolls;
  // BrandHeader/BrandFooter are compact shrink-0 strips; the middle region is a flex-1 container
  // that centers a card capped at max-h-[640px]/[680px]. The card itself fills whatever space is
  // left between header and footer (h-full), so header+card+footer always sum to <=100dvh - the
  // page can never need to scroll, regardless of exact device chrome height.
  if (!currentLanguage) return <main style={style} className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--patient-bg)] text-slate-950">
    <div className="shrink-0 px-4 pt-3 sm:px-5 sm:pt-4"><BrandHeader /></div>
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-2 sm:px-5">
      <section className="flex h-full max-h-[600px] w-full max-w-sm flex-col items-center justify-center rounded-3xl border border-blue-100 bg-white p-4 text-center shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-8">
        <div className="mb-3 shrink-0 sm:mb-4"><StepDots current={1} /></div>
        <img src="/medirank-logo.png" alt="MediRank" className="mx-auto h-10 w-10 shrink-0 rounded-2xl object-contain ring-1 ring-slate-200 sm:h-12 sm:w-12" style={{ maxWidth: "80px" }} />
        <p className="mt-2 shrink-0 text-xs font-black uppercase tracking-[.12em] text-[#0A4C95] sm:mt-3 sm:tracking-[.2em]">MediRank</p>
        <h1 className="mt-2 shrink-0 text-xl font-black leading-tight sm:text-3xl">{t.chooseLanguage}</h1>
        <p className="mt-2 shrink-0 text-xs font-semibold leading-5 text-slate-700 sm:mt-3 sm:text-base sm:leading-6">{t.languageHint}</p>
        <div className="mt-5 grid w-full shrink-0 gap-2 sm:mt-7 sm:gap-3">
          <button type="button" onClick={() => setCurrentLanguage("english")} className="min-h-11 rounded-2xl border-2 border-[#0A4C95] bg-white text-sm font-black text-slate-950 shadow-md transition active:scale-[.98] sm:min-h-14 sm:text-lg">English</button>
          <button type="button" onClick={() => setCurrentLanguage("hinglish")} className="min-h-11 rounded-2xl bg-[#0A4C95] text-sm font-black text-white shadow-lg transition active:scale-[.98] sm:min-h-14 sm:text-lg">Hinglish</button>
        </div>
      </section>
    </div>
    <div className="shrink-0"><BrandFooter /></div>
  </main>;

  const activeReview = reviews[activeDraft] ?? reviews[0] ?? null;

  return <main style={style} className="flex h-[100dvh] flex-col overflow-hidden bg-white text-slate-950">
    <div className="shrink-0 px-4 pt-3 sm:px-5 sm:pt-4"><BrandHeader /></div>
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-2 sm:px-5">
      <div className="flex h-full max-h-[680px] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl sm:max-w-md sm:rounded-[2rem]">
        {/* Compact clinic header - fixed small logo (well under the 80-100px cap), tight spacing,
            so it never dominates the card's limited vertical budget. */}
        <header className="shrink-0 px-4 pt-4 text-center sm:px-6 sm:pt-6">
          {doctor.logo_url ? <img src={doctor.logo_url} alt={clinicName} className="mx-auto h-10 w-10 rounded-xl object-contain ring-1 ring-slate-200 sm:h-12 sm:w-12" style={{ maxWidth: "80px" }} /> : <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#0A4C95] text-sm font-black text-white sm:h-12 sm:w-12 sm:text-base">{initials}</span>}
          <p className="mt-1.5 break-words text-[11px] font-black text-[#0A4C95] sm:mt-2 sm:text-xs">{clinicName}</p>
          <h1 className="mt-1.5 line-clamp-2 text-sm font-black leading-snug sm:mt-2 sm:text-lg sm:leading-relaxed">{visitQuestion}</h1>
          {allowLanguageStep && <button type="button" onClick={() => setCurrentLanguage(null)} className="mt-1.5 min-h-6 px-2 text-[11px] font-bold text-[#0A4C95] transition hover:bg-blue-50 sm:mt-2 sm:text-xs">{currentLanguage === "english" ? "English" : "Hinglish"}</button>}
        </header>

        <div className="shrink-0 py-2 sm:py-3"><StepDots current={stepNumber} /></div>

        {/* STEP 1: rating - vertically centered in the remaining card space, nothing to scroll */}
        {step === 1 && <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 text-center sm:px-6"><p className="shrink-0 text-xs font-black uppercase tracking-[.12em] text-[#0A4C95] sm:tracking-[.18em]">{t.ratingStepTitle} <span className="text-red-600">*</span></p><div className="mt-4 flex shrink-0 justify-center gap-2 sm:mt-5 sm:gap-3" role="radiogroup" aria-label="Select star rating" onMouseLeave={() => setHoverRating(null)}>{Array.from({ length: 5 }).map((_, index) => { const value = index + 1; const previewRating = hoverRating ?? selectedRating ?? 0; return <button key={value} type="button" role="radio" aria-checked={selectedRating === value} onMouseEnter={() => { if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setHoverRating(value); }} onFocus={() => setHoverRating(value)} onBlur={() => setHoverRating(null)} onTouchStart={(event) => { event.preventDefault(); selectRating(value); }} onClick={() => selectRating(value)} className="group grid h-11 w-11 touch-manipulation place-items-center rounded-full transition-colors duration-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4285F4] active:bg-slate-200 sm:h-13 sm:w-13 sm:hover:bg-slate-100"><GoogleStar active={value <= previewRating} size={32} /></button>; })}</div><p className="mt-3 min-h-5 shrink-0 text-xs font-extrabold text-slate-700 sm:mt-4 sm:text-sm">{selectedRating ? selectedRating >= 5 ? "Loved it" : selectedRating === 4 ? "Good, with small feedback" : "Needs improvement" : "Select your rating"}</p>{validationError && <p className="mt-3 shrink-0 rounded-xl bg-red-50 px-4 py-2.5 text-xs font-black text-red-700 sm:mt-4 sm:text-sm">{validationError}</p>}</div>}

        {/* STEP 2: highlight chips - title/counter fixed, only the chip GRID scrolls internally if
            a clinic has more keywords than fit (bounded scroll, not a whole-page scroll) */}
        {step === 2 && <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6"><div className="flex shrink-0 items-center justify-between gap-3 sm:gap-4"><div className="min-w-0"><h2 className="text-sm font-black sm:text-lg">{t.chipsTitle}</h2></div><span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0A4C95]">{selectedChips.length}/{MIN_DETAIL_CHIPS}</span></div><div className="mt-3 min-h-0 flex-1 overflow-y-auto sm:mt-4"><div className="grid grid-cols-1 gap-2 pb-1 min-[360px]:grid-cols-2 sm:gap-2.5">{chipOptions.map((value) => <button key={value} type="button" aria-pressed={selectedChips.includes(value)} onClick={() => toggleChip(value)} className={`min-h-11 rounded-xl border-2 px-3 py-2 text-left text-[11px] font-black leading-4 transition active:scale-[.98] sm:min-h-12 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-xs sm:leading-5 ${selectedChips.includes(value) ? "border-[#0A4C95] bg-blue-50 text-[#0A4C95] shadow-md" : "border-slate-200 bg-white text-slate-950 shadow-sm"}`}><span className="flex min-w-0 items-center gap-1.5 break-words">{selectedChips.includes(value) && <Check size={14} className="shrink-0 sm:size-[15px]" />}{value}</span></button>)}</div></div>{validationError && <p className="mt-2 shrink-0 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-black text-red-700 sm:text-xs">{validationError}</p>}<p className="mt-2 shrink-0 pb-3 text-center text-[11px] font-bold text-slate-400 sm:pb-4 sm:text-xs">{t.minChips}</p></div>}

        {/* STEP 3: loading -> drafts CAROUSEL (one draft visible at a time, swipe/arrows/dots to
            move between the 3) instead of a stacked list - fits the fixed card with zero page
            scroll; only the review TEXT area scrolls internally if a draft runs long. */}
        {step === 3 && <section ref={draftsSectionRef} className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
          {!loading && <div className="shrink-0 text-center"><h2 className="text-sm font-black sm:text-lg">{t.draftsTitle}</h2>{selectedChips.length > 0 && <p className="mt-0.5 break-words text-[11px] font-bold leading-4 text-slate-500 sm:text-xs">{selectedChips.join(", ")} - {reviewRating} star tone</p>}</div>}
          <div className="mt-2 flex min-h-0 flex-1 flex-col sm:mt-3">
            {loading ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-blue-100 bg-blue-50/40 px-4 text-center sm:gap-4" aria-live="polite"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0A4C95] text-white shadow-lg sm:h-14 sm:w-14"><Sparkles size={22} className="animate-pulse" /></span><div className="shrink-0"><p className="text-xs font-black text-[#0A4C95] sm:text-sm">{t.brandWriting}</p><p className="mt-1 text-[11px] font-bold text-slate-500 sm:text-xs">{loadingSlow ? t.generatingSlow : t.generating}</p></div><div className="flex shrink-0 gap-1.5"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0A4C95]" style={{ animationDelay: "0ms" }} /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0A4C95]" style={{ animationDelay: "150ms" }} /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0A4C95]" style={{ animationDelay: "300ms" }} /></div></div>
            : generationFailed ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-center sm:rounded-2xl sm:p-6"><p className="text-xs font-bold leading-5 text-amber-900 sm:text-sm sm:leading-6">{GENERATION_BUSY_MESSAGE}</p><button type="button" onClick={retryGenerate} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0A4C95] px-5 text-xs font-black text-white transition active:scale-[.98] sm:min-h-11 sm:rounded-xl sm:text-sm"><RefreshCw size={15} className="sm:size-[17px]" />Try Again</button></div>
            : activeReview ? <div className="flex min-h-0 flex-1 flex-col" onTouchStart={handleDraftTouchStart} onTouchEnd={handleDraftTouchEnd}>
                {/* Arrows float over the article's own padding gutter (absolute + half-translated
                    out) instead of occupying a dedicated flex column, so the article can span the
                    section's full width - this is what actually gives the review text more room
                    per line and cuts down on unnecessary wraps. */}
                <div className="relative flex min-h-0 flex-1">
                  <article className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white px-3.5 py-4 shadow-[0_2px_14px_rgba(15,23,42,.07)] sm:rounded-[1.75rem] sm:px-4 sm:py-5">
                    <div className="flex shrink-0 justify-center gap-1.5">{Array.from({ length: 5 }).map((_, star) => <GoogleStar key={star} active={star < reviewRating} size={15} />)}</div>
                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto sm:mt-4"><p className="whitespace-pre-line break-words text-[13px] font-medium leading-6 text-slate-800 sm:text-sm sm:leading-7">{activeReview.content}</p></div>
                  </article>
                  {reviews.length > 1 && <button type="button" onClick={prevDraft} disabled={activeDraft === 0} aria-label="Previous draft" className="absolute left-0 top-1/2 z-10 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-100 transition hover:text-[#0A4C95] disabled:opacity-0 disabled:pointer-events-none sm:h-8 sm:w-8"><ChevronLeft size={16} className="sm:size-[18px]" /></button>}
                  {reviews.length > 1 && <button type="button" onClick={nextDraft} disabled={activeDraft === reviews.length - 1} aria-label="Next draft" className="absolute right-0 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 translate-x-1/2 place-items-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-100 transition hover:text-[#0A4C95] disabled:opacity-0 disabled:pointer-events-none sm:h-8 sm:w-8"><ChevronRight size={16} className="sm:size-[18px]" /></button>}
                </div>
                {reviews.length > 1 && <div className="mt-2 flex shrink-0 justify-center gap-1.5 sm:mt-3">{reviews.map((_, index) => <button key={index} type="button" onClick={() => goToDraft(index)} aria-label={`Draft ${index + 1}`} aria-current={index === activeDraft} className={`h-1.5 rounded-full transition-all ${index === activeDraft ? "w-5 bg-[#0A4C95]" : "w-1.5 bg-slate-200"}`} />)}</div>}
                <button type="button" onClick={() => void copyReview(activeReview)} className="mt-2 flex min-h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#0A4C95] px-3 text-xs font-black text-white transition active:scale-[.98] sm:mt-3 sm:min-h-11 sm:rounded-xl sm:px-4 sm:text-sm"><Clipboard size={15} className="sm:size-[17px]" />{t.copyReview}</button>
              </div>
            : <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-bold text-slate-500 sm:rounded-2xl sm:text-sm">{t.empty}</div>}
          </div>
        </section>}
      </div>
    </div>
    <div className="shrink-0"><BrandFooter /></div>

    {showThankYou && <div className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-slate-950/70 px-4 pt-4 backdrop-blur-md sm:px-5 sm:pt-5" role="dialog" aria-modal="true" aria-label={t.thankTitle}><BrandHeader /><div className="grid flex-1 place-items-center py-3 sm:py-5"><section className="w-full max-w-sm rounded-2xl bg-white p-4 text-center shadow-2xl sm:max-w-md sm:rounded-[2rem] sm:p-8"><ThankYouAnimation /><h2 className="text-xl font-black text-slate-950 sm:text-2xl">{t.thankTitle}</h2><p className="mt-2 text-xs font-bold leading-5 text-slate-900 sm:mt-3 sm:text-base sm:leading-6">{t.thankBody}</p>{doctor.gmb_review_link ? <a href={googleEnabled ? doctor.gmb_review_link : undefined} target="_blank" rel="noreferrer" aria-disabled={!googleEnabled} onClick={(event) => { if (!googleEnabled) event.preventDefault(); else trackGoogleProceed(); }} className={`mt-5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-center text-xs font-black text-white transition active:scale-[.98] sm:mt-7 sm:min-h-14 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-base ${googleEnabled ? "bg-[#0A4C95] shadow-[0_0_25px_rgba(10,76,149,.4)]" : "cursor-wait bg-slate-400"}`}>{googleEnabled ? <>{t.google}<ExternalLink size={14} className="sm:size-[18px]" /></> : <><Loader2 size={16} className="animate-spin sm:size-[19px]" />{t.preparing}</>}</a> : <p className="mt-4 rounded-lg bg-amber-100 p-3 text-xs font-bold sm:mt-6 sm:rounded-xl sm:p-4 sm:text-base">{t.noGoogle}</p>}</section></div><BrandFooter /></div>}
  </main>;
}
