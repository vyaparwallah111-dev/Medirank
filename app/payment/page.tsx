import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/dashboard";
import { PaymentCheckout } from "./payment-checkout";

export const metadata: Metadata = {
  title: "Secure Checkout | MediRank",
  description: "Complete your MediRank clinic subscription securely with Razorpay.",
  robots: { index: false, follow: false },
};

export default async function PaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }> | { plan?: string };
}) {
  const params = await Promise.resolve(searchParams);
  if (params.plan !== "growth" && params.plan !== "premium") redirect("/pricing");

  const { supabase, user } = await getAuthenticatedUser();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("clinic_name,phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (
    <PaymentCheckout
      plan={params.plan}
      initialClinicName={doctor?.clinic_name ?? ""}
      initialMobile={doctor?.phone ?? ""}
      initialEmail={user.email ?? ""}
    />
  );
}
