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

async function logSelectReviewError(error: unknown, doctorId?: string) {
  console.error("api/analytics/select-review", error);
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.from("system_error_logs").insert({
      doctor_id: doctorId || null,
      endpoint: "api/analytics/select-review",
      error_message: errorMessage(error).slice(0, 1000),
      severity: "error",
    });
  } catch (logError) {
    console.error("Select-review error log insert failed:", logError);
  }
}

// Marks which of the 3 generated drafts a patient actually copied. The row already carries
// rating/language/keywords in generation_metadata (set at generation time), so we only need the
// review's own id here - no need to resend rating/language/keywords from the client and risk them
// drifting from what was actually generated.
export async function POST(request: Request) {
  let doctorId = "";
  try {
    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid payload." }, { status: 400 });
    }
    doctorId = typeof body?.doctor_id === "string" ? body.doctor_id.trim() : "";
    const reviewId = typeof body?.review_id === "string" ? body.review_id.trim() : "";
    if (!doctorId || !uuidPattern.test(doctorId)) return NextResponse.json({ ok: false, error: "Invalid doctor_id." }, { status: 400 });
    if (!reviewId || !uuidPattern.test(reviewId)) return NextResponse.json({ ok: false, error: "Invalid review_id." }, { status: 400 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ ok: false, error: "Analytics is unavailable." });

    const { data: updated, error } = await admin
      .from("generated_reviews")
      .update({ selected: true, selected_at: new Date().toISOString() })
      .eq("id", reviewId)
      .eq("doctor_id", doctorId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ ok: false, error: "Review not found for this clinic." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await logSelectReviewError(error, doctorId);
    return NextResponse.json({ ok: false, error: "Unable to record selection." });
  }
}
