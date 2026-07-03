import { NextResponse } from "next/server";
import { generateOtp } from "@/lib/auth/otp";
import { parseAuthRequest } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function POST(request: Request) {
  try {
    const input = parseAuthRequest(await request.json());
    if (!input) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    const admin = createAdminClient();
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!admin || !apiKey || !senderEmail) {
      console.error("OTP service is missing Supabase or Brevo configuration.");
      return NextResponse.json({ error: "Verification email service is unavailable." }, { status: 503 });
    }

    const recent = new Date(Date.now() - 60_000).toISOString();
    const { data: latest } = await admin.from("auth_otps").select("created_at").eq("email", input.email).eq("auth_mode", input.mode).gte("created_at", recent).limit(1).maybeSingle();
    if (latest) return NextResponse.json({ error: "Please wait one minute before requesting another code." }, { status: 429 });

    const { code, expiresAt } = generateOtp();
    await admin.from("auth_otps").delete().eq("email", input.email).eq("auth_mode", input.mode).eq("is_verified", false);
    const { error: insertError } = await admin.from("auth_otps").insert({ email: input.email, otp_code: code, auth_mode: input.mode, expires_at: expiresAt.toISOString() });
    if (insertError) throw insertError;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || "MediRank", email: senderEmail },
        to: [{ email: input.email }],
        subject: `${code} is your MediRank verification code`,
        htmlContent: `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 12px 35px rgba(15,23,42,.08)"><tr><td style="height:7px;background:#0A4C95"></td></tr><tr><td style="padding:38px 36px"><div style="font-size:23px;font-weight:800;color:#0A4C95">Medi<span style="color:#F37021">Rank</span></div><h1 style="margin:30px 0 12px;font-size:25px;line-height:1.3">Verify your email</h1><p style="margin:0;color:#475569;line-height:1.7">Use this secure code to continue ${escapeHtml(input.mode === "signup" ? "creating your account" : "signing in")}.</p><div style="margin:28px 0;padding:22px;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;font-family:ui-monospace,monospace;font-size:34px;font-weight:900;letter-spacing:9px;color:#0A4C95">${code}</div><p style="margin:0;color:#475569;font-size:14px;line-height:1.6">This code expires in exactly <strong>10 minutes</strong>. If you did not request it, you can safely ignore this email.</p></td></tr><tr><td style="padding:20px 36px;background:#f8fafc;color:#94a3b8;font-size:12px">MediRank by Vyapar Wallah</td></tr></table></td></tr></table></body></html>`,
      }),
    });

    if (!response.ok) {
      await admin.from("auth_otps").delete().eq("email", input.email).eq("otp_code", code);
      console.error("Brevo OTP delivery failed:", response.status, await response.text());
      return NextResponse.json({ error: "We could not send the verification email. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, expiresIn: 600 });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json({ error: "Unable to send a verification code." }, { status: 500 });
  }
}
