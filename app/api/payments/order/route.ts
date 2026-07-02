import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const prices = { growth: 99900, premium: 199900 } as const;

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    if (!supabase) return NextResponse.json({ error: "Payment service is unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });

    const body = await request.json();
    const plan = body.plan as keyof typeof prices;
    if (!(plan in prices)) return NextResponse.json({ error: "Invalid subscription plan." }, { status: 400 });
    if (!String(body.clinicName ?? "").trim() || !String(body.email ?? "").trim() || !String(body.mobile ?? "").trim()) {
      return NextResponse.json({ error: "All clinic contact fields are required." }, { status: 400 });
    }

    const { data: doctor } = await supabase.from("doctors").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!doctor) return NextResponse.json({ error: "Complete your clinic profile before upgrading." }, { status: 409 });

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 });

    const receipt = `medirank_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: prices[plan], currency: "INR", receipt }),
      cache: "no-store",
    });
    const order = await razorpayResponse.json();
    if (!razorpayResponse.ok || !order.id) {
      console.error("Razorpay order creation failed", { status: razorpayResponse.status, error: order.error });
      return NextResponse.json({ error: "Unable to create a secure payment order." }, { status: 502 });
    }

    const { error: paymentError } = await supabase.from("payments").insert({
      doctor_id: doctor.id,
      razorpay_order_id: order.id,
      plan,
      amount: prices[plan],
      status: "pending",
    });
    if (paymentError) {
      console.error("Payment audit insert failed", paymentError);
      return NextResponse.json({ error: "Unable to record the payment attempt." }, { status: 500 });
    }

    return NextResponse.json({ orderId: order.id, amount: prices[plan], keyId });
  } catch (error) {
    console.error("Create payment order failed", error);
    return NextResponse.json({ error: "Unable to start checkout." }, { status: 500 });
  }
}
