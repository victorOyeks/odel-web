import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { Payment } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { PaymentStatus } from "@/components/payments/payment-status";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";

export const metadata: Metadata = { title: "Payment" };

/**
 * Back from Paystack's checkout (`/payments/return?reference=`). Asks the API what happened, for display only:
 * declined (P-07), closed (P-08), confirming (P-05, then it polls) or received (P-06). Coming back never marks a fee paid.
 */
export default async function PaymentReturnPage({ searchParams }: PageProps<"/payments/return">) {
  const sp = await searchParams;
  const reference = typeof sp.reference === "string" ? sp.reference : typeof sp.trxref === "string" ? sp.trxref : "";
  const s = await requireStudent();
  const p = reference ? await apiGet<Payment>(`/payments/return?reference=${encodeURIComponent(reference)}`) : null;
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="payments" title="Payment">
      {p?.ok ? (
        <PaymentStatus key={p.data.id} initial={p.data} fromCheckout={p.data.status === "PENDING"} />
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="error" title="We could not check this payment" action={<ButtonLink href="/payments" variant="secondary">My payments</ButtonLink>}>
            {p && !p.ok && p.status !== 404
              ? "We could not reach the payment service. Do not pay again: open My payments in a minute to see if it went through."
              : "This link has no payment we know. If money left your account, do not pay again: open My payments, or call the ODeL office."}
          </PageState>
        </section>
      )}
    </StudentFrame>
  );
}
