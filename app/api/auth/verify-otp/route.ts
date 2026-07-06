import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { otpMatches } from "@/lib/auth/otp";
import { parseAuthRequest } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseAuthRequest(body);
    const code = typeof body?.otp === "string" ? body.otp.trim().toUpperCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!input || !/^[A-Z0-9]{6}$/.test(code) || password.length < 6) return NextResponse.json({ error: "Enter the valid 6-character code and password." }, { status: 400 });

    const admin = createAdminClient();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!admin || !url || !anonKey) return NextResponse.json({ error: "Authentication is unavailable." }, { status: 503 });

    const { data: challenge, error: challengeError } = await admin.from("auth_otps").select("id,otp_code,expires_at,attempts,is_verified").eq("email", input.email).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (challengeError) throw challengeError;
    if (!challenge || challenge.is_verified) return NextResponse.json({ error: "This verification code is invalid or has already been used." }, { status: 400 });
    if (new Date(challenge.expires_at).getTime() <= Date.now()) return NextResponse.json({ error: "This verification code has expired. Request a new one." }, { status: 410 });
    if ((challenge.attempts ?? 0) >= 5) return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
    if (!otpMatches(code, challenge.otp_code)) {
      await admin.from("auth_otps").update({ attempts: (challenge.attempts ?? 0) + 1 }).eq("id", challenge.id);
      return NextResponse.json({ error: "The verification code is incorrect." }, { status: 400 });
    }

    const { data: claimed, error: verifiedError } = await admin.from("auth_otps").update({ is_verified: true }).eq("id", challenge.id).eq("is_verified", false).select("id").maybeSingle();
    if (verifiedError) throw verifiedError;
    if (!claimed) return NextResponse.json({ error: "This verification code has already been used." }, { status: 409 });

    if (input.mode === "signup") {
      const { error: createError } = await admin.auth.admin.createUser({ email: input.email, password, email_confirm: true });
      if (createError) return NextResponse.json({ error: createError.message.includes("registered") ? "An account already exists for this email. Please log in." : createError.message }, { status: 400 });
    }

    const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: authError } = await auth.auth.signInWithPassword({ email: input.email, password });
    if (authError || !data.session || !data.user) return NextResponse.json({ error: input.mode === "login" ? "Email or password is incorrect." : "Unable to start your account session." }, { status: 401 });

    const { data: profile } = await admin.from("doctors").select("is_admin,is_active").eq("auth_user_id", data.user.id).maybeSingle();
    if (profile?.is_active === false) return NextResponse.json({ error: "Your account is suspended. Please contact support." }, { status: 403 });

    return NextResponse.json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, destination: input.mode === "signup" ? "/onboarding" : profile?.is_admin ? "/admin/dashboard" : "/dashboard" });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return NextResponse.json({ error: "Unable to verify the code." }, { status: 500 });
  }
}
