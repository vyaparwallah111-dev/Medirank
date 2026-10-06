import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const planDaysMap: Record<string, number> = {
  "1-month": 30,
  "3-month": 90,
  "6-month": 180,
  "1-year": 365,
  growth: 30,
  premium: 30,
};

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    if (!supabase) return NextResponse.json({ error: "Payment verification is unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const orderId = String(body.razorpay_order_id ?? "").trim();
    const paymentId = String(body.razorpay_payment_id ?? "").trim();
    const signature = String(body.razorpay_signature ?? "").trim();
    const secret = (process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || "").trim();

    if (!orderId || !paymentId || !signature || !secret) {
      return NextResponse.json({ error: "Incomplete payment verification data." }, { status: 400 });
    }

    const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });

    const admin = createAdminClient() || supabase;
    const { data: doctor } = await admin
      .from("doctors")
      .select("id,clinic_name,doctor_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!doctor) return NextResponse.json({ error: "Clinic profile not found." }, { status: 404 });

    const { data: payment } = await admin
      .from("payments")
      .select("id,doctor_id,plan,amount,status")
      .eq("doctor_id", doctor.id)
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (!payment) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });

    const selectedPlan = payment.plan || "1-month";
    const days = planDaysMap[selectedPlan] || 30;
    const planStartedAt = new Date();
    const planExpiresAt = new Date(planStartedAt.getTime() + days * 24 * 60 * 60 * 1000);
    const tier = selectedPlan === "premium" || selectedPlan === "1-year" ? "premium" : "growth";

    // Update subscription plan
    await admin.from("doctors").update({
      plan: selectedPlan,
      subscription_tier: tier,
      plan_started_at: planStartedAt.toISOString(),
      plan_expires_at: planExpiresAt.toISOString(),
      total_scans_used: 0,
    }).eq("id", doctor.id);

    // Update payment record status
    await admin.from("payments").update({
      razorpay_payment_id: paymentId,
      status: "success",
    }).eq("id", payment.id);

    return NextResponse.json({ ok: true, plan: selectedPlan });
  } catch (error: any) {
    console.error("Verify payment failed", error);
    return NextResponse.json({ error: error?.message || "Payment could not be verified." }, { status: 500 });
  }
}

