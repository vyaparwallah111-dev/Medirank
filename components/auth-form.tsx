"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    const data = new FormData(e.currentTarget),
      email = String(data.get("email")),
      password = String(data.get("password"));
    const s = createClient();
    if (!s) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const result =
      mode === "login"
        ? await s.auth.signInWithPassword({ email, password })
        : await s.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/onboarding`,
            },
          });
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setNotice(
        "Check your email to verify your account. After verification, you’ll continue to clinic setup.",
      );
      setLoading(false);
      return;
    }
    router.push(mode === "signup" ? "/onboarding" : "/dashboard");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div>
        <label className="label">Work email</label>
        <input
          name="email"
          type="email"
          className="input"
          placeholder="doctor@clinic.com"
          required
        />
      </div>
      <div>
        <div className="flex justify-between">
          <label className="label">Password</label>
          {mode === "login" && (
            <button type="button" className="text-xs font-semibold text-brand">
              Forgot password?
            </button>
          )}
        </div>
        <input
          name="password"
          type="password"
          minLength={6}
          className="input"
          placeholder="At least 6 characters"
          required
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </p>
      )}
      <button className="btn-primary w-full" disabled={loading || !!notice}>
        {loading ? (
          <Loader2 className="animate-spin" size={18} />
        ) : (
          <>
            {mode === "login" ? "Log in" : "Create my account"}
            <ArrowRight size={18} />
          </>
        )}
      </button>
      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? "New to MediRank?" : "Already have an account?"}{" "}
        <Link
          className="font-bold text-brand"
          href={mode === "login" ? "/signup" : "/login"}
        >
          {mode === "login" ? "Create account" : "Log in"}
        </Link>
      </p>
    </form>
  );
}
