import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
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

function inferPlanFromAmount(amountInPaise: number): string {
  const rs = amountInPaise / 100;
  if (rs >= 2900) return "1-year";
  if (rs >= 1500) return "6-month";
  if (rs >= 1900) return "premium";
  if (rs >= 900 && rs <= 1100) return "growth";
  if (rs >= 700) return "3-month";
  return "1-month";
}

export async function POST(request: Request) {
  try {
    const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    if (!secret || !signature) {
      console.warn("Razorpay webhook rejected: missing secret or signature header.");
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const rawBody = await request.text();
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      console.warn("Invalid Razorpay webhook signature.");
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
    }

    const eventType = event.event;
    if (eventType !== "payment.captured" && eventType !== "order.paid") {
      return NextResponse.json({ ok: true, ignored: true, event: eventType });
    }

    const entity = event.payload?.payment?.entity || event.payload?.order?.entity || {};
    const orderId = String(entity.order_id || entity.id || "").trim();
    const paymentId = String(entity.id || "").trim();
    const amount = Number(entity.amount || 0);

    if (!orderId) {
      return NextResponse.json({ error: "Invalid webhook payload: missing order ID." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      console.error("Database admin client unavailable in Razorpay webhook");
      return NextResponse.json({ error: "Payment service unavailable." }, { status: 503 });
    }

    const { data: payment, error: paymentLookupError } = await admin
      .from("payments")
      .select("id,doctor_id,plan,status,amount")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (paymentLookupError) throw paymentLookupError;

    let doctorId = payment?.doctor_id;
    let selectedPlan = payment?.plan || inferPlanFromAmount(amount);

    // If order was not found in payments table, check notes
    if (!doctorId && entity.notes?.doctor_id) {
      doctorId = entity.notes.doctor_id;
      if (entity.notes.plan) selectedPlan = entity.notes.plan;
    }

    if (!doctorId) {
      console.error("Razorpay webhook: Could not find doctor for order", orderId);
      return NextResponse.json({ error: "Doctor profile not found for this order." }, { status: 404 });
    }

    const days = planDaysMap[selectedPlan] || 30;
    const planStartedAt = new Date();
    const planExpiresAt = new Date(planStartedAt.getTime() + days * 24 * 60 * 60 * 1000);
    const tier = selectedPlan === "premium" || selectedPlan === "1-year" ? "premium" : "growth";

    // 1. Update doctor subscription
    const { error: doctorUpdateError } = await admin
      .from("doctors")
      .update({
        plan: selectedPlan,
        subscription_tier: tier,
        plan_started_at: planStartedAt.toISOString(),
        plan_expires_at: planExpiresAt.toISOString(),
        total_scans_used: 0,
      })
      .eq("id", doctorId);

    if (doctorUpdateError) throw doctorUpdateError;

    // 2. Update payment audit record
    if (payment) {
      await admin
        .from("payments")
        .update({
          razorpay_payment_id: paymentId,
          status: "success",
        })
        .eq("id", payment.id);
    } else {
      await admin.from("payments").insert({
        doctor_id: doctorId,
        plan: selectedPlan,
        amount: amount,
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        status: "success",
      });
    }

    console.log(`Razorpay subscription activated for doctor ${doctorId}: Plan=${selectedPlan}`);
    return NextResponse.json({ ok: true, plan: selectedPlan });
  } catch (error: any) {
    console.error("Razorpay webhook processing failed:", error);
    return NextResponse.json({ error: error?.message || "Webhook processing failed." }, { status: 500 });
  }
}

