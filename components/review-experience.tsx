"use client";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Check,
  Clipboard,
  ExternalLink,
  Heart,
  Loader2,
  Sparkles,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Language = "english" | "hinglish";
type Theme = { primary?: string; accent?: string; background?: string };
type Doctor = {
  id: string;
  doctor_name: string;
  clinic_name: string;
  specialization: string | null;
  gmb_review_link: string | null;
  logo_url?: string | null;
  theme_config?: Theme | null;
};
const fallback = {
  primary: "#1E40AF",
  accent: "#F97316",
  background: "#F8FAFC",
};
const ThankYouAnimation = dynamic(() => import("./thank-you-animation"), { ssr: false });

export function ReviewExperience({
  doctor,
  experienceKeywords,
  topServices,
  scanId,
  isStarter,
  isGrowth,
}: {
  doctor: Doctor;
  experienceKeywords: string[];
  topServices: string[];
  scanId: string | null;
  isStarter: boolean;
  isGrowth: boolean;
}) {
  const theme = { ...fallback, ...doctor.theme_config };
  const style = {
    "--patient-primary": theme.primary,
    "--patient-accent": theme.accent,
    "--patient-bg": theme.background,
  } as CSSProperties;
  const [language, setLanguage] = useState<Language>("english");
  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [rating, setRating] = useState(5);
  const [customNotes, setCustomNotes] = useState("");
  const [reviewsByLanguage, setReviewsByLanguage] = useState<
    Record<Language, string[]>
  >({ english: [], hinglish: [] });
  const [loading, setLoading] = useState(false);
  const [isReviewCopied, setIsReviewCopied] = useState(false);
  const [error, setError] = useState("");
  const [selectionMessage, setSelectionMessage] = useState("");
  const [eligibilityChecking, setEligibilityChecking] = useState(true);
  const [eligibilityError, setEligibilityError] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [patientLocation, setPatientLocation] = useState<{latitude:number;longitude:number}|null>(null);
  const reviews = reviewsByLanguage[language];
  const initials = doctor.doctor_name
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  useEffect(()=>{
    let active=true;
    const token=localStorage.getItem('medirank_device_token')||crypto.randomUUID();
    localStorage.setItem('medirank_device_token',token);setDeviceToken(token);
    async function precheck(location:{latitude:number;longitude:number}|null){
      if(location)setPatientLocation(location);
      const supabase=createClient();
      if(!supabase){if(active){setEligibilityError('Review generation is not configured.');setEligibilityChecking(false)}return}
      const {data,error}=await supabase.functions.invoke('generate-review',{body:{doctor_id:doctor.id,device_token:token,precheck_only:true,...(location||{})}});
      if(active){setEligibilityError(data?.error||error?.message||'');setEligibilityChecking(false)}
    }
    if(!navigator.geolocation){void precheck(null);return()=>{active=false}}
    navigator.geolocation.getCurrentPosition(position=>void precheck({latitude:position.coords.latitude,longitude:position.coords.longitude}),()=>void precheck(null),{enableHighAccuracy:true,timeout:8000,maximumAge:60_000});
    return()=>{active=false};
  },[doctor.id]);
  const toggle = (
    value: string,
    current: string[],
    set: (items: string[]) => void,
  ) => {
    if (current.includes(value)) {
      set(current.filter((item) => item !== value));
      setSelectionMessage("");
      return;
    }
    const starterCombinedLimit=isStarter&&selectedExperiences.length+selectedServices.length>=3;
    if(current.length>=3||starterCombinedLimit){
      setSelectionMessage("Max 3 options allowed for a natural review.");
      return;
    }
    set([...current,value]);
    setSelectionMessage("");
  };

  function shuffled(items:string[]){
    const result=[...items];
    for(let index=result.length-1;index>0;index--){
      const swap=Math.floor(Math.random()*(index+1));
      [result[index],result[swap]]=[result[swap],result[index]];
    }
    return result;
  }

  function finalizedSelections(){
    const experiences=shuffled(selectedExperiences);
    const services=shuffled(selectedServices);
    const roll=Math.random();
    if(roll<0.7)return {experiences:experiences.slice(0,2),services:services.slice(0,2)};
    if(roll<0.9){
      const experienceLight=Math.random()<0.5;
      return {experiences:experiences.slice(0,experienceLight?1:2),services:services.slice(0,experienceLight?2:1)};
    }
    const useAll=Math.random()<0.5;
    return {experiences:experiences.slice(0,useAll?3:1),services:services.slice(0,useAll?3:1)};
  }
  function changeLanguage(value: Language) {
    if (isStarter && value !== "english") return;
    setLanguage(value);
    setIsReviewCopied(false);
    setError("");
  }
  async function generate() {
    if(eligibilityChecking||eligibilityError||!deviceToken)return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("Review generation is not configured.");
      setLoading(false);
      return;
    }
    const finalized=finalizedSelections();
    const { data, error: invokeError } = await supabase.functions.invoke(
      "generate-review",
      {
        body: {
          doctor_id: doctor.id,
          selected_keywords: finalized.experiences,
          selected_treatments: finalized.services,
          selected_treatment_keyword: finalized.services[0] || null,
          rating,
          custom_notes: customNotes.trim() || null,
          language,
          device_token:deviceToken,
          ...(patientLocation||{}),
        },
      },
    );
    const returnedReviews = Array.isArray(data?.reviews)
      ? data.reviews
          .filter(
            (review: unknown): review is string =>
              typeof review === "string" && review.trim().length > 0,
          )
          .map((review: string) => review.trim())
          .slice(0, 5)
      : [];
    if (invokeError || data?.error || returnedReviews.length < 2) {
      setError(
        data?.error ||
          invokeError?.message ||
          "Unable to generate a review right now.",
      );
      setLoading(false);
      return;
    }
    setReviewsByLanguage((current) => ({
      ...current,
      [language]: returnedReviews,
    }));
    if (scanId)
      void supabase.functions.invoke("mark-scan", {
        body: { scan_id: scanId, event: "generated" },
      });
    setLoading(false);
  }
  /*
   * Review-compliance guardrail (Google Maps / FTC consumer-review rules):
   * these hooks must never award coins, tokens, discounts, micro-rewards, or
   * any other benefit for copying, posting, rating, or expressing sentiment.
   * Navigation remains an explicit user action and no review is auto-posted.
   */
  async function copyReview(index: number) {
    await navigator.clipboard.writeText(reviews[index]);
    setIsReviewCopied(true);
    const supabase = createClient();
    if (supabase && scanId)
      void supabase.functions.invoke("mark-scan", {
        body: { scan_id: scanId, event: "copied" },
      });
  }
  function trackGoogleProceed() {
    const supabase = createClient();
    if (supabase && scanId)
      void supabase.functions.invoke("mark-scan", {
        body: { scan_id: scanId, event: "posted" },
      });
  }
  const Chip = ({
    value,
    active,
    onClick,
    accent = false,
  }: {
    value: string;
    active: boolean;
    onClick: () => void;
    accent?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      style={
        active
          ? {
              borderColor: accent ? theme.accent : theme.primary,
              color: theme.primary,
              background: `${accent ? theme.accent : theme.primary}12`,
            }
          : undefined
      }
      className="min-h-12 rounded-xl border border-slate-200 px-3 py-3 text-left text-sm font-semibold capitalize leading-5 transition active:scale-[.98]"
    >
      <span className="flex items-center gap-2">
        {active && <Check size={16} className="shrink-0" />}
        {value}
      </span>
    </button>
  );

  return (
    <main
      style={style}
      className={`min-h-[100dvh] bg-[var(--patient-bg)] px-3 pt-3 text-slate-950 sm:px-5 sm:pt-5 ${isStarter || isGrowth ? "pb-20 sm:pb-20" : "pb-8 sm:pb-12"}`}
    >
      <div className="mx-auto w-full max-w-xl">
        <a
          href="https://medirank.vyaparwallah.com"
          target="_blank"
          rel="noreferrer"
          className="brand-intro relative flex min-h-12 flex-nowrap items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-2xl bg-white px-2 text-center text-[clamp(0.75rem,3.7vw,1rem)] font-extrabold shadow-sm ring-1 ring-slate-200/70 sm:gap-1.5 sm:px-3"
        >
          <span className="relative z-10 text-[#0A4C95]">MediRank</span>
          <span className="relative z-10 text-slate-500">by</span>
          <span className="relative z-10 text-[#0A4C95]">Vyapar</span>
          <span className="relative z-10 text-[#F37021]">Wallah</span>
          <ExternalLink size={14} className="shrink-0 text-slate-400" />
        </a>
        <header className="px-2 pb-2 pt-6 text-center sm:pt-8">
          {!isStarter && doctor.logo_url ? (
            <img
              src={doctor.logo_url}
              alt={doctor.clinic_name}
              className="mx-auto h-16 w-16 rounded-2xl bg-white object-contain p-1 shadow-sm ring-1 ring-slate-200/70 sm:h-20 sm:w-20"
            />
          ) : (
            <span
              style={{ background: theme.primary }}
              className="mx-auto grid h-16 w-16 place-items-center rounded-2xl text-xl font-black text-white shadow-sm sm:h-20 sm:w-20"
            >
              {initials}
            </span>
          )}
          <p
            style={{ color: theme.primary }}
            className="mt-3 text-sm font-bold"
          >
            {doctor.clinic_name}
          </p>
          <h1 className="mt-2 text-[clamp(1.6rem,7vw,2.15rem)] font-extrabold leading-[1.12] tracking-tight">
            How was your visit with
            <br />
            {doctor.doctor_name}?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500 sm:text-base">
            Choose 1–2 items from each section.
          </p>
        </header>
        <section className="mt-4 rounded-2xl bg-white p-4 shadow-lg shadow-slate-900/5 ring-1 ring-slate-200/70 sm:mt-6 sm:p-6">
          {isReviewCopied ? (
            <div className="py-8 text-center sm:py-12">
              <ThankYouAnimation />
              <h2 className="mt-5 text-2xl font-extrabold">Thank you for visiting!</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">Your review is copied. Open Google Maps and paste it to share your experience.</p>
              {doctor.gmb_review_link ? (
                <a href={doctor.gmb_review_link} target="_blank" rel="noreferrer" onClick={trackGoogleProceed} style={{ background: theme.primary }} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-bold text-white shadow-lg">Open Google Maps to Paste Review <ExternalLink size={18} /></a>
              ) : (
                <p className="mt-6 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-700">Google Maps link is not configured for this clinic.</p>
              )}
            </div>
          ) : <>
          <div className="mb-6 border-b border-slate-100 pb-6 text-center">
            <p className="font-bold">How would you rate your visit?</p>
            <div className="mt-3 flex justify-center gap-2" role="radiogroup" aria-label="Visit rating">
              {Array.from({ length: 5 }).map((_, index) => {
                const value = index + 1;
                const active = value <= rating;
                return (
                  <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value > 1 ? "s" : ""}`} onClick={() => setRating(value)} className="grid min-h-11 min-w-11 place-items-center rounded-xl transition hover:bg-slate-50 active:scale-95">
                    <Star size={28} fill={active ? theme.accent : "transparent"} style={{ color: active ? theme.accent : "#CBD5E1" }} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="font-bold">Experience</p>
              <p className="mt-1 text-sm text-slate-500">
                How did the visit feel?
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {selectedExperiences.length}/3
            </span>
          </div>
          {experienceKeywords.length ? (
            <div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
              {experienceKeywords.map((value) => (
                <Chip
                  key={value}
                  value={value}
                  active={selectedExperiences.includes(value)}
                  onClick={() =>
                    toggle(value, selectedExperiences, setSelectedExperiences)
                  }
                />
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No experience options configured yet.
            </p>
          )}
          {selectionMessage && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{selectionMessage}</p>}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-bold">Treatment / Service</p>
                <p className="mt-1 text-sm text-slate-500">
                  What did you visit for?
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {selectedServices.length}/3
              </span>
            </div>
            {topServices.length ? (
              <div className="mt-4 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
                {topServices.map((value) => (
                  <Chip
                    key={value}
                    value={value}
                    active={selectedServices.includes(value)}
                    accent
                    onClick={() =>
                      toggle(value, selectedServices, setSelectedServices)
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                This clinic has not listed treatments yet.
              </p>
            )}
          </div>
          <div className="mt-6 border-t border-slate-100 pt-6">
            <label htmlFor="custom-notes" className="font-bold">Anything specific you want to add? <span className="font-normal text-slate-400">(Optional)</span></label>
            <textarea id="custom-notes" value={customNotes} onChange={(event) => setCustomNotes(event.target.value.slice(0, 500))} maxLength={500} rows={3} className="input mt-3 resize-y text-sm leading-6" placeholder="e.g., Treatment took just 15 minutes, or staff was very supportive..." />
            <p className="mt-1 text-right text-xs text-slate-400">{customNotes.length}/500</p>
          </div>
          <div className="mt-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Review language
            </p>
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {(["english", "hinglish"] as Language[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => changeLanguage(item)}
                  disabled={isStarter && item === "hinglish"}
                  title={isStarter && item === "hinglish" ? "Available on Growth & Premium plans" : undefined}
                  style={
                    language === item ? { color: theme.primary } : undefined
                  }
                  className={`relative min-h-11 rounded-lg text-sm font-bold capitalize ${language === item ? "bg-white shadow-sm" : "text-slate-500"} disabled:cursor-not-allowed disabled:text-slate-400 disabled:opacity-60`}
                >
                  {item === "english" ? "English" : "Hinglish"}
                  {isStarter && item === "hinglish" && <span className="absolute -right-1 -top-2 rounded-full bg-slate-700 px-2 py-0.5 text-[9px] font-bold normal-case text-white">Growth & Premium</span>}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {eligibilityChecking && <p role="status" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600"><Loader2 size={16} className="animate-spin"/>Verifying feedback eligibility…</p>}
          {eligibilityError && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{eligibilityError}</p>}
          {!reviews.length ? (
            <button
              type="button"
              disabled={
                !selectedExperiences.length ||
                (topServices.length > 0 && !selectedServices.length) ||
                loading
                || eligibilityChecking
                || !!eligibilityError
              }
              onClick={generate}
              style={{ background: theme.primary }}
              className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-bold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Writing in {language === "hinglish" ? "Hinglish" : "English"}…
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  Generate my review
                </>
              )}
            </button>
          ) : (
            <div className="mt-6">
              <div className="text-center">
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-emerald-50 px-3 text-sm font-bold text-emerald-700">
                  <Heart size={15} fill="currentColor" />
                  Your {language === "hinglish" ? "Hinglish" : "English"}{" "}
                  reviews
                </span>
                <h2 className="mt-3 text-lg font-bold">
                  Pick the one that sounds most like you
                </h2>
              </div>
              <div className="mt-4 space-y-3">
                {reviews.map((review, index) => (
                  <div key={index} className="rounded-2xl border border-slate-200 p-4">
                    <div style={{ color: theme.accent }} className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} fill="currentColor" size={13} />
                      ))}
                    </div>
                    <p className="mt-2.5 text-sm leading-6">{review}</p>
                    <button type="button" onClick={() => copyReview(index)} style={{ background: theme.primary }} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white shadow-md">
                      <Clipboard size={18} /> Copy Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>}
        </section>
        <footer className="px-2 pt-7 text-center text-sm font-bold text-slate-600">
          <a
            href="https://www.vyaparwallah.com/digital-marketing-for-doctors"
            target="_blank"
            rel="noreferrer"
            className="inline-flex gap-1 underline-offset-2 hover:underline"
          >
            <span>Powered by</span> <span className="text-[#0A4C95]">Vyapar</span> <span className="text-[#F37021]">Wallah</span>
          </a>
        </footer>
      </div>
    </main>
  );
}
