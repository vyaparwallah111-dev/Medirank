import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320 || password.length < 6) {
      return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
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
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    // Credentials are valid, but no session is returned to the browser here.
    // The user must complete the email OTP challenge before verify-otp creates
    // and returns the authenticated session.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Unable to log in right now." }, { status: 500 });
  }
}
