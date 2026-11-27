import { LiveSearchForm } from "@/components/ui/live-search";
import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Paged, UniversityAuditItem } from "@/lib/types-b1";
import { formatWhen } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { FilterSelect } from "@/components/ui/fields";
import { Pager, TextLink } from "@/components/ui/nav-bits";
import { EmptyCard, LoadFailed } from "@/components/staff/load-state";
import { ExportRows } from "@/components/staff/export-rows";

export const metadata: Metadata = { title: "Audit log" };

const TYPES: Record<string, string> = { SIGN_IN: "Sign-ins", ROLES: "Roles", SETUP: "Setup", STUDENTS: "Students", OTHER: "Other" };
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** The university's audit log (gap in B1), in the style of the console's SA-09. */
export default async function AuditLogPage({ searchParams }: PageProps<"/staff/reports/audit">) {
  const sp = await searchParams;
  const f = { type: str(sp.type), from: str(sp.from), to: str(sp.to), page: str(sp.page) || "0" };
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  q.set("size", "50");
  const res = await apiGet<Paged<UniversityAuditItem>>(`/audit?${q}`).then(expectSession);
  const href = (p: number) => `/staff/reports/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(p) })}`;
  const filtered = !!(f.type || f.from || f.to);
  const dateInput = "h-12 rounded-md border border-line-strong bg-surface px-3 text-body text-ink md:h-10";
  return (
    <>
      <TextLink href="/staff/reports">← Reports</TextLink>
      <PageHeader
        title="Audit log"
        subtitle="Every sign-in, role change and setup change at the university, newest first. Kept for 7 years."
        actions={res.ok ? <ExportRows fileName="audit-log.csv" rows={[["When", "Who", "Role", "Type", "What", "Action", "IP"], ...res.data.items.map((a) => [a.at, a.actor?.fullName ?? "System", a.actor?.roleLabel ?? "", TYPES[a.type] ?? a.type, a.summary, a.action, a.ip ?? ""])]} /> : undefined}
      />
      <LiveSearchForm action="/staff/reports/audit" label="Filter the audit log" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <FilterSelect label="Show" name="type" defaultValue={f.type}>
          <option value="">Everything</option>
          {Object.entries(TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </FilterSelect>
        <label className="flex flex-col gap-1 text-label text-ink">
          From
          <input type="date" name="from" defaultValue={f.from} className={dateInput} />
        </label>
        <label className="flex flex-col gap-1 text-label text-ink">
          To
          <input type="date" name="to" defaultValue={f.to} className={dateInput} />
        </label>
      </LiveSearchForm>
      {!res.ok ? (
        <LoadFailed result={res} what="the audit log" />
      ) : !res.data.items.length ? (
        <EmptyCard title={filtered ? "Nothing in this range" : "Nothing recorded yet"} icon="history">
          {filtered ? "Try other dates or show everything." : "Sign-ins and changes appear here as they happen."}
        </EmptyCard>
      ) : (
        <>
          <DataTable
            caption="Audit log, newest first"
            rows={res.data.items}
            rowKey={(a) => a.id}
            columns={[
              { header: "When", cell: (a) => <time dateTime={a.at}>{formatWhen(a.at)}</time>, className: "whitespace-nowrap" },
              { header: "Who", cell: (a) => (a.actor ? <span>{a.actor.fullName}{a.actor.roleLabel ? <span className="block text-body-sm text-ink-2">{a.actor.roleLabel}</span> : null}</span> : "System") },
              { header: "Type", cell: (a) => <Badge tone={a.type === "SIGN_IN" ? "info" : a.type === "ROLES" ? "warning" : a.type === "STUDENTS" ? "success" : "neutral"}>{TYPES[a.type] ?? a.type}</Badge> },
              { header: "What", cell: (a) => a.summary },
              { header: "IP", cell: (a) => <span className="font-mono text-body-sm">{a.ip ?? "—"}</span> },
            ]}
          />
          <Pager page={res.data.page} size={res.data.size} total={res.data.total} href={href} noun="entries" />
        </>
      )}
    </>
  );
}
