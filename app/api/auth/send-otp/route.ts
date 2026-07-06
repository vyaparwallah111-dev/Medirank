import { NextResponse } from "next/server";
import { generateOtp } from "@/lib/auth/otp";
import { parseAuthRequest } from "@/lib/auth/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function getMailgunApiUrl(domain: string, region: string) {
  const apiHost = region.trim().toUpperCase() === "EU" ? "api.eu.mailgun.net" : "api.mailgun.net";
  return `https://${apiHost}/v3/${encodeURIComponent(domain)}/messages`;
}

export async function POST(request: Request) {
  try {
    const input = parseAuthRequest(await request.json());
    if (!input) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    const admin = createAdminClient();
    const apiKey = process.env.MAILGUN_API_KEY;
    const domain = process.env.MAILGUN_DOMAIN;
    const region = process.env.MAILGUN_REGION;
    const senderEmail = process.env.MAILGUN_SENDER_EMAIL;
    const senderName = process.env.MAILGUN_SENDER_NAME;
    if (!admin || !apiKey || !domain || !region || !senderEmail || !senderName) {
      console.error("OTP service is missing Supabase or Mailgun configuration.");
      return NextResponse.json({ error: "Verification email service is unavailable." }, { status: 503 });
    }

    const recent = new Date(Date.now() - 60_000).toISOString();
    const { data: latest, error: latestError } = await admin.from("auth_otps").select("created_at").eq("email", input.email).gte("created_at", recent).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    if (latest) return NextResponse.json({ error: "Please wait one minute before requesting another code." }, { status: 429 });

    const { code, expiresAt } = generateOtp();
    const { error: deleteError } = await admin.from("auth_otps").delete().eq("email", input.email).eq("is_verified", false);
    if (deleteError) throw deleteError;

    // id, is_verified, attempts, and created_at are populated by database defaults.
    const { error: insertError } = await admin.from("auth_otps").insert({
      email: input.email,
      otp_code: code,
      expires_at: expiresAt.toISOString(),
    });
    if (insertError) throw insertError;

    const message = new FormData();
    message.set("from", `${senderName} <${senderEmail}>`);
    message.set("to", input.email);
    message.set("subject", `${code} is your MediRank verification code`);
    message.set("text", `Your MediRank verification code is ${code}. It expires in 10 minutes. Never share this code with anyone. If you did not request it, ignore this email.`);
    message.set("html", `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><style>@media(max-width:600px){.shell{padding:24px 12px!important}.card-body{padding:30px 22px!important}.otp{font-size:30px!important;letter-spacing:7px!important}.title{font-size:24px!important}}</style></head><body style="margin:0;background:#eef4fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4fb"><tr><td class="shell" style="padding:48px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #dbeafe;border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(15,76,149,.12)"><tr><td style="height:8px;background:#0A4C95"></td></tr><tr><td class="card-body" style="padding:42px 40px"><div style="font-size:24px;font-weight:800;color:#0A4C95">Medi<span style="color:#2563eb">Rank</span></div><h1 class="title" style="margin:32px 0 12px;font-size:28px;line-height:1.25;color:#0f172a">Verify your email address</h1><p style="margin:0;color:#475569;font-size:16px;line-height:1.7">Use the secure code below to continue ${escapeHtml(input.mode === "signup" ? "creating your account" : "signing in")}.</p><div class="otp" style="margin:30px 0;padding:24px 12px;text-align:center;background:#eff6ff;border:2px solid #93c5fd;border-radius:14px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:36px;font-weight:900;line-height:1.2;letter-spacing:10px;color:#0A4C95">${code}</div><div style="padding:18px;background:#f8fafc;border-left:4px solid #2563eb;border-radius:8px;color:#334155;font-size:14px;line-height:1.65"><strong style="color:#0f172a">Security notice</strong><br>This code expires in <strong>10 minutes</strong>. Never share it with anyone—MediRank will never ask you for this code. If you did not request it, safely ignore this email.</div></td></tr><tr><td style="padding:22px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.5">MediRank by Vyapar Wallah &nbsp;•&nbsp; Secure account verification</td></tr></table></td></tr></table></body></html>`);

    let response: Response;
    try {
      response = await fetch(getMailgunApiUrl(domain, region), {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}` },
        body: message,
      });
    } catch (deliveryError) {
      await admin.from("auth_otps").delete().eq("email", input.email).eq("otp_code", code);
      console.error("Mailgun OTP delivery request failed:", deliveryError);
      return NextResponse.json({ error: "We could not send the verification email. Please try again." }, { status: 500 });
    }

    if (!response.ok) {
      await admin.from("auth_otps").delete().eq("email", input.email).eq("otp_code", code);
      console.error("Mailgun OTP delivery failed:", response.status, await response.text());
      return NextResponse.json({ error: "We could not send the verification email. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, expiresIn: 600 });
  } catch (error) {
    console.error("Send OTP error:", error);
    return NextResponse.json({ error: "Unable to send a verification code." }, { status: 500 });
  }
}
