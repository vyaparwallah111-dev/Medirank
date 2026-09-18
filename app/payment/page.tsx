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
  const resolvedParams = await Promise.resolve(searchParams);
  const validPlans = ["1-month", "3-month", "6-month", "1-year", "growth", "premium"] as const;
  type ValidPlan = (typeof validPlans)[number];
  const selectedPlan: ValidPlan =
    typeof resolvedParams?.plan === "string" && validPlans.includes(resolvedParams.plan as ValidPlan)
      ? (resolvedParams.plan as ValidPlan)
      : "1-month";

  const { supabase, user } = await getAuthenticatedUser();
  const { data: doctor } = await supabase
    .from("doctors")
    .select("clinic_name,phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return (
    <PaymentCheckout
      plan={selectedPlan}
      initialClinicName={doctor?.clinic_name ?? ""}
      initialMobile={doctor?.phone ?? ""}
      initialEmail={user.email ?? ""}
    />
  );
}
