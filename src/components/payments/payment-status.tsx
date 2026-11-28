"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import { formatDate, formatWhen } from "@/lib/format";
import type { Payment } from "@/lib/types-b2";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-names";
import { PAYMENT_TONE } from "@/lib/b2-labels";

/** Copies a value; says so for screen readers. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 2000);
        } catch {
          /* the value stays on screen to copy by hand */
        }
      }}
      aria-label={done ? `${label} copied` : `Copy ${label}`}
      className="flex size-12 shrink-0 items-center justify-center rounded-md text-brand hover:bg-brand-subtle md:size-10"
    >
      <Icon name={done ? "check" : "content_copy"} />
    </button>
  );
}

/** "29:41" until the account or code runs out. */
function Countdown({ until, onEnd }: { until: string; onEnd: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(until) - Date.now()));
  const ended = useRef(false);
  useEffect(() => {
    const t = window.setInterval(() => {
      const l = Math.max(0, Date.parse(until) - Date.now());
      setLeft(l);
      if (l === 0 && !ended.current) {
        ended.current = true;
        onEnd();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [until, onEnd]);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <p className="flex items-center gap-2 text-body text-ink-2">
      <Icon name="schedule" className="text-icon-2" />
      {left > 0 ? (
        <span>
          This works for{" "}
          <span className="font-mono text-label-lg text-ink" role="timer" aria-live="off">
            {m}:{String(s).padStart(2, "0")}
          </span>
        </span>
      ) : (
        <span>Time is up.</span>
      )}
    </p>
  );
}

function Row({ label, value, copy, mono }: { label: string; value: string; copy?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-body-sm text-ink-2">{label}</dt>
        <dd className={mono ? "font-mono text-label-lg break-all text-ink" : "text-label-lg text-ink"}>{value}</dd>
      </div>
      {copy ? <CopyButton value={value.replace(/[₦,\s]/g, "")} label={label.toLowerCase()} /> : null}
    </div>
  );
}

function Hero({ icon, tone, title, children, spin }: { icon: IconName; tone: string; title: string; children?: ReactNode; spin?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 px-2 pt-2 text-center">
      <span className={`flex size-[72px] items-center justify-center rounded-full ${tone}`}>
        <Icon name={icon} size={32} className={spin ? "spin" : undefined} />
      </span>
      <h1 className="text-h2 text-ink">{title}</h1>
      {children ? <div className="max-w-md text-body-lg text-ink-2">{children}</div> : null}
    </div>
  );
}

const POLL_MS = 5000;
const POLL_TRIES = 36; // three minutes, then the page says the email will follow

/**
 * One payment, every state: P-03 card checkout to finish, P-04 transfer details with the 30-minute timer, P-04b USSD code,
 * P-05 confirming (polls Check), P-06 received, P-07 declined, P-08 checkout closed, expired, E-07b refund, E-08 reversed.
 * Nothing here marks a fee paid: the server only shows what the bank has confirmed.
 */
export function PaymentStatus({ initial, fromCheckout = false }: { initial: Payment; fromCheckout?: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  async function call(key: string, path: string) {
    setBusy(key);
    setError(null);
    const r = await api<Payment>("POST", path);
    setBusy(null);
    if (r.ok) {
      setP(r.data);
      return r.data;
    }
    if (r.status === 401) hardNavigate(`/sign-in?reason=idle&next=${encodeURIComponent(window.location.pathname)}`);
    setError(r.error.message ?? "That did not work. Try again.");
    return null;
  }

  // While the bank confirms, ask again every few seconds (display only; the webhook decides).
  useEffect(() => {
    if (p.status !== "CONFIRMING" || tries >= POLL_TRIES) return;
    const t = window.setTimeout(async () => {
      const r = await api<Payment>("POST", `/payments/${p.id}/check`);
      if (r.ok) setP(r.data);
      setTries((x) => x + 1);
    }, POLL_MS);
    return () => window.clearTimeout(t);
  }, [p.status, p.id, tries]);

  // When it lands, Home and the menu need the new state.
  const lastStatus = useRef(p.status);
  useEffect(() => {
    if (lastStatus.current !== p.status) router.refresh();
    lastStatus.current = p.status;
  }, [p.status, router]);

  async function anotherWay() {
    if (p.status === "PENDING") {
      const r = await call("cancel", `/payments/${p.id}/cancel`);
      if (!r) return;
    }
    router.push("/payments/pay");
  }

  const ref = (
    <p className="text-body text-ink-2">
      {p.label} · reference <span className="font-mono">{p.reference}</span>
    </p>
  );
  const err = error ? <Banner tone="danger" title="That did not work">{error}</Banner> : null;

  // ---- PENDING: the student still has something to do
  if (p.status === "PENDING" && p.transfer) {
    const t = p.transfer;
    return (
      <Card>
        <h1 className="text-h2 text-ink">Transfer {t.amountLabel} to this account</h1>
        {ref}
        {err}
        <dl className="flex flex-col gap-3 rounded-lg bg-brand-subtle p-4">
          <Row label="Bank" value={t.bankName} />
          <Row label="Account number" value={t.accountNumber} copy mono />
          <Row label="Account name" value={t.accountName} />
          <Row label="Amount" value={t.amountLabel} copy mono />
        </dl>
        <Countdown until={t.expiresAt} onEnd={() => call("check", `/payments/${p.id}/check`)} />
        <p className="text-body text-ink-2">{t.note} Use any bank app. After you send it, tap the button below.</p>
        <Actions>
          <Button size="lg" loading={busy === "sent"} onClick={() => call("sent", `/payments/${p.id}/sent`)}>
            I have made the transfer
          </Button>
          <Button size="lg" variant="ghost" loading={busy === "cancel"} onClick={anotherWay}>
            Pay another way
          </Button>
        </Actions>
      </Card>
    );
  }
  if (p.status === "PENDING" && p.ussd) {
    const u = p.ussd;
    return (
      <Card>
        <h1 className="text-h2 text-ink">Dial the code from the phone number linked to your {u.bank} account</h1>
        {ref}
        {err}
        <dl className="flex flex-col gap-3 rounded-lg bg-brand-subtle p-4">
          <Row label="Your bank" value={u.bank} />
          <Row label="Code to dial" value={u.code} copy mono />
          <Row label="Reference" value={p.reference} copy mono />
          <Row label="Amount" value={p.charge?.studentPays ? p.charge.totalLabel : `${p.amountLabel}.00`} copy mono />
        </dl>
        <a href={`tel:${encodeURIComponent(u.code)}`} className="inline-flex min-h-12 w-fit items-center gap-2 rounded-md px-3 font-semibold text-brand hover:bg-brand-subtle md:hidden">
          <Icon name="call" /> Dial it now
        </a>
        {p.charge?.studentPays && p.charge.note ? <p className="text-body-sm text-ink-2">{p.charge.note}</p> : null}
        <Countdown until={u.expiresAt} onEnd={() => call("check", `/payments/${p.id}/check`)} />
        <p className="text-body text-ink-2">Works without data or internet. Your bank asks for your PIN, then confirms the payment. Then come back and tap the button below.</p>
        <Actions>
          <Button size="lg" loading={busy === "sent"} onClick={() => call("sent", `/payments/${p.id}/sent`)}>
            I have dialled the code
          </Button>
          <Button size="lg" variant="ghost" loading={busy === "cancel"} onClick={anotherWay}>
            Pay another way
          </Button>
        </Actions>
      </Card>
    );
  }
  if (p.status === "PENDING") {
    const closed = fromCheckout || /closed/i.test(p.message ?? "");
    return (
      <Card>
        <Hero icon={closed ? "close" : "payments"} tone="bg-subtle text-icon-2" title={closed ? "You closed the payment page" : "Finish paying on the secure page"}>
          {closed ? "Nothing was charged. Go back to the payment page when you are ready, or pay another way." : p.message}
        </Hero>
        {ref}
        {err}
        <Actions center>
          {p.checkout ? (
            <ButtonLink href={p.checkout.authorizationUrl} external size="lg" trailingIcon="open_in_new">
              {closed ? "Go back to the payment page" : "Open the payment page"}
            </ButtonLink>
          ) : null}
          <Button size="lg" variant="ghost" loading={busy === "cancel"} onClick={anotherWay}>
            Pay another way
          </Button>
        </Actions>
      </Card>
    );
  }

  // ---- CONFIRMING (P-05)
  if (p.status === "CONFIRMING") {
    const gaveUp = tries >= POLL_TRIES;
    return (
      <Card>
        <Hero icon={gaveUp ? "hourglass_empty" : "progress_activity"} tone="bg-info-subtle text-info" spin={!gaveUp} title="We are confirming your payment">
          {gaveUp
            ? "Your bank has not answered yet. Transfers can take up to 30 minutes. You can leave this page: we email you and update Home as soon as it is confirmed."
            : "This usually takes under a minute. This page updates by itself."}
        </Hero>
        <Banner tone="warning" title="Do not pay again">
          If you pay again before this is confirmed, you will be charged twice. A second payment is refunded, but that takes up to 10 working days.
        </Banner>
        {ref}
        {err}
        <Actions center>
          <Button size="lg" variant="secondary" leadingIcon="refresh" loading={busy === "check"} onClick={() => (setTries(0), call("check", `/payments/${p.id}/check`))}>
            Check payment status
          </Button>
          <ButtonLink href="/" variant="ghost">
            Go to Home
          </ButtonLink>
        </Actions>
      </Card>
    );
  }

  // ---- PAID (P-06)
  if (p.status === "PAID") {
    return (
      <Card>
        <Hero icon="check_circle" tone="bg-success-subtle text-success" title="Payment received">
          {p.message ?? `Your platform fee for ${p.label} is paid.`} We have emailed your receipt.
        </Hero>
        <dl className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <Row label="Amount" value={p.charge?.studentPays ? `${p.charge.totalLabel} (${p.charge.feeLabel} fee + ${p.charge.chargeLabel} Paystack charge)` : p.amountLabel} />
          <Row label="For" value={`Platform fee · ${p.label}`} />
          <Row label="Paid with" value={p.methodLabel} />
          <Row label="Paid on" value={p.paidAt ? formatWhen(p.paidAt) : "—"} />
          <Row label="Reference" value={p.reference} mono />
        </dl>
        <Actions center>
          <ButtonLink href="/registration" size="lg" trailingIcon="arrow_forward">
            Register my courses
          </ButtonLink>
          <ButtonLink href={`/payments/${p.id}/receipt`} size="lg" variant="secondary" leadingIcon="download">
            View receipt
          </ButtonLink>
        </Actions>
      </Card>
    );
  }

  // ---- FAILED (P-07)
  if (p.status === "FAILED") {
    return (
      <Card>
        <Hero icon="error" tone="bg-danger-subtle text-danger" title="Your payment did not go through">
          {p.failureReason ?? p.message ?? "Nothing was charged."}
        </Hero>
        {ref}
        <Actions center>
          <ButtonLink href="/payments/pay" size="lg">
            Try again
          </ButtonLink>
          <ButtonLink href="/payments" variant="ghost">
            My payments
          </ButtonLink>
        </Actions>
      </Card>
    );
  }

  // ---- refunds and reversals (E-07b, E-08)
  if (p.status === "REFUNDING" || p.status === "REFUNDED") {
    const r = p.refund;
    return (
      <Card>
        <Hero icon="undo" tone="bg-warning-subtle text-warning" title={p.status === "REFUNDED" ? "Refunded" : "Your second payment is being refunded"}>
          {r?.reason ? `${r.reason}. ` : ""}Your fee stays paid: you do not need to do anything.
        </Hero>
        {r ? (
          <dl className="flex flex-col gap-3 rounded-lg border border-line p-4">
            <Row label="Refund" value={`${r.amountLabel} to ${r.to ?? "the account you paid from"}`} />
            <Row label="Refund reference" value={r.reference} mono />
            <Row label="Started" value={formatWhen(r.startedAt)} />
            <Row label={r.status === "PROCESSED" ? "Sent back" : "In your account by"} value={r.status === "PROCESSED" && r.processedAt ? formatWhen(r.processedAt) : r.expectedBy ? formatDate(r.expectedBy) : "within 10 working days"} />
            <Row label="Payment refunded" value={`${p.reference} · ${p.methodLabel}`} />
          </dl>
        ) : null}
        <p className="text-body text-ink-2">Banks take 5 to 10 working days. If it has not arrived by then, call the ODeL office with the refund reference.</p>
        <Actions center>
          <ButtonLink href="/payments" variant="secondary">
            My payments
          </ButtonLink>
        </Actions>
      </Card>
    );
  }
  if (p.status === "REVERSED") {
    return (
      <Card>
        <Hero icon="undo" tone="bg-danger-subtle text-danger" title="Your bank took this payment back">
          {p.message ?? "Registration and exams are locked until the fee is paid again. Your registered courses are kept."}
        </Hero>
        {ref}
        <Actions center>
          <ButtonLink href="/payments/pay" size="lg">
            Pay {p.amountLabel} again
          </ButtonLink>
        </Actions>
        <p className="text-center text-body-sm text-ink-2">Think this is a mistake? Call the ODeL office at your study centre with reference {p.reference}.</p>
      </Card>
    );
  }

  // ---- CANCELLED / EXPIRED
  return (
    <Card>
      <Hero icon={p.status === "EXPIRED" ? "schedule" : "close"} tone="bg-subtle text-icon-2" title={p.status === "EXPIRED" ? "This payment ran out of time" : "This payment was cancelled"}>
        {p.message ?? "Nothing was charged."}
      </Hero>
      {ref}
      <Actions center>
        <ButtonLink href="/payments/pay" size="lg">
          Start a new payment
        </ButtonLink>
        <ButtonLink href="/payments" variant="ghost">
          My payments
        </ButtonLink>
      </Actions>
      <p className="text-center text-body-sm text-ink-2">
        Already sent money to this account? Do not pay again: it is matched when it arrives.{" "}
        <Link href="/help" className="font-semibold text-brand">
          Get help
        </Link>
      </p>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <section className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">{children}</section>;
}

function Actions({ children, center }: { children: ReactNode; center?: boolean }) {
  return <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap ${center ? "sm:justify-center" : ""}`}>{children}</div>;
}

export function PaymentStatusBadge({ p }: { p: Payment }) {
  return <Badge tone={PAYMENT_TONE[p.status]}>{p.statusLabel}</Badge>;
}
