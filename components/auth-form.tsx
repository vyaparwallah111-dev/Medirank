"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Credentials = { email: string; password: string };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [credentials, setCredentials] = useState<Credentials>({ email: "", password: "" });
  const [otp, setOtp] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [step, secondsLeft]);

  async function sendOtp(email: string) {
    const response = await fetch("/api/auth/send-otp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, mode }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to send verification code.");
    setSecondsLeft(result.expiresIn ?? 600);
  }

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const nextCredentials = { email: String(form.get("email")).trim().toLowerCase(), password: String(form.get("password")) };
    try {
      if (mode === "login") {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(nextCredentials),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to log in.");
        const supabase = createClient();
        if (!supabase) throw new Error("Supabase is not configured.");
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
        });
        if (sessionError) throw sessionError;
        router.replace(result.destination);
        router.refresh();
        return;
      }

      await sendOtp(nextCredentials.email);
      setCredentials(nextCredentials);
      setStep("otp");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...credentials, mode, otp }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to verify code.");
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error: sessionError } = await supabase.auth.setSession({ access_token: result.accessToken, refresh_token: result.refreshToken });
      if (sessionError) throw sessionError;
      router.replace(result.destination);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to verify code.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setError("");
    try {
      await sendOtp(credentials.email);
      setOtp("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to resend code.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = String(secondsLeft % 60).padStart(2, "0");
    return (
      <form onSubmit={verifyOtp} className="mt-8 space-y-5">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand text-white"><MailCheck size={23} /></span>
          <h2 className="mt-4 text-xl font-extrabold text-slate-950">Enter OTP Verification Code</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">We sent a 6-character code to <strong className="break-all text-slate-800">{credentials.email}</strong>.</p>
        </div>
        <div>
          <label className="label" htmlFor="otp-code">Verification code</label>
          <div className="relative">
            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
            <input id="otp-code" value={otp} onChange={(event) => setOtp(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} className="input pl-12 text-center font-mono text-2xl font-black uppercase tracking-[0.35em] text-brand" placeholder="A8F2K9" autoComplete="one-time-code" inputMode="text" pattern="[A-Z0-9]{6}" maxLength={6} autoFocus required />
          </div>
          <p className={`mt-2 text-center text-sm font-semibold ${secondsLeft ? "text-slate-500" : "text-red-600"}`}>{secondsLeft ? `Code expires in ${minutes}:${seconds}` : "Code expired"}</p>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button className="btn-primary min-h-12 w-full" disabled={loading || otp.length !== 6 || secondsLeft === 0}>{loading ? <Loader2 className="animate-spin" size={18} /> : <>Verify and continue <ArrowRight size={18} /></>}</button>
        <div className="flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={() => { setStep("credentials"); setOtp(""); setError(""); }} className="inline-flex items-center gap-1 font-semibold text-slate-600"><ArrowLeft size={15} /> Change email</button>
          <button type="button" onClick={resend} disabled={loading || secondsLeft > 540} className="font-bold text-brand disabled:cursor-not-allowed disabled:text-slate-400">Resend code</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submitCredentials} className="mt-8 space-y-5">
      <div><label className="label" htmlFor={`${mode}-email`}>Work email</label><input id={`${mode}-email`} name="email" type="email" className="input" placeholder="doctor@clinic.com" autoComplete="email" required /></div>
      <div>
        <div className="flex justify-between"><label className="label" htmlFor={`${mode}-password`}>Password</label>{mode === "login" && <button type="button" className="text-xs font-semibold text-brand">Forgot password?</button>}</div>
        <input id={`${mode}-password`} name="password" type="password" minLength={6} className="input" placeholder="At least 6 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} required />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button className="btn-primary min-h-12 w-full" disabled={loading}>{loading ? <Loader2 className="animate-spin" size={18} /> : <>{mode === "login" ? "Log in" : "Verify and create account"}<ArrowRight size={18} /></>}</button>
      <p className="text-center text-sm text-slate-500">{mode === "login" ? "New to MediRank?" : "Already have an account?"}{" "}<Link className="font-bold text-brand" href={mode === "login" ? "/signup" : "/login"}>{mode === "login" ? "Create account" : "Log in"}</Link></p>
    </form>
  );
}
