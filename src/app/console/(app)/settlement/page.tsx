import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import { formatShort, naira } from "@/lib/format";
import type { SettlementReport, UniversityPayments } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterSelect } from "@/components/ui/fields";
import { LiveSearchForm } from "@/components/ui/live-search";
import { Pager } from "@/components/ui/nav-bits";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";
import { ExportRows } from "@/components/staff/export-rows";
import { StatCard, StatGrid, dateInput, qs } from "@/components/staff-b2/bits";

export const metadata: Metadata = { title: "Settlement" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Settlement report (provider only): per payment ₦12,000 provider / ₦3,000 centre / Paystack's charge, with totals per university. */
export default async function SettlementPage({ searchParams }: PageProps<"/console/settlement">) {
  const sp = await searchParams;
  const f = { from: str(sp.from), to: str(sp.to), tenantId: str(sp.tenantId) };
  const page = str(sp.page) || "0";
  const [res, unis] = await Promise.all([
    apiGet<SettlementReport>(`/platform/payments/settlement?${qs(f, { page, size: "50" })}`).then(expectSession),
    apiGet<{ items: UniversityPayments[] }>("/platform/payments/universities"),
  ]);
  if (!res.ok)
    return (
      <section className="rounded-lg border border-line bg-surface">
        <PageState kind="error" headingLevel={1} action={<RetryButton variant="secondary" />}>
          We could not load the settlement report. Check your connection and try again.
        </PageState>
      </section>
    );
  const r = res.data;
  const t = r.totals;
  const href = (p: number) => `/settlement?${qs(f, { page: String(p) })}`;
  return (
    <>
      <PageHeader
        title="Settlement"
        subtitle={`Platform fee payments from ${r.from} to ${r.to}. Each centre gets its full share; where the student paid Paystack's charge, provider net counts it.`}
        actions={
          <ExportRows
            fileName={`settlement-${r.from}-${r.to}.csv`}
            rows={[["reference", "university", "matric_number", "semester", "paid_at", "method", "amount", "provider", "centre", "gateway_fee", "student_charge", "provider_net", "status"], ...r.items.map((i) => [i.reference, i.university, i.matricNumber, i.label, i.paidAt, i.method, i.amount, i.provider, i.centre, i.gatewayFee, i.studentCharge ?? 0, i.providerNet, i.status])]}
          />
        }
      />
      <LiveSearchForm action="/settlement" label="Choose the period" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <label className="flex flex-col gap-1 text-label text-ink">
          From
          <input type="date" name="from" defaultValue={f.from || r.from} className={dateInput} />
        </label>
        <label className="flex flex-col gap-1 text-label text-ink">
          To
          <input type="date" name="to" defaultValue={f.to || r.to} className={dateInput} />
        </label>
        <FilterSelect label="University" name="tenantId" defaultValue={f.tenantId}>
          <option value="">All</option>
          {(unis.ok ? unis.data.items : []).map((u) => (
            <option key={u.tenantId} value={u.tenantId}>
              {u.name}
            </option>
          ))}
        </FilterSelect>
      </LiveSearchForm>
      <StatGrid>
        <StatCard icon="payments" label="Payments" value={t.payments.toLocaleString("en-NG")} sub={`${naira(t.gross)} collected`} />
        <StatCard icon="account_balance" label="Provider" value={naira(t.provider)} sub="Before Paystack's charge" />
        <StatCard icon="location_on" label="ODeL centres" value={naira(t.centre)} sub="Paid to the universities" />
        <StatCard icon="calculate" label="Paystack charges" value={naira(t.gatewayFees)} sub="1.5% + ₦100, capped at ₦2,000" />
        <StatCard icon="check_circle" iconClass="text-success" label="Provider net" value={naira(t.providerNet)} />
        <StatCard icon="undo" label="Refunded" value={naira(t.refunded)} sub="Duplicates sent back" />
      </StatGrid>
      {r.universities.length > 1 ? (
        <DataTable
          caption="By university"
          rows={r.universities}
          rowKey={(u) => u.tenantId}
          columns={[
            { header: "University", cell: (u) => u.name },
            { header: "Payments", cell: (u) => u.payments.toLocaleString("en-NG"), numeric: true },
            { header: "Collected", cell: (u) => naira(u.gross), numeric: true },
            { header: "Provider", cell: (u) => naira(u.provider), numeric: true },
            { header: "Centre", cell: (u) => naira(u.centre), numeric: true },
            { header: "Paystack", cell: (u) => naira(u.gatewayFees), numeric: true },
            { header: "Provider net", cell: (u) => naira(u.providerNet), numeric: true },
          ]}
        />
      ) : null}
      {!r.items.length ? (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" icon="payments" title="No payments in this period" action={f.from || f.to || f.tenantId ? <ButtonLink href="/settlement" variant="secondary">This month</ButtonLink> : undefined}>
            Choose other dates or another university.
          </PageState>
        </section>
      ) : (
        <>
          <DataTable
            caption="Payments"
            rows={r.items}
            rowKey={(i) => i.reference}
            columns={[
              { header: "Reference", cell: (i) => <span className="font-mono">{i.reference}</span> },
              { header: "University", cell: (i) => i.university },
              { header: "Paid", cell: (i) => formatShort(i.paidAt), className: "whitespace-nowrap" },
              { header: "Amount", cell: (i) => naira(i.amount), numeric: true },
              { header: "Provider", cell: (i) => naira(i.provider), numeric: true },
              { header: "Centre", cell: (i) => naira(i.centre), numeric: true },
              { header: "Paystack", cell: (i) => naira(i.gatewayFee), numeric: true },
              ...(r.items.some((i) => i.studentCharge) ? [{ header: "Student paid charge", cell: (i: (typeof r.items)[number]) => naira(i.studentCharge ?? 0), numeric: true }] : []),
              { header: "Net", cell: (i) => naira(i.providerNet), numeric: true },
              { header: "Status", cell: (i) => <Badge tone={i.status === "PAID" ? "success" : i.status === "REVERSED" ? "danger" : "warning"}>{i.status === "PAID" ? "Paid" : i.status.charAt(0) + i.status.slice(1).toLowerCase()}</Badge> },
            ]}
          />
          <Pager page={r.page} size={r.size} total={r.total} href={href} noun="payments" />
        </>
      )}
    </>
  );
}
