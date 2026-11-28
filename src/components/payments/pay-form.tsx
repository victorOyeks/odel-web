"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import { cn } from "@/lib/cn";
import type { Fee, PayMethod, Payment } from "@/lib/types-b2";
import type { ApiError } from "@/lib/types";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-names";

const METHODS: { key: PayMethod; icon: IconName; title: string; body: string }[] = [
  { key: "CARD", icon: "payments", title: "Debit card", body: "Visa, Mastercard or Verve. You pay on Paystack's secure page and come straight back." },
  { key: "BANK_TRANSFER", icon: "account_balance", title: "Bank transfer", body: "We give you an account number for this payment. Send the exact amount within 30 minutes." },
  { key: "USSD", icon: "call", title: "USSD", body: "Dial a code from the phone linked to your bank. Works without data. GTBank, UBA, Sterling and Zenith." },
];

/** P-02 Pay: the fee, the three ways to pay, then checkout (card) or our own transfer / USSD page. */
export function PayForm({ fee }: { fee: Fee }) {
  const router = useRouter();
  const [method, setMethod] = useState<PayMethod>(fee.openPayment?.method ?? "CARD");
  const [bank, setBank] = useState(fee.ussdBanks[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const open = fee.openPayment;

  async function pay() {
    setBusy(true);
    setError(null);
    const r = await api<Payment>("POST", "/payments", { semesterId: fee.semesterId, method, ...(method === "USSD" ? { ussdBank: bank } : {}) });
    if (!r.ok) {
      setBusy(false);
      if (r.status === 401) return hardNavigate(`/sign-in?reason=idle&next=${encodeURIComponent("/payments/pay")}`);
      return setError(r.error);
    }
    if (r.data.method === "CARD" && r.data.checkout?.authorizationUrl) return hardNavigate(r.data.checkout.authorizationUrl);
    router.push(`/payments/${r.data.id}`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          pay();
        }}
      >
        {open && open.status === "PENDING" ? (
          <Banner tone="info" title="You already started a payment">
            {open.methodLabel} · <span className="font-mono">{open.reference}</span>.{" "}
            <Link href={`/payments/${open.id}`} className="font-semibold text-brand underline-offset-4 hover:underline">
              Continue it
            </Link>
            , or choose another way below: the one you started is cancelled and nothing is charged twice.
          </Banner>
        ) : null}
        {error ? (
          <Banner tone="danger" title={error.error === "already_paid" ? "Already paid" : error.error === "payment_confirming" ? "Do not pay again" : "Payment not started"}>
            {error.message}{" "}
            {error.error === "already_paid" || error.error === "payment_confirming" ? (
              <Link href="/payments" className="font-semibold text-brand underline-offset-4 hover:underline">
                See my payments
              </Link>
            ) : null}
          </Banner>
        ) : null}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-h4 text-ink">How do you want to pay?</legend>
          {METHODS.filter((m) => fee.methods.some((x) => x.key === m.key)).map((m) => {
            const on = method === m.key;
            return (
              <label key={m.key} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border bg-surface p-4", on ? "border-2 border-brand bg-brand-subtle" : "border-line hover:border-line-strong")}>
                <input type="radio" name="method" value={m.key} checked={on} onChange={() => setMethod(m.key)} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
                <Icon name={m.icon} size={24} className="mt-0.5 text-brand" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-label-lg text-ink">{m.title}</span>
                  <span className="text-body text-ink-2">{m.body}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {method === "USSD" ? (
          <SelectField label="Your bank (USSD)" value={bank} onChange={(e) => setBank(e.target.value)} hint={fee.ussdOtherBanks} error={error?.fields?.ussdBank}>
            {fee.ussdBanks.map((b) => (
              <option key={b.key} value={b.key}>
                {b.name} ({b.code})
              </option>
            ))}
          </SelectField>
        ) : null}
        <Button type="submit" size="lg" loading={busy} trailingIcon={method === "CARD" ? "open_in_new" : "arrow_forward"} className="sm:w-fit">
          {method === "CARD" ? `Pay ${fee.amountLabel} by card` : method === "USSD" ? "Get my USSD code" : "Get account details"}
        </Button>
        <p className="text-body-sm text-ink-2">
          Payments go through Paystack. We never see your card details. Your fee is marked paid only when your bank confirms the payment.
        </p>
      </form>
      <aside aria-label="Summary" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-h4 text-ink">Payment summary</h2>
        <dl className="flex flex-col gap-2 text-body">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Platform fee</dt>
            <dd className="text-ink">{fee.label}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-line pt-2">
            <dt className="font-semibold text-ink">Total</dt>
            <dd className="text-h4 text-ink">{fee.amountLabel}</dd>
          </div>
        </dl>
        <p className="text-body-sm text-ink-2">Pays for this semester only. It unlocks course registration and exams. Results are never held for the fee.</p>
      </aside>
    </div>
  );
}
