import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";

export default function PaymentSuccessPage() {
  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="mx-auto max-w-lg w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl sm:p-12">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
          <CheckCircle2 aria-hidden="true" size={44} />
        </span>
        <h1 className="mt-6 text-2xl sm:text-3xl font-extrabold text-slate-950">Payment Successful!</h1>
        <p className="mt-3 text-sm sm:text-base leading-relaxed text-slate-600">
          Your payment and subscription have been verified securely. Your upgraded plan features are now active on your dashboard.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="btn-primary min-h-12 w-full text-base flex items-center justify-center gap-2"
          >
            Continue to Dashboard <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </main>
  );
}

