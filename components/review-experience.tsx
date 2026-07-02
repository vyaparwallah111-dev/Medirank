"use client";
import type { CSSProperties } from "react";
import { useState } from "react";
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

export function ReviewExperience({
  doctor,
  experienceKeywords,
  topServices,
  scanId,
}: {
  doctor: Doctor;
  experienceKeywords: string[];
  topServices: string[];
  scanId: string | null;
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
  const [choice, setChoice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const reviews = reviewsByLanguage[language];
  const initials = doctor.doctor_name
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const toggle = (
    value: string,
    current: string[],
    set: (items: string[]) => void,
  ) => {
    if (current.includes(value)) set(current.filter((item) => item !== value));
    else if (current.length < 2) set([...current, value]);
  };
  function changeLanguage(value: Language) {
    setLanguage(value);
    setChoice(0);
    setCopied(false);
    setError("");
  }
  async function generate() {
    setLoading(true);
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("Review generation is not configured.");
      setLoading(false);
      return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke(
      "generate-review",
      {
        body: {
          doctor_id: doctor.id,
          selected_keywords: selectedExperiences,
          selected_treatments: selectedServices,
          selected_treatment_keyword: selectedServices[0] || null,
          rating,
          custom_notes: customNotes.trim() || null,
          language,
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
  async function post() {
    await navigator.clipboard.writeText(reviews[choice]);
    setCopied(true);
    const supabase = createClient();
    if (supabase && scanId)
      void supabase.functions.invoke("mark-scan", {
        body: { scan_id: scanId, event: "copied" },
      });
    if (doctor.gmb_review_link)
      setTimeout(() => window.open(doctor.gmb_review_link!, "_blank"), 400);
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
      className="min-h-[100dvh] bg-[var(--patient-bg)] px-3 pb-8 pt-3 text-slate-950 sm:px-5 sm:pb-12 sm:pt-5"
    >
      <div className="mx-auto w-full max-w-xl">
        <a
          href="https://DocRevu.vyaparwallah.com"
          target="_blank"
          rel="noreferrer"
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-white px-3 text-center text-sm font-extrabold shadow-sm ring-1 ring-slate-200/70 sm:text-base"
        >
          <span style={{ color: theme.primary }}>MediRank</span>
          <span className="text-slate-500">By</span>
          <span>VyaparWallah.com</span>
          <ExternalLink size={14} className="text-slate-400" />
        </a>
        <header className="px-2 pb-2 pt-6 text-center sm:pt-8">
          {doctor.logo_url ? (
            <img
              src={doctor.logo_url}
              alt={doctor.clinic_name}
              className="mx-auto h-16 w-16 rounded-2xl object-cover shadow-sm sm:h-20 sm:w-20"
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
              {selectedExperiences.length}/2
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
          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-bold">Treatment / Service</p>
                <p className="mt-1 text-sm text-slate-500">
                  What did you visit for?
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {selectedServices.length}/2
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
                  style={
                    language === item ? { color: theme.primary } : undefined
                  }
                  className={`min-h-11 rounded-lg text-sm font-bold capitalize ${language === item ? "bg-white shadow-sm" : "text-slate-500"}`}
                >
                  {item === "english" ? "English" : "Hinglish"}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {!reviews.length ? (
            <button
              type="button"
              disabled={
                !selectedExperiences.length ||
                (topServices.length > 0 && !selectedServices.length) ||
                loading
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
                  <button
                    type="button"
                    key={index}
                    onClick={() => setChoice(index)}
                    style={
                      choice === index
                        ? {
                            borderColor: theme.primary,
                            boxShadow: `0 0 0 2px ${theme.primary}22`,
                          }
                        : undefined
                    }
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm leading-6"
                  >
                    <div style={{ color: theme.accent }} className="flex gap-1">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star key={j} fill="currentColor" size={13} />
                      ))}
                    </div>
                    <p className="mt-2.5">{review}</p>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={post}
                style={{ background: theme.primary }}
                className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-bold text-white shadow-lg"
              >
                {copied ? (
                  <>
                    <Check size={20} />
                    Copied
                    {doctor.gmb_review_link
                      ? "! Opening Google…"
                      : " to clipboard"}
                  </>
                ) : (
                  <>
                    <Clipboard size={20} />
                    Copy & post on Google
                  </>
                )}
              </button>
            </div>
          )}
        </section>
        <footer className="px-2 pt-7 text-center text-xs text-slate-500">
          Powered by <b>MediRank</b> ·{" "}
          <a
            href="https://DocRevu.vyaparwallah.com"
            target="_blank"
            rel="noreferrer"
            className="font-extrabold underline underline-offset-2"
          >
            Vyapar Wallah
          </a>
        </footer>
      </div>
    </main>
  );
}
