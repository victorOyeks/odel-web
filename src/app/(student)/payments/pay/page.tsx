import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { Fee } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { PayForm } from "@/components/payments/pay-form";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";

export const metadata: Metadata = { title: "Pay the platform fee" };

/** P-02 Pay your platform fee. A paid or confirming fee never offers Pay (no double payments from here). */
export default async function PayPage() {
  const s = await requireStudent();
  const fee = await apiGet<Fee>("/payments/fees/current");
  if (fee.ok && fee.data.status === "PAID") redirect("/payments");
  if (fee.ok && fee.data.status === "CONFIRMING" && fee.data.openPayment) redirect(`/payments/${fee.data.openPayment.id}`);
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="payments" title="Pay the platform fee">
      {fee.ok ? (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-h2 text-ink">Pay your platform fee · {fee.data.amountLabel}</h1>
            <p className="text-body text-ink-2">{fee.data.label}</p>
          </div>
          <PayForm fee={fee.data} />
        </>
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          {fee.status === 404 ? (
            <PageState kind="empty" icon="payments" title="No fee to pay yet" action={<ButtonLink href="/" variant="secondary">Go to Home</ButtonLink>}>
              {fee.error.message ?? "Your university has not opened a session yet."}
            </PageState>
          ) : (
            <PageState kind="error" action={<RetryButton variant="secondary" />}>
              We could not load your fee. Check your connection and try again. Nothing was charged.
            </PageState>
          )}
        </section>
      )}
    </StudentFrame>
  );
}
