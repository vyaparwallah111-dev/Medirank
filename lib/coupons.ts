export interface Coupon {
  code: string;
  description: string;
  discountType: "percent" | "flat" | "fixed_price";
  value: number; // percentage (e.g. 50) or flat discount in INR (e.g. 200) or fixed final price in INR (e.g. 10)
  minAmount?: number; // Minimum plan amount required in INR
  maxDiscount?: number; // Max discount cap for percent discounts in INR
  allowedPlans?: string[]; // Empty or omitted means valid for all plans
  expiresAt?: string; // ISO date string (e.g. "2026-12-31T23:59:59Z")
  isActive: boolean;
}

export const ACTIVE_COUPONS: Record<string, Coupon> = {
  PAY10: {
    code: "PAY10",
    description: "Special Promo - Pay only ₹10 for the plan",
    discountType: "fixed_price",
    value: 10,
    isActive: true,
  },
  OFFER10: {
    code: "OFFER10",
    description: "Special ₹10 Limited Offer",
    discountType: "fixed_price",
    value: 10,
    isActive: true,
  },
  SPECIAL10: {
    code: "SPECIAL10",
    description: "Special Access - Pay only ₹10",
    discountType: "fixed_price",
    value: 10,
    isActive: true,
  },
  SAVE789: {
    code: "SAVE789",
    description: "Flat ₹789 Off (Pay only ₹10 on ₹799 plan)",
    discountType: "flat",
    value: 789,
    isActive: true,
  },
  LAUNCH50: {
    code: "LAUNCH50",
    description: "50% Special Launch Discount",
    discountType: "percent",
    value: 50,
    isActive: true,
  },
  MEDIRANK20: {
    code: "MEDIRANK20",
    description: "20% Exclusive Discount",
    discountType: "percent",
    value: 20,
    isActive: true,
  },
  SAVE100: {
    code: "SAVE100",
    description: "Flat ₹100 Off on any plan",
    discountType: "flat",
    value: 100,
    isActive: true,
  },
  SAVE300: {
    code: "SAVE300",
    description: "Flat ₹300 Off on multi-month plans",
    discountType: "flat",
    value: 300,
    minAmount: 1800,
    isActive: true,
  },
  SAVE500: {
    code: "SAVE500",
    description: "Flat ₹500 Off on 6-month plans",
    discountType: "flat",
    value: 500,
    minAmount: 2800,
    isActive: true,
  },
  VIP100: {
    code: "VIP100",
    description: "100% VIP Free Access (Internal Admin Only)",
    discountType: "percent",
    value: 100,
    isActive: false, // Disabled by default for security against brute-force
  },
};

export interface CouponValidationResult {
  isValid: boolean;
  error?: string;
  coupon?: Coupon;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

export function validateAndCalculateCoupon(
  inputCode: string | null | undefined,
  originalAmountInRupees: number,
  plan: string
): CouponValidationResult {
  if (!inputCode || !inputCode.trim()) {
    return {
      isValid: false,
      originalAmount: originalAmountInRupees,
      discountAmount: 0,
      finalAmount: originalAmountInRupees,
    };
  }

  const code = inputCode.trim().toUpperCase();
  const coupon = ACTIVE_COUPONS[code];

  if (!coupon || !coupon.isActive) {
    return {
      isValid: false,
      error: "Invalid or expired coupon code.",
      originalAmount: originalAmountInRupees,
      discountAmount: 0,
      finalAmount: originalAmountInRupees,
    };
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return {
      isValid: false,
      error: "This coupon code has expired.",
      originalAmount: originalAmountInRupees,
      discountAmount: 0,
      finalAmount: originalAmountInRupees,
    };
  }

  if (coupon.minAmount && originalAmountInRupees < coupon.minAmount) {
    return {
      isValid: false,
      error: `This coupon requires a minimum plan value of ₹${coupon.minAmount}.`,
      originalAmount: originalAmountInRupees,
      discountAmount: 0,
      finalAmount: originalAmountInRupees,
    };
  }

  if (coupon.allowedPlans && coupon.allowedPlans.length > 0 && !coupon.allowedPlans.includes(plan)) {
    return {
      isValid: false,
      error: "This coupon is not applicable on the selected plan.",
      originalAmount: originalAmountInRupees,
      discountAmount: 0,
      finalAmount: originalAmountInRupees,
    };
  }

  let discountAmount = 0;
  let finalAmount = originalAmountInRupees;

  if (coupon.discountType === "fixed_price") {
    finalAmount = Math.min(originalAmountInRupees, Math.max(0, coupon.value));
    discountAmount = Math.max(0, originalAmountInRupees - finalAmount);
  } else if (coupon.discountType === "percent") {
    discountAmount = (originalAmountInRupees * coupon.value) / 100;
    if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
      discountAmount = coupon.maxDiscount;
    }
    discountAmount = Math.min(originalAmountInRupees, Math.max(0, discountAmount));
    finalAmount = Math.max(0, originalAmountInRupees - discountAmount);
  } else {
    discountAmount = Math.min(originalAmountInRupees, Math.max(0, coupon.value));
    finalAmount = Math.max(0, originalAmountInRupees - discountAmount);
  }

  return {
    isValid: true,
    coupon,
    originalAmount: originalAmountInRupees,
    discountAmount: Math.round(discountAmount),
    finalAmount: Math.round(finalAmount),
  };
}

