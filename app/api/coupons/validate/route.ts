import { NextResponse } from "next/server";
import { validateAndCalculateCoupon } from "@/lib/coupons";

export const runtime = "nodejs";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
}

// In-memory sliding window rate limiter to prevent coupon brute-forcing (max 10 attempts per minute per IP)
const couponAttemptsByIp = new Map<string, { count: number; resetAt: number }>();

const pricesInRupees: Record<string, number> = {
  "1-month": 699,
  "3-month": 1999,
  "6-month": 2999,
  "1-year": 2999,
  growth: 1999,
  premium: 2999,
};

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const now = Date.now();
    const ipRecord = couponAttemptsByIp.get(clientIp);

    if (ipRecord && now < ipRecord.resetAt && ipRecord.count >= 10) {
      return NextResponse.json(
        { error: "Too many coupon attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    if (!ipRecord || now > ipRecord.resetAt) {
      couponAttemptsByIp.set(clientIp, { count: 1, resetAt: now + 60_000 });
    } else {
      ipRecord.count += 1;
    }

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
