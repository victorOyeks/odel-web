import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import { formatDate, formatShort, formatWhen } from "@/lib/format";
import type { StudentFeeRecord } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { DataTable } from "@/components/ui/data-table";
import { Card, LoadFailed } from "@/components/staff/load-state";
import { PAYMENT_TONE } from "@/lib/b2-labels";
import { PAY_TONE } from "@/components/staff-b2/bits";

export const metadata: Metadata = { title: "Student payments" };

/** A-02 One student's platform fee: status, every attempt, refunds and reversals, receipts. Read-only. */
export default async function StudentPaymentsPage({ params }: PageProps<"/staff/payments/students/[id]">) {
  const { id } = await params;
  const res = await apiGet<StudentFeeRecord>(`/fees/students/${encodeURIComponent(id)}`).then(expectSession);
  if (!res.ok) return <LoadFailed result={res} what="this student's payments" />;
  const { student: st, fee, attempts } = res.data;
  return (
    <>
      <Link href="/staff/payments" className="inline-flex min-h-12 w-fit items-center font-semibold text-brand hover:underline md:min-h-0">
        ← Payments
      </Link>
      <PageHeader
        title={st.fullName}
        subtitle={[st.matricNumber, st.programme?.name && `${st.programme.name}${st.levelLabel ? ` · ${st.levelLabel}` : ""}`, st.centre?.name].filter(Boolean).join(" · ")}
        actions={
          <Link href={`/staff/registration/students/${st.id}`} className="inline-flex min-h-12 items-center font-semibold text-brand hover:underline md:min-h-10">
            Registration record
          </Link>
        }
      />
      {fee ? (
        <Card title={`Platform fee · ${fee.label}`} actions={<Badge tone={PAY_TONE[fee.status] ?? "neutral"}>{fee.statusLabel}</Badge>}>
          <p className="text-body text-ink">
            {fee.amountLabel} ·{" "}
            {fee.status === "PAID" && fee.paidPayment
              ? `paid ${formatWhen(fee.paidPayment.paidAt)} by ${fee.paidPayment.methodLabel} (${fee.paidPayment.reference})`
              : fee.status === "CONFIRMING"
                ? "a payment is waiting for the bank. The student has been told not to pay again."
                : fee.status === "REVERSED"
                  ? "the bank took the payment back. Registration and exams are locked; registered courses are kept."
                  : fee.status === "REFUNDED"
                    ? "the payment was refunded. The student must pay again."
                    : "not paid. The student cannot register or sit exams."}
          </p>
          {fee.duplicate ? (
            <Banner tone="warning" title={`Paid twice · ${fee.duplicate.reference}`}>
              The second payment ({formatShort(fee.duplicate.paidAt)}) is refunded automatically through Paystack
              {fee.duplicate.refund ? ` · refund ${fee.duplicate.refund.reference}, ${fee.duplicate.refund.status === "PROCESSED" ? "sent back" : `expected by ${formatDate(fee.duplicate.refund.expectedBy)}`}` : ""}. Nothing to do.
            </Banner>
          ) : null}
          {fee.reversal ? (
            <Banner tone="danger" title={`Reversed by the bank · ${fee.reversal.reference}`}>
              {formatWhen(fee.reversal.reversedAt)}. The student was emailed and must pay again; registered courses are kept.
            </Banner>
          ) : null}
        </Card>
      ) : null}
      <section aria-labelledby="attempts" className="flex flex-col gap-3">
        <h2 id="attempts" className="text-h4 text-ink">
          Payment attempts
        </h2>
        {attempts.length ? (
          <DataTable
            caption="Payment attempts"
            rows={attempts}
            rowKey={(p) => p.id}
            columns={[
              { header: "Started", cell: (p) => formatShort(p.startedAt), className: "whitespace-nowrap" },
              { header: "Method", cell: (p) => p.methodLabel },
              { header: "Reference", cell: (p) => <span className="font-mono">{p.reference}</span> },
              { header: "Status", cell: (p) => <Badge tone={PAYMENT_TONE[p.status]}>{p.statusLabel}</Badge> },
              {
                header: "Detail",
                cell: (p) =>
                  p.failureReason ??
                  (p.refund ? `Refund ${p.refund.reference} · ${p.refund.amountLabel} to ${p.refund.to ?? "the payer"} · ${p.refund.status === "PROCESSED" ? "sent" : p.refund.status === "FAILED" ? "failed, Paystack retries" : "on its way"}` : p.paidAt ? `Paid ${formatShort(p.paidAt)}` : "—"),
              },
            ]}
            rowAction={(p) =>
              p.receiptUrl ? (
                <a href={p.receiptUrl} download className="inline-flex min-h-12 items-center font-semibold text-brand hover:underline md:min-h-0">
                  Receipt
                </a>
              ) : null
            }
          />
        ) : (
          <p className="text-body text-ink-2">No payment attempts yet.</p>
        )}
      </section>
      <p className="text-body-sm text-ink-2">Only the bank&apos;s confirmation marks a fee paid. Nobody can mark it paid by hand.</p>
    </>
  );
}
