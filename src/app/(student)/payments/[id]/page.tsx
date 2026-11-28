import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { Payment } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { PaymentStatus } from "@/components/payments/payment-status";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";

export const metadata: Metadata = { title: "Payment" };

/** One payment: transfer details, USSD code, confirming, received, declined, refund, reversal. */
export default async function PaymentPage({ params }: PageProps<"/payments/[id]">) {
  const { id } = await params;
  const s = await requireStudent();
  const p = await apiGet<Payment>(`/payments/${encodeURIComponent(id)}`);
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="payments" title="Payment">
      {p.ok ? (
        <PaymentStatus key={p.data.id} initial={p.data} />
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" icon="payments" title="We could not find that payment" action={<ButtonLink href="/payments" variant="secondary">My payments</ButtonLink>}>
            It may belong to another account, or the link is wrong. Your payments are all listed under Payments.
          </PageState>
        </section>
      )}
    </StudentFrame>
  );
}
