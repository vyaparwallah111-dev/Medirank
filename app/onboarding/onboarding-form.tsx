"use client";

import { useState } from "react";
import { ChevronRight, GraduationCap, Loader2, Stethoscope } from "lucide-react";
import { completeOnboarding } from "./actions";

export function OnboardingForm() {
  const [businessType, setBusinessType] = useState<"doctor" | "coaching">("doctor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("business_type", businessType);
    try {
      const result = await completeOnboarding(formData);
      if (result?.error) {
        setError(result.error);
        setLoading(false);
      }
    } catch (err: any) {
      if (err?.message?.includes("NEXT_REDIRECT") || err?.digest?.includes("NEXT_REDIRECT")) {
        return;
      }
      setError(err?.message || "Failed to complete setup. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {/* Business Type Selector */}
      <div>
        <label className="label">Select your category</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setBusinessType("doctor")}
            className={`flex items-center justify-center gap-2.5 rounded-2xl border-2 p-3.5 text-sm font-extrabold transition ${
              businessType === "doctor"
                ? "border-brand bg-blue-50/70 text-brand shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <Stethoscope size={20} />
            Doctor / Clinic
          </button>
          <button
            type="button"
            onClick={() => setBusinessType("coaching")}
            className={`flex items-center justify-center gap-2.5 rounded-2xl border-2 p-3.5 text-sm font-extrabold transition ${
              businessType === "coaching"
                ? "border-brand bg-blue-50/70 text-brand shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            <GraduationCap size={20} />
            Coaching / Institute
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <p className="font-semibold">Unable to complete setup</p>
          <p className="mt-1 text-xs text-red-600">{error}</p>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {businessType === "doctor" ? (
          <>
            <div>
              <label className="label">Doctor’s name</label>
              <input name="doctor_name" className="input" placeholder="Dr. Ananya Mehta" required />
            </div>
            <div>
              <label className="label">Specialisation</label>
              <input name="specialization" className="input" placeholder="Dentist / Dermatologist" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Clinic name</label>
              <input name="clinic_name" className="input" placeholder="Mehta Dental Care" required />
            </div>
          </>
        ) : (
          <>
            <div className="sm:col-span-2">
              <label className="label">Coaching / Institute name</label>
              <input name="clinic_name" className="input" placeholder="e.g. Apex NEET Academy / Physics Point" required />
            </div>
            <div>
              <label className="label">Lead Teacher / Founder name</label>
              <input name="doctor_name" className="input" placeholder="e.g. Alok Sir / Irfan Sir" required />
            </div>
            <div>
              <label className="label">Exam / Category focus</label>
              <input name="specialization" className="input" placeholder="e.g. NEET / JEE / Class 9-12 / UPSC" required />
            </div>
          </>
        )}

        <div>
          <label className="label">City</label>
          <input name="city" className="input" placeholder="e.g. Kota / Delhi / Patna / Bengaluru" />
        </div>
        <div>
          <label className="label">Google review link</label>
          <input name="gmb_review_link" type="url" className="input" placeholder="https://g.page/r/..." />
        </div>
      </div>

      <button className="btn-primary min-h-12 w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            Setting up your profile...
          </>
        ) : (
          <>
            {businessType === "doctor" ? "Create my clinic profile" : "Create my coaching profile"}
            <ChevronRight size={18} />
          </>
        )}
      </button>
    </form>
  );
}

