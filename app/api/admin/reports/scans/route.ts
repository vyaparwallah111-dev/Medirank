import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DoctorRow = { id: string; clinic_name: string | null; doctor_name: string | null };
type ScanRow = { id: string; doctor_id: string; created_at: string; review_generated: boolean | null; review_copied: boolean | null; redirected_to_gmb: boolean | null };
type EventRow = { id: string; doctor_id: string; scan_id: string | null; event_type: string; created_at: string };

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function fetchAll<T>(queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await queryFactory(from, from + 999);
    if (error) throw new Error(error.message || "Report query failed.");
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function GET() {
  try {
    const session = createClient();
    if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: { user } } = await session.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profile, error: profileError } = await session.from("doctors").select("is_admin,is_active").eq("auth_user_id", user.id).maybeSingle();
    if (profileError || profile?.is_admin !== true || profile?.is_active === false) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Report service unavailable." }, { status: 503 });

    const [doctors, scans, events] = await Promise.all([
      fetchAll<DoctorRow>((from, to) => admin.from("doctors").select("id,clinic_name,doctor_name").range(from, to)),
      fetchAll<ScanRow>((from, to) => admin.from("scans").select("id,doctor_id,created_at,review_generated,review_copied,redirected_to_gmb").order("created_at", { ascending: false }).range(from, to)),
      fetchAll<EventRow>((from, to) => admin.from("analytics_events").select("id,doctor_id,scan_id,event_type,created_at").order("created_at", { ascending: false }).range(from, to)),
    ]);

    const doctorsById = new Map(doctors.map((doctor) => [doctor.id, doctor]));
    const scanRows = scans.map((scan) => {
      const doctor = doctorsById.get(scan.doctor_id);
      return [
        "scan",
        scan.doctor_id,
        doctor?.clinic_name || "",
        doctor?.doctor_name || "",
        scan.id,
        "",
        scan.created_at,
        scan.review_generated ? "true" : "false",
        scan.review_copied ? "true" : "false",
        scan.redirected_to_gmb ? "true" : "false",
      ];
    });
    const eventRows = events.map((event) => {
      const doctor = doctorsById.get(event.doctor_id);
      return [
        "analytics_event",
        event.doctor_id,
        doctor?.clinic_name || "",
        doctor?.doctor_name || "",
        event.scan_id || "",
        event.event_type,
        event.created_at,
        "",
        "",
        "",
      ];
    });
    const header = ["record_type", "doctor_id", "clinic_name", "doctor_name", "scan_id", "event_type", "created_at", "review_generated", "review_copied", "redirected_to_gmb"];
    const csv = [header, ...scanRows, ...eventRows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const filename = `medirank-scan-report-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Admin scan report export failed:", error);
    return NextResponse.json({ error: "Unable to generate report." }, { status: 500 });
  }
}
