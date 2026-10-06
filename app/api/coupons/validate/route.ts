import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body.code || "").trim().toUpperCase();
    const plan = String(body.plan || "1-month");

    if (!code) {
      return NextResponse.json({ error: "Please enter a coupon code." }, { status: 400 });
    }

    const originalAmount = pricesInRupees[plan] || 299;
    const result = validateAndCalculateCoupon(code, originalAmount, plan);

    if (!result.isValid || result.error) {
      return NextResponse.json({ error: result.error || "Invalid coupon code." }, { status: 400 });
    }

    return NextResponse.json({
      valid: true,
      code: result.coupon?.code,
      description: result.coupon?.description,
      discountType: result.coupon?.discountType,
      value: result.coupon?.value,
      originalAmount: result.originalAmount,
      discountAmount: result.discountAmount,
      finalAmount: result.finalAmount,
    });
  } catch (err) {
    console.error("Coupon validation error:", err);
    return NextResponse.json({ error: "Unable to validate coupon." }, { status: 500 });
  }
}
