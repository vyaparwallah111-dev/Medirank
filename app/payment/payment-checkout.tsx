"use client";

import Script from "next/script";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { BadgeCheck, Check, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";

type Plan = "growth" | "premium";
type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: RazorpayResponse) => Promise<void>;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

const details = {
  growth: { name: "Growth", price: 999 },
  premium: { name: "Clinic / Premium", price: 1999 },
} as const;

export function PaymentCheckout({
  plan,
  initialClinicName,
  initialMobile,
  initialEmail,
}: {
  plan: Plan;
  initialClinicName: string;
  initialMobile: string;
  initialEmail: string;
}) {
  const selected = details[plan];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const clinicName = String(form.get("clinicName") ?? "").trim();
    const mobile = String(form.get("mobile") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();

    try {
      if (!window.Razorpay) throw new Error("Secure checkout is still loading. Please try again.");
      const orderResponse = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, clinicName, mobile, email }),
      });
      const order = await orderResponse.json();
      if (!orderResponse.ok) throw new Error(order.error || "Unable to create payment order.");

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: "INR",
        name: "MediRank by Vyapar Wallah",
        description: `${selected.name} monthly subscription`,
        order_id: order.orderId,
        prefill: { name: clinicName, email, contact: mobile },
        theme: { color: "#1E40AF" },
        modal: { ondismiss: () => setLoading(false) },
        handler: async (response) => {
          const verifyResponse = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const verified = await verifyResponse.json();
          if (!verifyResponse.ok) {
            setLoading(false);
            setError(verified.error || "Payment verification failed. Contact support before retrying.");
            return;
          }
          window.location.assign("/dashboard/success");
        },
      });
      checkout.open();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start checkout.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-5 py-8 sm:py-14">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <div className="mx-auto max-w-5xl">
        <Link href="/pricing" className="text-sm font-bold text-brand hover:text-blue-800">← Back to pricing</Link>
        <div className="mt-6 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft lg:grid-cols-[.85fr_1.15fr]">
          <aside className="bg-slate-950 p-7 text-white sm:p-10">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-300">
              <LockKeyhole aria-hidden="true" size={17} /> Secure checkout
            </div>
            <p className="mt-8 text-sm font-bold uppercase tracking-[.18em] text-slate-400">Your plan</p>
            <h1 className="mt-2 text-3xl font-extrabold">{selected.name}</h1>
            <div className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-extrabold">₹{selected.price.toLocaleString("en-IN")}</span>
              <span className="pb-1 text-slate-400">/ month</span>
            </div>
            <ul className="mt-9 space-y-4 text-sm text-slate-300">
              {["Instant account activation after verification", "Server-verified secure payment", "Cancel your monthly plan anytime"].map((item) => (
                <li key={item} className="flex gap-3"><Check aria-hidden="true" className="shrink-0 text-emerald-400" size={19} />{item}</li>
              ))}
            </ul>
          </aside>

          <section className="p-7 sm:p-10">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-brand"><CreditCard aria-hidden="true" /></span>
              <div><h2 className="text-xl font-extrabold text-slate-950">Clinic details</h2><p className="text-sm text-slate-500">Confirm your billing contact information</p></div>
            </div>
            <form onSubmit={pay} className="mt-8 space-y-5">
              <div><label htmlFor="clinicName" className="label">Clinic name</label><input id="clinicName" name="clinicName" className="input min-h-12" defaultValue={initialClinicName} autoComplete="organization" required /></div>
              <div><label htmlFor="mobile" className="label">Doctor mobile number <span className="text-slate-400">(WhatsApp)</span></label><input id="mobile" name="mobile" type="tel" inputMode="tel" className="input min-h-12" defaultValue={initialMobile} placeholder="98765 43210" pattern="[0-9+ ()-]{10,18}" autoComplete="tel" required /></div>
              <div><label htmlFor="email" className="label">Email address</label><input id="email" name="email" type="email" className="input min-h-12" defaultValue={initialEmail} autoComplete="email" required /></div>
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary min-h-14 w-full text-base disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Processing securely…</> : <><LockKeyhole aria-hidden="true" size={19} /> Pay Securely via Razorpay</>}
              </button>
            </form>
            <div className="mt-7 grid grid-cols-1 gap-3 text-xs font-bold text-slate-600 sm:grid-cols-3">
              <span className="flex items-center gap-2"><LockKeyhole className="text-emerald-600" size={17} />SSL Secured</span>
              <span className="flex items-center gap-2"><ShieldCheck className="text-emerald-600" size={17} />PCI DSS Compliant</span>
              <span className="flex items-center gap-2"><BadgeCheck className="text-emerald-600" size={17} />Trusted by 500+ Doctors</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
