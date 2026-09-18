import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.headers.get("cf-connecting-ip") || "unknown";
}

// In-memory sliding window rate limiter for login brute-force defense
const failedAttemptsByIp = new Map<string, { count: number; resetAt: number }>();
const failedAttemptsByEmail = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(map: Map<string, { count: number; resetAt: number }>, key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now > record.resetAt) {
    return false;
  }
  return record.count >= maxAttempts;
}

function recordFailedAttempt(map: Map<string, { count: number; resetAt: number }>, key: string, windowMs: number) {
  const now = Date.now();
  const record = map.get(key);
  if (!record || now > record.resetAt) {
    map.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    record.count += 1;
  }
}

function clearFailedAttempt(map: Map<string, { count: number; resetAt: number }>, key: string) {
  map.delete(key);
}

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320 || password.length < 6) {
      return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    }

    const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

    // 1. IP brute-force protection: Max 15 failed attempts per 10 mins
    if (clientIp !== "unknown" && isRateLimited(failedAttemptsByIp, clientIp, 15, WINDOW_MS)) {
      return NextResponse.json(
        { error: "Too many login attempts from this device. Please wait 10 minutes before trying again." },
        { status: 429 }
      );
    }

    // 2. Email account brute-force protection: Max 8 failed attempts per 10 mins
    if (isRateLimited(failedAttemptsByEmail, email, 8, WINDOW_MS)) {
      return NextResponse.json(
        { error: "Too many failed attempts on this account. Please wait 10 minutes or reset your password." },
        { status: 429 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json({ error: "Authentication is unavailable." }, { status: 503 });
    }

    const auth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error: authError } = await auth.auth.signInWithPassword({ email, password });
    if (authError || !data.session || !data.user) {
      if (clientIp !== "unknown") recordFailedAttempt(failedAttemptsByIp, clientIp, WINDOW_MS);
      recordFailedAttempt(failedAttemptsByEmail, email, WINDOW_MS);
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    // Clear failed attempts on successful credentials verification
    if (clientIp !== "unknown") clearFailedAttempt(failedAttemptsByIp, clientIp);
    clearFailedAttempt(failedAttemptsByEmail, email);

    // Credentials are valid, but no session is returned to the browser here.
    // The user must complete the email OTP challenge before verify-otp creates
    // and returns the authenticated session.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Unable to log in right now." }, { status: 500 });
  }
}
