import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAndCalculateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

const pricesInRupees: Record<string, number> = {
  "1-month": 699,
  "3-month": 1999,
  "6-month": 2999,
  "1-year": 2999,
  growth: 1999,
  premium: 2999,
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

    const body = await request.json().catch(() => ({}));
    const plan = body.plan as keyof typeof pricesInRupees;
    if (!(plan in pricesInRupees)) return NextResponse.json({ error: "Invalid subscription plan." }, { status: 400 });
    
    const contactName = String(body.clinicName ?? "").trim();
    const contactEmail = String(body.email ?? "").trim();
    const contactMobile = String(body.mobile ?? "").trim();
    const couponCode = String(body.couponCode ?? "").trim().toUpperCase();

    if (!contactName || !contactEmail || !contactMobile) {
      return NextResponse.json({ error: "All billing contact fields are required." }, { status: 400 });
    }

    const { data: doctor } = await supabase
      .from("doctors")
      .select("id,clinic_name,doctor_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

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
          plan: plan,
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

    // Razorpay Gateway Order Creation
    const keyId = (
      process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY ||
      process.env.NEXT_PUBLIC_RAZORPAY_KEY ||
      ""
    ).trim();
    const keySecret = (
      process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_SECRET ||
      process.env.RAZORPAY_SECRET_KEY ||
      ""
    ).trim();

    if (!keyId || !keySecret) {
      console.error("Razorpay keys missing in environment variables.");
      return NextResponse.json(
        { error: "Razorpay credentials are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
        { status: 503 }
      );
    }

    const receipt = `mr_${doctor.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}_${Date.now().toString().slice(-8)}`;
    
    const razorpayPayload = {
      amount: pricePaise,
      currency: "INR",
      receipt,
      notes: {
        doctor_id: doctor.id,
        plan,
        coupon: appliedCouponCode || "none",
        clinic_name: contactName.slice(0, 50),
        mobile: contactMobile.slice(0, 20),
        email: contactEmail.slice(0, 50),
      },
    };

    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(razorpayPayload),
      cache: "no-store",
    });

    const order = await razorpayResponse.json().catch(() => ({}));
    if (!razorpayResponse.ok || !order.id) {
      console.error("Razorpay order creation failed", { status: razorpayResponse.status, error: order });
      const errorMsg = order.error?.description || order.error?.message || "Unable to create Razorpay payment order.";
      return NextResponse.json({ error: errorMsg }, { status: 502 });
    }

    const admin = createAdminClient() || supabase;
    try {
      // Safe DB insert that works across both legacy and new migrations
      const { error: insertErr } = await admin.from("payments").insert({
        doctor_id: doctor.id,
        plan,
        amount: pricePaise,
        razorpay_order_id: order.id,
        status: "pending",
      });

      if (insertErr) {
        console.warn("Retrying payment insert with fallback tier format:", insertErr);
        // Fallback for legacy DB schema with check constraint ('growth', 'premium')
        const fallbackPlan = (plan === "premium" || plan === "1-year") ? "premium" : "growth";
        await admin.from("payments").insert({
          doctor_id: doctor.id,
          plan: fallbackPlan,
          amount: pricePaise,
          razorpay_order_id: order.id,
          status: "pending",
        });
      }
    } catch (dbErr) {
      console.warn("Payment log record note:", dbErr);
    }

    return NextResponse.json({
      gateway: "razorpay",
      orderId: order.id,
      amount: pricePaise,
      keyId,
      currency: "INR",
      plan,
    });
  } catch (error: any) {
    console.error("Create payment order failed", error);
    return NextResponse.json({ error: error?.message || "Unable to start checkout." }, { status: 500 });
  }
}

