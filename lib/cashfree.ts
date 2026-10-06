import { createHmac, timingSafeEqual } from "node:crypto";

export interface CashfreeConfig {
  appId: string;
  secretKey: string;
  env: "PRODUCTION" | "SANDBOX";
  apiVersion: string;
}

export function getCashfreeConfig(): CashfreeConfig | null {
  const appId = process.env.CASHFREE_APP_ID || process.env.CASHFREE_CLIENT_ID || process.env.NEXT_PUBLIC_CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY || process.env.CASHFREE_API_SECRET;
  const rawEnv = (process.env.CASHFREE_ENV || process.env.NEXT_PUBLIC_CASHFREE_ENV || "").trim().toUpperCase();
  
  if (!appId || !secretKey) {
    return null;
  }

  const isSandbox = rawEnv === "SANDBOX" || rawEnv === "TEST" || appId.startsWith("TEST");
  const env: "PRODUCTION" | "SANDBOX" = isSandbox ? "SANDBOX" : "PRODUCTION";
  const apiVersion = process.env.CASHFREE_API_VERSION || "2023-08-01";

  return {
    appId,
    secretKey,
    env,
    apiVersion,
  };
}

export function getCashfreeBaseUrl(env: "PRODUCTION" | "SANDBOX"): string {
  return env === "SANDBOX" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}

export interface CreateCashfreeOrderParams {
  orderId: string;
  orderAmount: number;
  orderCurrency?: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl?: string;
  notifyUrl?: string;
  orderNote?: string;
  orderTags?: Record<string, string>;
}

export async function createCashfreeOrder(params: CreateCashfreeOrderParams) {
  const config = getCashfreeConfig();
  if (!config) {
    throw new Error("Cashfree credentials are not configured.");
  }

  const baseUrl = getCashfreeBaseUrl(config.env);
  const cleanPhone = (params.customerPhone || "9999999999").replace(/[^\d]/g, "").slice(-10) || "9999999999";
  const cleanEmail = params.customerEmail && params.customerEmail.includes("@") ? params.customerEmail.trim() : "billing@medirank.vyaparwallah.com";
  const cleanName = (params.customerName || "Customer").trim().slice(0, 100) || "Customer";

  const payload: Record<string, unknown> = {
    order_id: params.orderId,
    order_amount: Number(params.orderAmount.toFixed(2)),
    order_currency: params.orderCurrency || "INR",
    customer_details: {
      customer_id: params.customerId.slice(0, 50),
      customer_name: cleanName,
      customer_email: cleanEmail,
      customer_phone: cleanPhone,
    },
    order_meta: {
      return_url: params.returnUrl || undefined,
      notify_url: params.notifyUrl || undefined,
    },
    order_note: params.orderNote || "MediRank Subscription",
    order_tags: params.orderTags || undefined,
  };

  const response = await fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: {
      "x-client-id": config.appId,
      "x-client-secret": config.secretKey,
      "x-api-version": config.apiVersion,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Cashfree order creation error:", { status: response.status, data });
    throw new Error(data.message || data.error || "Failed to create Cashfree order");
  }

  return {
    orderId: data.order_id,
    cfOrderId: data.cf_order_id,
    paymentSessionId: data.payment_session_id,
    orderStatus: data.order_status,
    env: config.env.toLowerCase(),
  };
}

export function verifyCashfreeWebhookSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secretKey: string
): boolean {
  if (!rawBody || !timestamp || !signature || !secretKey) {
    return false;
  }

  try {
    const payload = `${timestamp}${rawBody}`;
    const expected = createHmac("sha256", secretKey).update(payload).digest("base64");
    
    // Direct base64 comparison or buffer timing safe equal
    if (signature === expected) return true;

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (err) {
    console.error("Error verifying Cashfree webhook signature:", err);
    return false;
  }
}
