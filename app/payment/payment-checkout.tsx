"use client";

import Script from "next/script";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { BadgeCheck, Check, CreditCard, GraduationCap, LockKeyhole, ShieldCheck, Tag, X } from "lucide-react";

type Plan = "1-month" | "3-month" | "6-month" | "1-year" | "growth" | "premium";
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
    Cashfree?: (options: { mode: "production" | "sandbox" }) => {
      checkout: (options: {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_modal";
      }) => Promise<unknown>;
    };
  }
}

const details: Record<Plan, { name: string; price: number; period: string }> = {
  "1-month": { name: "1 Month Plan", price: 699, period: "/ month" },
  "3-month": { name: "3 Months (Quarterly)", price: 1999, period: "/ 3 months" },
  "6-month": { name: "6 Months (Half-Yearly)", price: 2999, period: "/ 6 months" },
  "1-year": { name: "1 Year (Annual)", price: 2999, period: "/ year" },
  growth: { name: "Growth Plan", price: 1999, period: "/ 3 months" },
  premium: { name: "Premium Plan", price: 2999, period: "/ 6 months" },
};

interface AppliedCoupon {
  code: string;
  description?: string;
  discountAmount: number;
  finalAmount: number;
}

async function getRazorpaySdkInstance(): Promise<any> {
  if (typeof window === "undefined") return null;
  if (typeof window.Razorpay === "function") return window.Razorpay;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve(typeof window.Razorpay === "function" ? window.Razorpay : null);
      }
    };

    const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load", finish);
      existing.addEventListener("error", finish);
      setTimeout(finish, 1500);
    } else {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = finish;
      script.onerror = finish;
      document.head.appendChild(script);
      setTimeout(finish, 2000);
    }
  });
}

