import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { Fee, Payment } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { FeeCard, PaymentRowCard } from "@/components/payments/fee-card";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";

export const metadata: Metadata = { title: "Payments" };

/** P-11 Payments: this semester's fee and every payment attempt, newest first (receipts stay here). */
export default async function PaymentsPage() {
  const s = await requireStudent();
  const [fee, mine] = await Promise.all([apiGet<Fee>("/payments/fees/current"), apiGet<{ items: Payment[] }>("/payments/mine")]);
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="payments" title="Payments">
      <h1 className="text-h2 text-ink">Payments</h1>
      {fee.ok ? (
        <div className="max-w-xl">
          <FeeCard fee={fee.data} />
        </div>
      ) : fee.status === 404 ? (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" icon="payments" title="No fee to pay yet">
            {fee.error.message ?? "Your university has not opened a session yet."} We email you when the platform fee is due.
          </PageState>
        </section>
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="error" action={<RetryButton variant="secondary" />}>
            We could not load your fee. Check your connection and try again.
          </PageState>
        </section>
      )}
      <section aria-labelledby="history" className="flex flex-col gap-3">
        <h2 id="history" className="text-h4 text-ink">
          Payment history
        </h2>
        {mine.ok && mine.data.items.length ? (
          <ul className="flex flex-col gap-2">
            {mine.data.items.map((p) => (
              <PaymentRowCard key={p.id} p={p} />
            ))}
          </ul>
        ) : mine.ok ? (
          <p className="text-body text-ink-2">No payments yet. When you pay, every attempt and receipt is listed here.</p>
        ) : (
          <p className="text-body text-ink-2">We could not load your payments. Refresh the page to try again.</p>
        )}
      </section>
    </StudentFrame>
  );
}
