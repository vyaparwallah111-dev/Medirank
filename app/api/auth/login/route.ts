import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const admin = createAdminClient();
    if (!url || !anonKey || !admin) {
      return NextResponse.json({ error: "Authentication is unavailable." }, { status: 503 });
    }

    const auth = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error: authError } = await auth.auth.signInWithPassword({ email, password });
    if (authError || !data.session || !data.user) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await admin
      .from("doctors")
      .select("is_admin,is_active")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.is_active === false) {
      return NextResponse.json({ error: "Your account is suspended. Please contact support." }, { status: 403 });
    }

    return NextResponse.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      destination: profile?.is_admin ? "/admin/dashboard" : "/dashboard",
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Unable to log in right now." }, { status: 500 });
  }
}
