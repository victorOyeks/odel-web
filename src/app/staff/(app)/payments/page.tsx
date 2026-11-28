import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import { formatShort } from "@/lib/format";
import type { Paged, Centre } from "@/lib/types-b1";
import type { FeeSettings, PaymentRow, PaymentsSummary } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterSelect, SearchBox } from "@/components/ui/fields";
import { LiveSearchForm } from "@/components/ui/live-search";
import { Pager } from "@/components/ui/nav-bits";
import { EmptyCard, LoadFailed } from "@/components/staff/load-state";
import { DownloadLink, PAY_TONE, StatCard, StatGrid, dateInput, qs } from "@/components/staff-b2/bits";

export const metadata: Metadata = { title: "Payments" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

const STATUSES: [string, string][] = [
  ["PAID", "Paid"],
  ["CONFIRMING", "Confirming"],
  ["NOT_PAID", "Not paid"],
  ["FAILED", "Failed"],
  ["PAID_TWICE", "Paid twice"],
  ["REFUNDED", "Refunded"],
  ["REVERSED", "Reversed"],
];

/** A-01 Platform fee payments: cards, live search and filters, CSV export; the fee and settlement account read-only. Never the split. */
export default async function PaymentsPage({ searchParams }: PageProps<"/staff/payments">) {
  const sp = await searchParams;
  const f = { q: str(sp.q), centre: str(sp.centre), status: str(sp.status), method: str(sp.method), from: str(sp.from), to: str(sp.to) };
  const page = str(sp.page) || "0";
  const [list, summary, settings, centres] = await Promise.all([
    apiGet<Paged<PaymentRow>>(`/fees/payments?${qs(f, { page, size: "20" })}`).then(expectSession),
    apiGet<PaymentsSummary>("/fees/payments/summary"),
    apiGet<FeeSettings>("/fees/settings"),
    apiGet<{ items: Centre[] }>("/academic/centres"),
  ]);
  if (!list.ok) {
    if (list.status === 404 && list.error.error === "no_session")
      return (
        <>
          <PageHeader title="Platform fee payments" />
          <EmptyCard title="No session yet" icon="payments" action={<ButtonLink href="/staff/academic-setup/sessions" variant="secondary">Set up the session</ButtonLink>}>
            {list.error.message ?? "Payments start when the session is set up."}
          </EmptyCard>
        </>
      );
    return <LoadFailed result={list} what="the payments" />;
  }
  const s = summary.ok ? summary.data : null;
  const filtered = Object.values(f).some(Boolean);
  const href = (p: number) => `/staff/payments?${qs(f, { page: String(p) })}`;
  const acc = settings.ok ? settings.data.settlementAccount : null;
  return (
    <>
      <PageHeader
        title="Platform fee payments"
        subtitle={s ? `${s.semester?.label ?? ""} · ${s.amountLabel}` : undefined}
        actions={<DownloadLink href={`/api/v1/fees/payments/export.csv?${qs(f)}`}>Export</DownloadLink>}
      />
      {settings.ok && !settings.data.paymentsOpen ? (
        <Banner tone="warning" title="Students cannot pay yet">
          The platform provider has not set up the university&apos;s settlement account. Contact the ODeL platform team.
        </Banner>
      ) : null}
      {s ? (
        <StatGrid>
          <StatCard icon="check_circle" iconClass="text-success" label="Paid" value={s.paid.count.toLocaleString("en-NG")} sub={s.paid.collectedLabel} />
          <StatCard icon="hourglass_empty" iconClass="text-info" label="Confirming" value={String(s.confirming.count)} sub={s.confirming.oldestStartedAt ? `Oldest since ${formatShort(s.confirming.oldestStartedAt)}` : "None waiting"} />
          <StatCard icon="error" iconClass="text-warning" label="Not paid" value={String(s.notPaid.count)} sub="Cannot register yet" />
          <StatCard icon="undo" label="Refunds" value={String(s.refunds.count)} sub={`Duplicates · ${s.refunds.amountLabel}`} />
          <StatCard icon="undo" iconClass="text-danger" label="Reversed" value={String(s.reversed.count)} sub="Taken back by the bank" />
          <StatCard icon="school" label="Students" value={String(s.students)} sub={settings.ok ? `Fee ${settings.data.amountLabel}` : undefined} />
        </StatGrid>
      ) : null}
      <LiveSearchForm action="/staff/payments" label="Find payments" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <SearchBox name="q" defaultValue={f.q} placeholder="Name, matric no. or reference" label="Search payments" />
        <FilterSelect label="Centre" name="centre" defaultValue={f.centre}>
          <option value="">All</option>
          {(centres.ok ? centres.data.items : []).map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" name="status" defaultValue={f.status}>
          <option value="">All</option>
          {STATUSES.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Method" name="method" defaultValue={f.method}>
          <option value="">All</option>
          <option value="CARD">Card</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="USSD">USSD</option>
        </FilterSelect>
        <label className="flex flex-col gap-1 text-label text-ink">
          Paid from
          <input type="date" name="from" defaultValue={f.from} className={dateInput} />
        </label>
        <label className="flex flex-col gap-1 text-label text-ink">
          To
          <input type="date" name="to" defaultValue={f.to} className={dateInput} />
        </label>
      </LiveSearchForm>
      {!list.data.items.length ? (
        <EmptyCard title={filtered ? "No payments match" : "No students yet"} icon="payments" action={filtered ? <ButtonLink href="/staff/payments" variant="secondary">Clear filters</ButtonLink> : undefined}>
          {filtered ? "Check the spelling, the matric number or the reference, or try fewer filters." : "Students appear here once they are imported."}
        </EmptyCard>
      ) : (
        <>
          <DataTable
            caption="Payments"
            rows={list.data.items}
            rowKey={(r) => r.studentId}
            columns={[
              { header: "Student", cell: (r) => <Link href={`/staff/payments/students/${r.studentId}`} className="font-semibold text-brand hover:underline">{r.fullName}</Link> },
              { header: "Matric no.", cell: (r) => <span className="font-mono">{r.matricNumber}</span> },
              { header: "Centre", cell: (r) => r.centre?.shortName ?? r.centre?.name ?? "—" },
              { header: "Method", cell: (r) => r.methodLabel ?? "—" },
              { header: "Reference", cell: (r) => (r.reference ? <span className="font-mono">{r.reference}</span> : "—") },
              { header: "Date", cell: (r) => formatShort(r.date), className: "whitespace-nowrap" },
              {
                header: "Status",
                cell: (r) => (
                  <span className="flex flex-wrap gap-1">
                    {r.paidTwice ? <Badge tone="warning">Paid twice</Badge> : null}
                    <Badge tone={PAY_TONE[r.status] ?? "neutral"}>{r.statusLabel}</Badge>
                  </span>
                ),
              },
            ]}
          />
          <Pager page={list.data.page} size={list.data.size} total={list.data.total} href={href} noun="students" />
        </>
      )}
      <section aria-labelledby="settings" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 sm:p-5">
        <h2 id="settings" className="text-h4 text-ink">
          Fee and settlement account
        </h2>
        {settings.ok ? (
          <dl className="grid gap-x-6 gap-y-1 text-body sm:grid-cols-[200px_1fr]">
            <dt className="text-ink-2">Platform fee</dt>
            <dd className="text-ink">{settings.data.amountLabel} per student per semester</dd>
            <dt className="text-ink-2">Settlement account</dt>
            <dd className="text-ink">{acc ? `${acc.bankName} · ${acc.accountNumberMasked} · ${acc.accountName}` : "Not set up yet"}</dd>
          </dl>
        ) : (
          <p className="text-body text-ink-2">We could not load the fee settings. Refresh to try again.</p>
        )}
        <p className="text-body-sm text-ink-2">The platform provider sets the fee and the account. To change either, contact the ODeL platform team.</p>
      </section>
    </>
  );
}
