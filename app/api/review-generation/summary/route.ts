import { NextResponse } from "next/server";
import { getCurrentDoctor } from "@/lib/dashboard";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAP = 5;

function getOperationalWindow(now=new Date()) {
  const istOffsetMs = 330 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const year = istNow.getUTCFullYear(), month = istNow.getUTCMonth(), date = istNow.getUTCDate();
  const start = new Date(Date.UTC(year, month, date, 9, 0, 0) - istOffsetMs);
  const end = new Date(Date.UTC(year, month, date, 21, 0, 0) - istOffsetMs);
  return { startIso: start.toISOString(), endIso: end.toISOString(), isActive: now >= start && now < end };
}

async function countFlag(db: NonNullable<ReturnType<typeof createAdminClient>>, doctorId: string, flag: "is_name_area_prompted" | "is_language_prompted" | "is_doctor_name_included", since: string, until: string) {
  return db.from("review_generation_meta").select("*", { count: "exact", head: true }).eq("doctor_id", doctorId).eq(flag, true).gte("created_at", since).lt("created_at", until);
}

export async function GET() {
  try {
    const doctor = await getCurrentDoctor();
    const db = createAdminClient();
    if (!db) return NextResponse.json({ ok: false, error: "Analytics unavailable." }, { status: 503 });
    const window = getOperationalWindow();
    const [language, nameArea, doctorName, total] = await Promise.all([
      countFlag(db, doctor.id, "is_language_prompted", window.startIso, window.endIso),
      countFlag(db, doctor.id, "is_name_area_prompted", window.startIso, window.endIso),
      countFlag(db, doctor.id, "is_doctor_name_included", window.startIso, window.endIso),
      db.from("review_generation_meta").select("*", { count: "exact", head: true }).eq("doctor_id", doctor.id).gte("created_at", window.startIso).lt("created_at", window.endIso),
    ]);
    const error = language.error || nameArea.error || doctorName.error || total.error;
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      window: { timezone: "Asia/Kolkata", start: window.startIso, end: window.endIso, active: window.isActive },
      caps: { language_triggers: CAP, name_area_prompts: CAP, doctor_name_injections: CAP },
      counts: {
        total_generations: total.count ?? 0,
        language_triggers: language.count ?? 0,
        name_area_prompts: nameArea.count ?? 0,
        doctor_name_injections: doctorName.count ?? 0,
      },
    });
  } catch (error) {
    console.error("review-generation summary failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load review generation summary." }, { status: 500 });
  }
}
