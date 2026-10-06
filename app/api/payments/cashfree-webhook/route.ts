import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCashfreeConfig, verifyCashfreeWebhookSignature } from "@/lib/cashfree";

export const runtime = "nodejs";

const planDaysMap: Record<string, number> = {
  "1-month": 30,
  "3-month": 90,
  "6-month": 180,
  "1-year": 365,
  growth: 30,
  premium: 30,
};

function inferPlanFromAmount(amount: number): string {
  if (amount >= 2900) return "1-year";
  if (amount >= 1500) return "6-month";
  if (amount >= 1900) return "premium";
  if (amount >= 900 && amount <= 1100) return "growth";
  if (amount >= 700) return "3-month";
  return "1-month";
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const timestamp = request.headers.get("x-webhook-timestamp") || "";
    const signature = request.headers.get("x-webhook-signature") || "";

    const config = getCashfreeConfig();
    if (!config) {
      console.error("Cashfree webhook received but credentials are not configured.");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Verify signature
    const isValid = verifyCashfreeWebhookSignature(rawBody, timestamp, signature, config.secretKey);
    if (!isValid) {
      console.warn("Invalid Cashfree webhook signature received.");
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const eventType = payload.type || payload.event || "";
    const data = payload.data || {};
    const payment = data.payment || {};
    const order = data.order || {};
    const customer = data.customer_details || {};

    const isSuccessEvent =
      eventType === "PAYMENT_SUCCESS_WEBHOOK" ||
      eventType === "ORDER_PAID" ||
      payment.payment_status === "SUCCESS" ||
      order.order_status === "PAID";

    if (!isSuccessEvent) {
      // Acknowledge other events (e.g. PAYMENT_FAILED_WEBHOOK, USER_DROPPED)
      return NextResponse.json({ ok: true, message: `Ignored event type: ${eventType}` });
    }

    const admin = createAdminClient();
    if (!admin) {
      console.error("Supabase admin client unavailable in Cashfree webhook");
      return NextResponse.json({ error: "Database service unavailable" }, { status: 503 });
    }

    const orderAmount = Number(payment.payment_amount || order.order_amount || 0);
    const tags = order.order_tags || {};
    let doctorId: string | null = tags.doctor_id || null;
    let plan: string = tags.plan || inferPlanFromAmount(orderAmount);

    // If doctor_id is not in tags, try finding via customer_id or email
    if (!doctorId && customer.customer_id) {
      const cleanCustId = customer.customer_id.replace(/^cust_/, "");
      const { data: matchedDoc } = await admin
        .from("doctors")
        .select("id")
        .filter("id", "ilike", `${cleanCustId}%`)
        .maybeSingle();
      if (matchedDoc) doctorId = matchedDoc.id;
    }

    if (!doctorId && customer.customer_email) {
      const { data: matchedDoc } = await admin
        .from("doctors")
        .select("id")
        .eq("email", customer.customer_email.trim().toLowerCase())
        .maybeSingle();
      if (matchedDoc) doctorId = matchedDoc.id;
    }

    if (!doctorId) {
      console.error("Could not associate Cashfree payment with any clinic/institute:", {
        orderId: order.order_id,
        customer,
      });
      return NextResponse.json({ error: "Profile not found for this transaction" }, { status: 404 });
    }

    const days = planDaysMap[plan] || 30;
    const planStartedAt = new Date();
    const planExpiresAt = new Date(planStartedAt.getTime() + days * 24 * 60 * 60 * 1000);
    const tier = plan === "premium" || plan === "1-year" ? "premium" : "growth";

    // 1. Update doctor / coaching profile subscription
    const { error: updateDocError } = await admin
      .from("doctors")
      .update({
        plan,
        subscription_tier: tier,
        plan_started_at: planStartedAt.toISOString(),
        plan_expires_at: planExpiresAt.toISOString(),
        total_scans_used: 0,
      })
      .eq("id", doctorId);

    if (updateDocError) {
      console.error("Failed to update profile subscription in Cashfree webhook:", updateDocError);
      throw updateDocError;
    }

    // 2. Insert audit record into payments table safely
    try {
      await admin.from("payments").insert({
        doctor_id: doctorId,
        amount: Math.round(orderAmount * 100),
        status: "success",
      });
    } catch (paymentInsertErr) {
      console.warn("Payment log entry warning:", paymentInsertErr);
    }

    console.log(`Cashfree subscription activated successfully for doctor ${doctorId}: Plan=${plan}`);
    return NextResponse.json({ ok: true, message: "Subscription activated successfully" });
  } catch (error: any) {
    console.error("Cashfree webhook processing failed:", error);
    return NextResponse.json({ error: error?.message || "Webhook processing error" }, { status: 500 });
  }
}
