import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = request.headers.get("x-razorpay-signature") ?? "";
    if (!secret || !signature) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const rawBody = await request.text();
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });

    const event = JSON.parse(rawBody);
    if (event.event !== "payment.captured") return NextResponse.json({ ok: true, ignored: true });

    const entity = event.payload?.payment?.entity;
    const orderId = String(entity?.order_id ?? "");
    const paymentId = String(entity?.id ?? "");
    if (!orderId || !paymentId) return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Payment service unavailable." }, { status: 503 });
    const { data: payment, error: paymentLookupError } = await admin
      .from("payments")
      .select("id,doctor_id,plan,status,amount")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();
    if (paymentLookupError) throw paymentLookupError;
    if (!payment) return NextResponse.json({ error: "Unknown payment order." }, { status: 404 });
    if (Number(entity.amount) !== payment.amount) return NextResponse.json({ error: "Payment amount mismatch." }, { status: 400 });

    if (payment.status !== "success") {
      const { error: paymentUpdateError } = await admin.from("payments").update({
        razorpay_payment_id: paymentId,
        status: "success",
      }).eq("id", payment.id);
      if (paymentUpdateError) throw paymentUpdateError;

      const planDaysMap: Record<string, number> = {
        "1-month": 30,
        "3-month": 90,
        "6-month": 180,
        "1-year": 365,
        growth: 30,
        premium: 30,
      };
      const days = planDaysMap[payment.plan] || 30;
      const planStartedAt = new Date();
      const planExpiresAt = new Date(planStartedAt.getTime() + days * 24 * 60 * 60 * 1000);
      const tier = payment.plan === "premium" || payment.plan === "1-year" ? "premium" : "growth";
      const { error: doctorUpdateError } = await admin.from("doctors").update({
        plan: payment.plan,
        subscription_tier: tier,
        plan_started_at: planStartedAt.toISOString(),
        plan_expires_at: planExpiresAt.toISOString(),
        total_scans_used: 0,
      }).eq("id", payment.doctor_id);
      if (doctorUpdateError) throw doctorUpdateError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Razorpay webhook failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