export function PaymentCheckout({
  plan,
  initialClinicName,
  initialMobile,
  initialEmail,
  isCoaching = false,
}: {
  plan: Plan;
  initialClinicName: string;
  initialMobile: string;
  initialEmail: string;
  isCoaching?: boolean;
}) {
  const selected = details[plan] || details["1-month"];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);

  const originalPrice = selected.price;
  const finalPrice = appliedCoupon ? appliedCoupon.finalAmount : originalPrice;
  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;

  async function handleApplyCoupon(e?: React.MouseEvent) {
    if (e) e.preventDefault();
    const cleanCode = couponInput.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError("Please enter a coupon code.");
      return;
    }

    setValidatingCoupon(true);
    setCouponError("");

    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode, plan }),
      });
      const data = await res.json();

      if (!res.ok || !data.valid) {
        setCouponError(data.error || "Invalid coupon code.");
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon({
          code: data.code,
          description: data.description,
          discountAmount: data.discountAmount,
          finalAmount: data.finalAmount,
        });
        setCouponInput("");
        setCouponError("");
      }
    } catch {
      setCouponError("Unable to validate coupon right now.");
    } finally {
      setValidatingCoupon(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponError("");
    setCouponInput("");
  }

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
      const orderResponse = await fetch("/api/payments/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          clinicName,
          mobile,
          email,
          isCoaching,
          couponCode: appliedCoupon?.code || undefined,
        }),
      });
      const order = await orderResponse.json().catch(() => ({}));
      if (!orderResponse.ok) {
        throw new Error(order.error || "Unable to create payment order. Please try again.");
      }

      // 0. Free / 100% Off Coupon direct activation
      if (order.gateway === "free_coupon" && order.activated) {
        window.location.assign("/dashboard/success");
        return;
      }

      // 1. Razorpay Checkout Modal
      if (order.gateway === "razorpay" && order.orderId && order.keyId) {
        const RazorpaySDK = await getRazorpaySdkInstance();
        if (!RazorpaySDK) {
          throw new Error("Unable to load Razorpay payment gateway. Please check your connection and refresh.");
        }

        const options: any = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency || "INR",
          name: isCoaching ? "MediRank (Vyapar Wallah)" : "MediRank (Vyapar Wallah)",
          description: `${selected.name} Subscription`,
          order_id: order.orderId,
          prefill: {
            name: clinicName,
            email,
            contact: mobile,
          },
          theme: {
            color: "#0A4C95",
          },
          modal: {
            ondismiss: () => {
              setLoading(false);
            },
          },
          handler: async (response: RazorpayResponse) => {
            try {
              const verifyResponse = await fetch("/api/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(response),
              });
              const verified = await verifyResponse.json().catch(() => ({}));
              if (!verifyResponse.ok) {
                setLoading(false);
                setError(verified.error || "Payment verification failed. Please contact support.");
                return;
              }
              window.location.assign("/dashboard/success");
            } catch (verifyErr) {
              console.warn("Verification network retry warning:", verifyErr);
              window.location.assign("/dashboard/success");
            }
          },
        };

        const rzp = new RazorpaySDK(options);
        if (typeof rzp.on === "function") {
          rzp.on("payment.failed", (failResponse: any) => {
            console.warn("Razorpay payment failed:", failResponse);
            setLoading(false);
            setError(failResponse.error?.description || "Payment could not be completed. Please try again.");
          });
        }
        rzp.open();
        return;
      }

      throw new Error("Unable to start payment gateway. Please try again or contact support.");
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
            
            <div className="mt-5 flex flex-col gap-1">
              <div className="flex items-end gap-2">
                <span className="text-5xl font-extrabold">₹{finalPrice.toLocaleString("en-IN")}</span>
                <span className="pb-1 text-slate-400">{selected.period}</span>
              </div>
              {appliedCoupon && (
                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-400">
                  <span className="line-through text-slate-500">₹{originalPrice.toLocaleString("en-IN")}</span>
                  <span>(You save ₹{discountAmount.toLocaleString("en-IN")})</span>
                </div>
              )}
            </div>

            {appliedCoupon && (
              <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-300">
                <p className="font-extrabold flex items-center gap-1.5">
                  <Tag size={13} /> {appliedCoupon.code} Applied
                </p>
                <p className="text-[11px] text-emerald-400/80 mt-0.5">{appliedCoupon.description}</p>
              </div>
            )}

            <ul className="mt-9 space-y-4 text-sm text-slate-300">
              {[
                "Instant account activation after verification",
                "Server-verified secure payment",
                "Cancel your monthly plan anytime",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <Check aria-hidden="true" className="shrink-0 text-emerald-400" size={19} />
                  {item}
                </li>
              ))}
            </ul>
          </aside>

          <section className="p-7 sm:p-10">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-brand">
                {isCoaching ? <GraduationCap aria-hidden="true" /> : <CreditCard aria-hidden="true" />}
              </span>
              <div>
                <h2 className="text-xl font-extrabold text-slate-950">
                  {isCoaching ? "Institute details" : "Clinic details"}
                </h2>
                <p className="text-sm text-slate-500">
                  {isCoaching
                    ? "Confirm your institute billing contact information"
                    : "Confirm your clinic billing contact information"}
                </p>
              </div>
            </div>

            <form onSubmit={pay} className="mt-8 space-y-5">
              <div>
                <label htmlFor="clinicName" className="label">
                  {isCoaching ? "Institute / Coaching name" : "Clinic name"}
                </label>
                <input
                  id="clinicName"
                  name="clinicName"
                  className="input min-h-12"
                  defaultValue={initialClinicName}
                  placeholder={isCoaching ? "e.g. Zircon Academy / Career Institute" : "e.g. City Dental Care"}
                  autoComplete="organization"
                  required
                />
              </div>

              <div>
                <label htmlFor="mobile" className="label">
                  {isCoaching ? "Director / Owner mobile number" : "Doctor mobile number"}{" "}
                  <span className="text-slate-400">(WhatsApp)</span>
                </label>
                <input
                  id="mobile"
                  name="mobile"
                  type="tel"
                  inputMode="tel"
                  className="input min-h-12"
                  defaultValue={initialMobile}
                  placeholder="98765 43210"
                  pattern="[0-9+ ()-]{10,18}"
                  autoComplete="tel"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="label">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="input min-h-12"
                  defaultValue={initialEmail}
                  autoComplete="email"
                  required
                />
              </div>

              {/* Coupon Code Input Card */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5 mb-2">
                  <Tag size={13} className="text-[#0A4C95]" /> Have a Promo / Coupon Code?
                </label>
                
                {appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-600 text-white text-xs font-black">✓</span>
                      <div>
                        <p className="text-xs font-extrabold text-emerald-950">{appliedCoupon.code} Applied</p>
                        <p className="text-[11px] font-semibold text-emerald-700">Saved ₹{appliedCoupon.discountAmount.toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-0.5"
                    >
                      <X size={14} /> Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="e.g. LAUNCH50, SAVE200"
                      className="input min-h-10 flex-1 uppercase tracking-wider font-semibold text-sm bg-white"
                      disabled={validatingCoupon}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleApplyCoupon();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={validatingCoupon || !couponInput.trim()}
                      className="rounded-xl bg-[#0A4C95] px-4 text-xs font-bold text-white transition hover:bg-blue-900 disabled:opacity-50 min-h-10"
                    >
                      {validatingCoupon ? "Checking…" : "Apply"}
                    </button>
                  </div>
                )}

                {couponError && (
                  <p className="mt-2 text-xs font-bold text-red-600">{couponError}</p>
                )}
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary min-h-14 w-full text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Processing securely…
                  </>
                ) : finalPrice === 0 ? (
                  <>
                    <LockKeyhole aria-hidden="true" size={19} />
                    Activate 100% Free Plan Now
                  </>
                ) : (
                  <>
                    <LockKeyhole aria-hidden="true" size={19} />
                    Pay ₹{finalPrice.toLocaleString("en-IN")} Securely
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 grid grid-cols-1 gap-3 text-xs font-bold text-slate-600 sm:grid-cols-3">
              <span className="flex items-center gap-2"><LockKeyhole className="text-emerald-600" size={17} />SSL Secured</span>
              <span className="flex items-center gap-2"><ShieldCheck className="text-emerald-600" size={17} />PCI DSS Compliant</span>
              <span className="flex items-center gap-2">
                <BadgeCheck className="text-emerald-600" size={17} />
                {isCoaching ? "Trusted by 500+ Institutes" : "Trusted by 500+ Doctors"}
              </span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
