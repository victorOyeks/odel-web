"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatShort } from "@/lib/format";
import type { Fee, Payment, PaymentStatus } from "@/lib/types-b2";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: "neutral",
  CONFIRMING: "info",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  REFUNDING: "warning",
  REFUNDED: "neutral",
  REVERSED: "danger",
};

const FEE_TONE: Record<Fee["status"], { box: string; badge: BadgeTone }> = {
  NOT_PAID: { box: "bg-warning-subtle", badge: "warning" },
  REFUNDED: { box: "bg-warning-subtle", badge: "warning" },
  CONFIRMING: { box: "bg-info-subtle", badge: "info" },
  PAID: { box: "bg-success-subtle", badge: "success" },
  REVERSED: { box: "bg-danger-subtle", badge: "danger" },
};

/**
 * Home and Payments fee card (P-01 not paid, P-01e confirming "do not pay again", P-01b paid, E-07 paid twice,
 * E-08 reversed). Always names "session · semester". `registerHref` turns the paid card's main action into Register now.
 */
export function FeeCard({ fee, registerHref, compact }: { fee: Fee; registerHref?: string | null; compact?: boolean }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<string | null>(null);
  const tone = FEE_TONE[fee.status];
  const open = fee.openPayment;

  async function check() {
    if (!open) return router.refresh();
    setChecking(true);
    setChecked(null);
    const r = await api<Payment>("POST", `/payments/${open.id}/check`);
    setChecking(false);
    if (r.ok && r.data.status === "PAID") return router.refresh();
    setChecked(r.ok ? (r.data.status === "CONFIRMING" ? "Still confirming. Your bank has not answered yet: we email you as soon as it does." : r.data.message ?? "Not confirmed yet.") : r.error.message ?? "We could not check. Try again in a minute.");
    router.refresh();
  }

  return (
    <section aria-label={`Platform fee · ${fee.label}`} className={cn("flex w-full flex-col gap-3 rounded-lg p-4 sm:p-5", tone.box)}>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-label-sm text-ink-2">Platform fee · {fee.label}</p>
          <p className="text-h2 text-ink">{fee.amountLabel}</p>
        </div>
        <Badge tone={tone.badge}>{fee.statusLabel}</Badge>
      </div>
      <p className="text-body text-ink-2">{fee.message}</p>

      {fee.status === "PAID" && fee.paidPayment ? (
        <p className="text-body-sm text-ink-2">
          {fee.paidPayment.methodLabel} · reference <span className="font-mono">{fee.paidPayment.reference}</span>
        </p>
      ) : null}

      {fee.duplicate ? (
        <div className="flex items-start gap-2 rounded-md bg-surface p-3 text-body">
          <Icon name="undo" className="mt-0.5 text-warning" />
          <p className="min-w-0 flex-1 text-ink">
            You paid twice ({fee.duplicate.reference}, {formatShort(fee.duplicate.paidAt)}).{" "}
            {fee.duplicate.refund
              ? fee.duplicate.refund.status === "PROCESSED"
                ? `${fee.duplicate.refund.amountLabel} was refunded to ${fee.duplicate.refund.to ?? "your account"}.`
                : `${fee.duplicate.refund.amountLabel} is going back to ${fee.duplicate.refund.to ?? "your account"}${fee.duplicate.refund.expectedBy ? ` by ${formatDate(fee.duplicate.refund.expectedBy, false)}` : ""}. Refund ref ${fee.duplicate.refund.reference}.`
              : "We are sending the second payment back to you."}{" "}
            <Link href={`/payments/${fee.duplicate.paymentId}`} className="font-semibold text-brand underline-offset-4 hover:underline">
              See the refund
            </Link>
          </p>
        </div>
      ) : null}

      {fee.status === "REVERSED" && fee.reversal ? <p className="text-body text-ink">{fee.reversal.message}</p> : null}

      {checked ? (
        <p role="status" className="text-body text-ink">
          {checked}
        </p>
      ) : null}

      <div className={cn("flex flex-col gap-2", !compact && "sm:flex-row sm:flex-wrap")}>
        {fee.status === "CONFIRMING" ? (
          <>
            <Button size="lg" variant="secondary" leadingIcon="refresh" loading={checking} onClick={check}>
              Check payment status
            </Button>
            {open ? (
              <ButtonLink href={`/payments/${open.id}`} variant="ghost">
                See this payment
              </ButtonLink>
            ) : null}
          </>
        ) : fee.status === "PAID" ? (
          <>
            {registerHref ? (
              <ButtonLink href={registerHref} size="lg" trailingIcon="arrow_forward">
                Register now
              </ButtonLink>
            ) : null}
            {fee.paidPayment ? (
              <ButtonLink href={`/payments/${fee.paidPayment.id}/receipt`} size="lg" variant={registerHref ? "secondary" : "primary"} leadingIcon="download">
                Receipt
              </ButtonLink>
            ) : null}
          </>
        ) : (
          <>
            <ButtonLink href="/payments/pay" size="lg" block={compact}>
              {fee.status === "NOT_PAID" ? `Pay ${fee.amountLabel}` : `Pay ${fee.amountLabel} again`}
            </ButtonLink>
            {open && open.status === "PENDING" ? (
              <ButtonLink href={`/payments/${open.id}`} variant="ghost">
                Continue the payment you started
              </ButtonLink>
            ) : null}
          </>
        )}
      </div>
      {fee.status === "NOT_PAID" ? (
        <p className="flex items-start gap-2 text-body-sm text-ink-2">
          <Icon name="info" size={20} className="text-icon-2" />
          <span>
            Paid by transfer or USSD? It can take a few minutes to confirm.{" "}
            {open ? (
              <Link href={`/payments/${open.id}`} className="font-semibold text-brand underline-offset-4 hover:underline">
                Check payment status
              </Link>
            ) : (
              <Link href="/payments" className="font-semibold text-brand underline-offset-4 hover:underline">
                See my payments
              </Link>
            )}
          </span>
        </p>
      ) : null}
      {fee.status === "REVERSED" ? <p className="text-body-sm text-ink-2">Questions? Call the ODeL office at your study centre.</p> : null}
    </section>
  );
}

/** One payment attempt as a row (P-11). */
export function PaymentRowCard({ p }: { p: Payment }) {
  return (
    <li>
      <Link href={`/payments/${p.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 hover:border-brand">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
          <Icon name={p.method === "CARD" ? "payments" : p.method === "USSD" ? "call" : "account_balance"} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-label text-ink">
            {p.amountLabel} · {p.label}
          </span>
          <span className="truncate text-body-sm text-ink-2">
            {p.methodLabel} · <span className="font-mono">{p.reference}</span> · {formatShort(p.paidAt ?? p.startedAt)}
          </span>
        </span>
        <Badge tone={PAYMENT_TONE[p.status]}>{p.statusLabel}</Badge>
      </Link>
    </li>
  );
}
