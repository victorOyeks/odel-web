"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { formatWhen, naira } from "@/lib/format";
import type { Bank, ResolvedAccount, UniversityPayments } from "@/lib/types-b2";
import { useAction } from "@/lib/use-action";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";

/** The bank list, loaded once per page. */
export function useBanks() {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ items: Bank[] }>("GET", "/platform/payments/banks").then((r) => {
      if (!alive) return;
      if (r.ok) setBanks(r.data.items);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { banks, failed };
}

/** Account number: digits while typing, masked (••••4521) once you leave the box. */
export function AccountNumberField({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean }) {
  const [focused, setFocused] = useState(false);
  const shown = focused || value.length < 10 ? value : `••••••${value.slice(-4)}`;
  return (
    <TextField
      label="Account number"
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
      placeholder="10 digits"
      error={error}
      disabled={disabled}
      hint="NUBAN, 10 digits. We only ever show the last four after you leave this box."
      inputClassName="font-mono"
    />
  );
}

/**
 * Bank → account number → Verify (the bank returns the account name) → the provider confirms the name.
 * `onResolved` hands back the resolution (valid 15 minutes); saving is the caller's job.
 */
export function SettlementAccountForm({ onResolved, resolved, disabled }: { onResolved: (r: ResolvedAccount | null) => void; resolved: ResolvedAccount | null; disabled?: boolean }) {
  const { banks, failed } = useBanks();
  const [bank, setBank] = useState(resolved?.bankCode ?? "");
  const [number, setNumber] = useState("");
  const act = useAction();
  async function verify() {
    onResolved(null);
    const f: Record<string, string> = {};
    if (!bank) f.bankCode = "Choose the bank.";
    if (!/^\d{10}$/.test(number)) f.accountNumber = "Enter the 10-digit account number.";
    if (Object.keys(f).length) return act.setFields(f);
    const r = await act.run<ResolvedAccount>("resolve", "POST", "/platform/payments/banks/resolve", { bankCode: bank, accountNumber: number });
    if (r.ok) onResolved(r.data);
  }
  return (
    <div className="flex flex-col gap-3">
      {failed ? <Banner tone="danger" title="Could not load the banks">Refresh the page to try again.</Banner> : null}
      <SelectField
        label="Bank"
        value={bank}
        disabled={disabled || !banks}
        onChange={(e) => {
          setBank(e.target.value);
          onResolved(null);
        }}
        error={act.fields.bankCode}
      >
        <option value="">{banks ? "Choose the bank" : "Loading banks…"}</option>
        {(banks ?? []).map((b) => (
          <option key={b.code} value={b.code}>
            {b.name}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <AccountNumberField
            value={number}
            disabled={disabled}
            onChange={(v) => {
              setNumber(v);
              onResolved(null);
            }}
            error={act.fields.accountNumber}
          />
        </div>
        <Button type="button" variant="secondary" className="sm:mt-6" loading={act.busy === "resolve"} disabled={disabled} onClick={verify}>
          Verify
        </Button>
      </div>
      {act.error && act.error.error === "not_resolved" ? <Banner tone="danger" title="Account not found">{act.error.message}</Banner> : act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Could not verify">{act.error.message}</Banner> : null}
      {resolved ? (
        <div className="flex items-start gap-3 rounded-lg bg-success-subtle p-3">
          <Icon name="check_circle" className="mt-0.5 text-success" />
          <div className="flex min-w-0 flex-col">
            <span className="text-label-lg text-ink">{resolved.accountName}</span>
            <span className="text-body-sm text-ink-2">
              {resolved.bankName} · {resolved.accountNumberMasked}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** SA-01b "Payments" card: fee, the split (provider only), settlement account; edit the fee, set or change the account. */
export function PaymentsCard({ tenantId, initial }: { tenantId: string; initial: UniversityPayments | null }) {
  const [p, setP] = useState(initial);
  const [editFee, setEditFee] = useState(false);
  const [editAccount, setEditAccount] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!p)
    return (
      <section className="rounded-lg border border-line bg-surface p-4">
        <p className="text-body text-ink-2">We could not load the payment settings. Refresh to try again.</p>
      </section>
    );
  const a = p.settlementAccount;
  return (
    <section aria-labelledby="pay-card" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="pay-card" className="min-w-0 flex-1 text-h4 text-ink">
          Payments
        </h2>
        <Badge tone={p.paymentsOpen ? "success" : "warning"}>{p.paymentsOpen ? "Students can pay" : "Not open yet"}</Badge>
      </div>
      {notice ? <Banner tone="success" title={notice} /> : null}
      <dl className="grid gap-x-6 gap-y-2 text-body sm:grid-cols-[200px_1fr]">
        <dt className="text-ink-2">Platform fee</dt>
        <dd className="text-ink">{naira(p.amount)} per student per semester</dd>
        <dt className="text-ink-2">Split per payment</dt>
        <dd className="text-ink">
          {naira(p.providerShare)} provider · {naira(p.centreShare)} ODeL centre <span className="text-ink-2">(Paystack&apos;s charge comes out of the provider&apos;s share)</span>
        </dd>
        <dt className="text-ink-2">Settlement account</dt>
        <dd className="text-ink">
          {a ? (
            <>
              {a.bankName} · <span className="font-mono">{a.accountNumberMasked}</span> · {a.accountName}
              <span className="block text-body-sm text-ink-2">
                Paystack subaccount {a.subaccountCode} · since {a.since ? formatWhen(a.since) : "—"}
                {a.updatedBy ? ` · by ${a.updatedBy.fullName}` : ""}
              </span>
            </>
          ) : (
            "Not set. Students cannot pay until it is."
          )}
        </dd>
      </dl>
      <p className="text-body-sm text-ink-2">Only the provider sees the split. The university sees the fee and a masked account, read-only.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" leadingIcon="edit" onClick={() => setEditFee(true)}>
          Change fee or split
        </Button>
        <Button variant={a ? "ghost" : "primary"} leadingIcon="account_balance" onClick={() => setEditAccount(true)}>
          {a ? "Change settlement account" : "Set the settlement account"}
        </Button>
      </div>
      {editFee ? (
        <FeePanel
          p={p}
          onClose={() => setEditFee(false)}
          onSaved={(x) => {
            setP(x);
            setEditFee(false);
            setNotice(`Saved: ${naira(x.amount)}, of which ${naira(x.centreShare)} goes to the ODeL centre. Applies to payments not started yet.`);
          }}
        />
      ) : null}
      {editAccount ? (
        <AccountPanel
          p={p}
          onClose={() => setEditAccount(false)}
          onSaved={(x) => {
            setP(x);
            setEditAccount(false);
            setNotice(`Saved the settlement account: ${x.settlementAccount?.bankName} ${x.settlementAccount?.accountNumberMasked}. Students can pay.`);
          }}
        />
      ) : null}
    </section>
  );
}

function FeePanel({ p, onClose, onSaved }: { p: UniversityPayments; onClose: () => void; onSaved: (x: UniversityPayments) => void }) {
  const act = useAction();
  const [amount, setAmount] = useState(String(p.amount));
  const [share, setShare] = useState(String(p.centreShare));
  const provider = Number(amount) - Number(share);
  async function save() {
    const r = await act.run<UniversityPayments>("save", "PUT", `/platform/payments/universities/${p.tenantId}`, { amount: Number(amount), centreShare: Number(share) });
    if (r.ok) onSaved(r.data);
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title={`Fee for ${p.name}`}
      description="A new amount applies to fees nobody has started paying."
      onSubmit={save}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            Save
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <TextField label="Platform fee per semester (₦)" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} error={act.fields.amount} hint="₦1,000 to ₦1,000,000." />
      <TextField label="ODeL centre's share (₦)" inputMode="numeric" value={share} onChange={(e) => setShare(e.target.value.replace(/\D/g, ""))} error={act.fields.centreShare} hint="A flat amount per payment, paid to the university's settlement account." />
      <p className="text-body text-ink">{provider >= 0 ? `Provider's share: ${naira(provider)} per payment, before Paystack's charge.` : "The centre's share cannot be more than the fee."}</p>
    </Panel>
  );
}

function AccountPanel({ p, onClose, onSaved }: { p: UniversityPayments; onClose: () => void; onSaved: (x: UniversityPayments) => void }) {
  const act = useAction();
  const [res, setRes] = useState<ResolvedAccount | null>(null);
  const [ok, setOk] = useState(false);
  async function save() {
    if (!res) return act.setError({ error: "resolve_first", message: "Verify the account number first." });
    if (!ok) return act.setFields({ confirm: "Tick the box to confirm this is the university's account." });
    const r = await act.run<UniversityPayments>("save", "PUT", `/platform/payments/universities/${p.tenantId}/settlement-account`, { resolutionId: res.resolutionId, confirmedAccountName: res.accountName });
    if (r.ok) onSaved(r.data);
    else if (r.error.error === "resolve_first") setRes(null);
  }
  return (
    <Panel
      open
      width="md"
      onClose={onClose}
      title={p.settlementAccount ? `Change ${p.name}'s settlement account` : `Settlement account for ${p.name}`}
      description="The ODeL centre's share of every payment goes to this account through a Paystack subaccount."
      onSubmit={save}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"} disabled={!res}>
            Save account
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <SettlementAccountForm
        resolved={res}
        onResolved={(r) => {
          setRes(r);
          setOk(false);
        }}
      />
      {res ? (
        <div className="flex flex-col gap-1">
          <Checkbox label={`${res.accountName} is the university's ODeL account`} checked={ok} onChange={(e) => setOk(e.target.checked)} hint="Check the name with the university before you save. Money goes here from the next payment." />
          {act.fields.confirm || act.fields.confirmedAccountName ? <p className="text-body-sm text-danger">{act.fields.confirm ?? act.fields.confirmedAccountName}</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
