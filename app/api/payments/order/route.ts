import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getCashfreeConfig, createCashfreeOrder } from "@/lib/cashfree";

export const runtime = "nodejs";

const pricesInRupees: Record<string, number> = {
  "1-month": 299,
  "3-month": 799,
  "6-month": 1599,
  "1-year": 2999,
  growth: 999,
  premium: 1999,
};

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    if (!supabase) return NextResponse.json({ error: "Payment service is unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });

    const body = await request.json();
    const plan = body.plan as keyof typeof pricesInRupees;
    if (!(plan in pricesInRupees)) return NextResponse.json({ error: "Invalid subscription plan." }, { status: 400 });
    
    const contactName = String(body.clinicName ?? "").trim();
    const contactEmail = String(body.email ?? "").trim();
    const contactMobile = String(body.mobile ?? "").trim();

    if (!contactName || !contactEmail || !contactMobile) {
      return NextResponse.json({ error: "All billing contact fields are required." }, { status: 400 });
    }

    const { data: doctor } = await supabase.from("doctors").select("id,clinic_name,doctor_name").eq("auth_user_id", user.id).maybeSingle();
    if (!doctor) return NextResponse.json({ error: "Complete your profile before upgrading." }, { status: 409 });

    const priceRupees = pricesInRupees[plan];
    const pricePaise = priceRupees * 100;
    const orderRefId = `order_${doctor.id.slice(0, 8)}_${Date.now()}`;

    // 1. Check for Cashfree Gateway
    const cashfreeConfig = getCashfreeConfig();
    if (cashfreeConfig) {
      try {
        const host = request.headers.get("host") || "medirank.vyaparwallah.com";
        const protocol = host.includes("localhost") ? "http" : "https";
        const returnUrl = `${protocol}://${host}/dashboard/success?order_id={order_id}`;
        const notifyUrl = `${protocol}://${host}/api/payments/cashfree-webhook`;

        const cashfreeOrder = await createCashfreeOrder({
          orderId: orderRefId,
          orderAmount: priceRupees,
          orderCurrency: "INR",
          customerId: `cust_${doctor.id.replace(/-/g, "").slice(0, 20)}`,
          customerName: contactName,
          customerEmail: contactEmail,
          customerPhone: contactMobile,
          returnUrl,
          notifyUrl,
          orderNote: `MediRank Subscription - ${plan}`,
          orderTags: {
            doctor_id: doctor.id,
            plan,
          },
        });

        // Safe DB record
        try {
          await supabase.from("payments").insert({
            doctor_id: doctor.id,
            amount: pricePaise,
            status: "pending",
          });
        } catch (dbErr) {
          console.warn("Payment log record note:", dbErr);
        }

        return NextResponse.json({
          gateway: "cashfree",
          orderId: cashfreeOrder.orderId,
          paymentSessionId: cashfreeOrder.paymentSessionId,
          amount: priceRupees,
          env: cashfreeOrder.env,
        });
      } catch (cfErr: any) {
        console.error("Cashfree order creation failed:", cfErr);
        return NextResponse.json({ error: cfErr?.message || "Failed to initialize Cashfree payment." }, { status: 502 });
      }
    }

    // 2. Fallback to Razorpay Gateway if configured
    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (keyId && keySecret) {
      const receipt = `medirank_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
      const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: pricePaise, currency: "INR", receipt }),
        cache: "no-store",
      });
      const order = await razorpayResponse.json();
      if (!razorpayResponse.ok || !order.id) {
        console.error("Razorpay order creation failed", { status: razorpayResponse.status, error: order.error });
        return NextResponse.json({ error: "Unable to create a secure payment order." }, { status: 502 });
      }

      try {
        await supabase.from("payments").insert({
          doctor_id: doctor.id,
          amount: pricePaise,
          status: "pending",
        });
      } catch (dbErr) {
        console.warn("Payment log record note:", dbErr);
      }

      return NextResponse.json({
        gateway: "razorpay",
        orderId: order.id,
        amount: pricePaise,
        keyId,
      });
    }

    return NextResponse.json({ error: "No payment gateway configured." }, { status: 503 });
  } catch (error) {
    console.error("Create payment order failed", error);
    return NextResponse.json({ error: "Unable to start checkout." }, { status: 500 });
  }
}
