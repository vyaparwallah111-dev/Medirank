import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    if (!supabase) return NextResponse.json({ error: "Payment verification is unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });

    const body = await request.json();
    const orderId = String(body.razorpay_order_id ?? "");
    const paymentId = String(body.razorpay_payment_id ?? "");
    const signature = String(body.razorpay_signature ?? "");
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!orderId || !paymentId || !signature || !secret) {
      return NextResponse.json({ error: "Incomplete payment verification data." }, { status: 400 });
    }

    const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
    const valid = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return NextResponse.json({ error: "Invalid payment signature." }, { status: 400 });

    const { data: doctor } = await supabase.from("doctors").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!doctor) return NextResponse.json({ error: "Clinic profile not found." }, { status: 404 });
    const { data: payment } = await supabase
      .from("payments")
      .select("id")
      .eq("doctor_id", doctor.id)
      .eq("razorpay_order_id", orderId)
      .maybeSingle();
    if (!payment) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });

    // The signed webhook, not this browser-originated callback, activates the plan.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Verify payment failed", error);
    return NextResponse.json({ error: "Payment could not be verified." }, { status: 500 });
  }
}
