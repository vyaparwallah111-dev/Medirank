import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};
const validEvents = new Set(["scan", "copy", "click_maps"]);

async function logAnalyticsError(endpoint: string, error: unknown, doctorId?: string) {
  console.error(endpoint, error);
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.from("system_error_logs").insert({
      doctor_id: doctorId || null,
      endpoint,
      error_message: errorMessage(error).slice(0, 1000),
      severity: "error",
    });
  } catch (logError) {
    console.error("Analytics error log insert failed:", logError);
  }
}

export async function POST(request: Request) {
  let doctorId = "";
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid analytics payload." });
    }
    doctorId = typeof body?.doctor_id === "string" ? body.doctor_id.trim() : "";
    let scanId = typeof body?.scan_id === "string" ? body.scan_id : "";
    const eventType = typeof body?.event_type === "string" && validEvents.has(body.event_type) ? body.event_type : null;
    if (!doctorId || doctorId === "null" || doctorId === "undefined" || !uuidPattern.test(doctorId)) {
      return NextResponse.json({ ok: false, error: "Invalid doctor_id." }, { status: 400 });
    }
    if (!eventType) return NextResponse.json({ ok: false, error: "Invalid analytics event." }, { status: 400 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "Analytics is unavailable." });

    const { data: doctor, error: doctorError } = await admin.from("doctors").select("id").eq("id", doctorId).eq("is_active", true).maybeSingle();
    if (doctorError) throw doctorError;
    if (!doctor) return NextResponse.json({ ok: false, error: "Unknown clinic." });

    if (scanId) {
      const { data: scan, error: scanError } = await admin.from("scans").select("id").eq("id", scanId).eq("doctor_id", doctorId).maybeSingle();
      if (scanError) throw scanError;
      if (!scan) scanId = "";
    }

    if (!scanId) {
      const { data: scan, error: scanCreateError } = await admin.from("scans").insert({ doctor_id: doctorId, user_agent: "web" }).select("id").single();
      if (scanCreateError) throw scanCreateError;
      scanId = scan.id;
    }

    if (eventType !== "scan") {
      const scanFlag = eventType === "copy" ? { review_copied: true } : { redirected_to_gmb: true };
      const { error: scanUpdateError } = await admin.from("scans").update(scanFlag).eq("id", scanId).eq("doctor_id", doctorId);
      if (scanUpdateError) throw scanUpdateError;
    }

    const { error: scanEventError } = await admin.from("analytics_events").upsert(
      { doctor_id: doctorId, scan_id: scanId, event_type: "scan" },
      { onConflict: "scan_id,event_type" },
    );
    if (scanEventError) throw scanEventError;

    if (eventType !== "scan") {
      const { error: eventError } = await admin.from("analytics_events").upsert(
        { doctor_id: doctorId, scan_id: scanId, event_type: eventType },
        { onConflict: "scan_id,event_type" },
      );
      if (eventError) throw eventError;
    }
    return NextResponse.json({ ok: true, scan_id: scanId });
  } catch (error) {
    await logAnalyticsError("api/analytics/event", error, doctorId);
    return NextResponse.json({ ok: false, error: "Unable to record analytics event." });
  }
}
