import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doctorId = typeof body?.doctor_id === "string" ? body.doctor_id : "";
    let scanId = typeof body?.scan_id === "string" ? body.scan_id : "";
    const eventType = body?.event_type === "copy" || body?.event_type === "click_maps" ? body.event_type : null;
    if (!doctorId || !eventType) return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Analytics is unavailable." }, { status: 503 });

    const { data: doctor, error: doctorError } = await admin.from("doctors").select("id").eq("id", doctorId).eq("is_active", true).maybeSingle();
    if (doctorError) throw doctorError;
    if (!doctor) return NextResponse.json({ error: "Unknown clinic." }, { status: 404 });

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

    const scanFlag = eventType === "copy" ? { review_copied: true } : { redirected_to_gmb: true };
    const { error: scanUpdateError } = await admin.from("scans").update(scanFlag).eq("id", scanId).eq("doctor_id", doctorId);
    if (scanUpdateError) throw scanUpdateError;

    const { error: scanEventError } = await admin.from("analytics_events").upsert(
      { doctor_id: doctorId, scan_id: scanId, event_type: "scan" },
      { onConflict: "scan_id,event_type" },
    );
    if (scanEventError) throw scanEventError;

    const { error: eventError } = await admin.from("analytics_events").upsert(
      { doctor_id: doctorId, scan_id: scanId, event_type: eventType },
      { onConflict: "scan_id,event_type" },
    );
    if (eventError) throw eventError;
    return NextResponse.json({ ok: true, scan_id: scanId });
  } catch (error) {
    console.error("Analytics event capture failed:", error);
    const admin = createAdminClient();
    if (admin) {
      try {
        await admin.from("system_error_logs").insert({
          endpoint: "api/analytics/event",
          error_message: errorMessage(error).slice(0, 1000),
          severity: "error",
        });
      } catch (logError) {
        console.error("Analytics error log insert failed:", logError);
      }
    }
    return NextResponse.json({ error: "Unable to record analytics event." }, { status: 500 });
  }
}
