import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { Payment } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { Receipt } from "@/components/payments/receipt";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";

export const metadata: Metadata = { title: "Receipt" };

/** P-10 Receipt (any time from Payments, not only right after paying). */
export default async function ReceiptPage({ params }: PageProps<"/payments/[id]/receipt">) {
  const { id } = await params;
  const s = await requireStudent();
  const p = await apiGet<Payment>(`/payments/${encodeURIComponent(id)}`);
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="payments" title="Receipt">
      {p.ok && p.data.receiptUrl ? (
        <Receipt tenant={s.tenant} profile={s.profile} p={p.data} />
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" icon="payments" title="No receipt for this payment" action={<ButtonLink href="/payments" variant="secondary">My payments</ButtonLink>}>
            A receipt is made only when the bank confirms a payment. Your paid payments are listed under Payments.
          </PageState>
        </section>
      )}
    </StudentFrame>
  );
}
