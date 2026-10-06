import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCashfreeConfig, createCashfreeOrder } from "@/lib/cashfree";
import { validateAndCalculateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

const pricesInRupees: Record<string, number> = {
  "1-month": 299,
  "3-month": 799,
  "6-month": 1599,
  "1-year": 2999,
  growth: 999,
  premium: 1999,
};

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
    if (!supabase) return NextResponse.json({ error: "Payment service is unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });

    const body = await request.json();
    const plan = body.plan as keyof typeof pricesInRupees;
    if (!(plan in pricesInRupees)) return NextResponse.json({ error: "Invalid subscription plan." }, { status: 400 });
    
    const contactName = String(body.clinicName ?? "").trim();
    const contactEmail = String(body.email ?? "").trim();
    const contactMobile = String(body.mobile ?? "").trim();
    const couponCode = String(body.couponCode ?? "").trim().toUpperCase();

    if (!contactName || !contactEmail || !contactMobile) {
      return NextResponse.json({ error: "All billing contact fields are required." }, { status: 400 });
    }

    const { data: doctor } = await supabase.from("doctors").select("id,clinic_name,doctor_name").eq("auth_user_id", user.id).maybeSingle();
    if (!doctor) return NextResponse.json({ error: "Complete your profile before upgrading." }, { status: 409 });

    const originalPriceRupees = pricesInRupees[plan];
    
    // Server-Side Coupon Validation
    let priceRupees = originalPriceRupees;
    let appliedCouponCode: string | null = null;

    if (couponCode) {
      const couponResult = validateAndCalculateCoupon(couponCode, originalPriceRupees, plan);
      if (couponResult.isValid) {
        priceRupees = couponResult.finalAmount;
        appliedCouponCode = couponCode;
      } else {
        return NextResponse.json({ error: couponResult.error || "Invalid coupon code." }, { status: 400 });
      }
    }

    // 100% Free / VIP Coupon: Activate immediately without payment gateway
    if (priceRupees === 0) {
      const days = planDaysMap[plan] || 30;
      const planStartedAt = new Date();
      const planExpiresAt = new Date(planStartedAt.getTime() + days * 24 * 60 * 60 * 1000);
      const tier = plan === "premium" || plan === "1-year" ? "premium" : "growth";

      const admin = createAdminClient() || supabase;
      const { error: updateError } = await admin.from("doctors").update({
        plan,
        subscription_tier: tier,
        plan_started_at: planStartedAt.toISOString(),
        plan_expires_at: planExpiresAt.toISOString(),
        total_scans_used: 0,
      }).eq("id", doctor.id);

      if (updateError) {
        console.error("Free coupon activation failed:", updateError);
        return NextResponse.json({ error: "Failed to activate coupon subscription." }, { status: 500 });
      }

      try {
        await admin.from("payments").insert({
          doctor_id: doctor.id,
          amount: 0,
          status: "success",
        });
      } catch (logErr) {
        console.warn("Free payment log note:", logErr);
      }

      return NextResponse.json({
        gateway: "free_coupon",
        activated: true,
        amount: 0,
        orderId: `free_${doctor.id.slice(0, 8)}_${Date.now()}`,
      });
    }

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
          orderNote: `MediRank Subscription - ${plan}${appliedCouponCode ? ` (Coupon: ${appliedCouponCode})` : ""}`,
          orderTags: {
            doctor_id: doctor.id,
            plan,
            coupon: appliedCouponCode || "none",
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
