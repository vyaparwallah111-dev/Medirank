import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const doctorId = typeof body?.doctor_id === "string" ? body.doctor_id : "";
    const scanId = typeof body?.scan_id === "string" ? body.scan_id : "";
    const eventType = body?.event_type === "copy" || body?.event_type === "click_maps" ? body.event_type : null;
    if (!doctorId || !scanId || !eventType) return NextResponse.json({ error: "Invalid analytics event." }, { status: 400 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Analytics is unavailable." }, { status: 503 });

    const { data: scan, error: scanError } = await admin.from("scans").select("doctor_id").eq("id", scanId).eq("doctor_id", doctorId).maybeSingle();
    if (scanError) throw scanError;
    if (!scan) return NextResponse.json({ error: "Unknown scan session." }, { status: 404 });

    const { error } = await admin.from("analytics_events").upsert(
      { doctor_id: doctorId, scan_id: scanId, event_type: eventType },
      { onConflict: "scan_id,event_type" },
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Analytics event capture failed:", error);
    return NextResponse.json({ error: "Unable to record analytics event." }, { status: 500 });
  }
}
