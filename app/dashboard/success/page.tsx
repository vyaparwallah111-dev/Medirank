import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default function PaymentSuccessPage() {
  return (
    <div className="mx-auto max-w-xl py-12 text-center sm:py-20">
      <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 aria-hidden="true" size={42} />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold text-slate-950">Payment received successfully</h1>
      <p className="mt-3 leading-7 text-slate-600">Razorpay is securely confirming your payment. Your upgraded plan will activate automatically after server verification.</p>
      <Link href="/dashboard" className="btn-primary mt-8 min-h-12">Continue to dashboard</Link>
    </div>
  );
}
