import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import { formatShort } from "@/lib/format";
import type { Centre, Structure } from "@/lib/types-b1";
import type { RegReport } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterSelect, SearchBox } from "@/components/ui/fields";
import { LiveSearchForm } from "@/components/ui/live-search";
import { Pager } from "@/components/ui/nav-bits";
import { EmptyCard, LoadFailed } from "@/components/staff/load-state";
import { DownloadLink, StatCard, StatGrid, qs } from "@/components/staff-b2/bits";
import { RegTabs } from "@/components/staff-b2/reg-tabs";

export const metadata: Metadata = { title: "Registrations" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const TONE: Record<string, BadgeTone> = { REGISTERED: "success", LATE_REQUEST: "info", PAID_NOT_REGISTERED: "warning", FEE_CONFIRMING: "info", NOT_PAID: "danger", NOT_REGISTERED: "neutral" };
const STATUSES: [string, string][] = [
  ["REGISTERED", "Registered"],
  ["PAID_NOT_REGISTERED", "Paid, not registered"],
  ["LATE_REQUEST", "Late request"],
  ["FEE_CONFIRMING", "Fee confirming"],
  ["NOT_PAID", "Not paid"],
];

/** A-07 Registrations: who has registered, paid but not registered, late requests and changes; filters, live search, CSV. */
export default async function RegistrationReportPage({ searchParams }: PageProps<"/staff/registration">) {
  const sp = await searchParams;
  const f = { q: str(sp.q), centreId: str(sp.centreId), programmeId: str(sp.programmeId), level: str(sp.level), status: str(sp.status) };
  const page = str(sp.page) || "0";
  const [res, centres, structure] = await Promise.all([
    apiGet<RegReport>(`/registration/report?${qs(f, { page, size: "25" })}`).then(expectSession),
    apiGet<{ items: Centre[] }>("/academic/centres"),
    apiGet<Structure>("/academic/structure"),
  ]);
  if (!res.ok) {
    if (res.status === 404 && res.error.error === "no_session")
      return (
        <>
          <PageHeader title="Registrations" />
          <EmptyCard title="No session yet" icon="how_to_reg">
            {res.error.message ?? "Registration starts when the session and its registration window are set up in Academic setup."}
          </EmptyCard>
        </>
      );
    return <LoadFailed result={res} what="registrations" />;
  }
  const r = res.data;
  const c = r.cards;
  const programmes = structure.ok ? structure.data.faculties.flatMap((fa) => fa.departments.flatMap((d) => d.programmes)) : [];
  const levels = [...new Set(programmes.flatMap((p) => p.levels))].sort();
  const filtered = Object.values(f).some(Boolean);
  const href = (p: number) => `/staff/registration?${qs(f, { page: String(p) })}`;
  return (
    <>
      <PageHeader title="Registrations" subtitle={r.subtitle} actions={<DownloadLink href={`/api/v1/registration/report.csv?${qs(f)}`}>Export</DownloadLink>} />
      <RegTabs active="students" pending={c.lateRequests + c.courseChanges} />
      <StatGrid>
        <StatCard icon="how_to_reg" iconClass="text-success" label="Registered" value={c.registered.toLocaleString("en-NG")} sub={c.paid !== null ? `of ${c.paid.toLocaleString("en-NG")} who paid` : undefined} />
        <StatCard icon="pending" iconClass="text-warning" label="Paid, not registered" value={c.paidNotRegistered !== null ? c.paidNotRegistered.toLocaleString("en-NG") : "—"} sub={c.paidNotRegistered === null ? "Fee status unavailable" : "Can register now"} />
        <StatCard icon="schedule" iconClass="text-info" label="Late requests" value={String(c.lateRequests)} sub={`${c.lateRequestsAtCentres} at centres · ${c.lateRequestsAtOffice} at the ODeL office`} />
        <StatCard icon="swap_horiz" label="Course changes" value={String(c.courseChanges)} sub="Waiting for a decision" />
      </StatGrid>
      {!r.feeStatusKnown ? (
        <Banner tone="warning" title="Fee statuses are not available just now">
          The payment service did not answer, so paid and not-paid counts are hidden. Refresh in a minute.
        </Banner>
      ) : null}
      <LiveSearchForm action="/staff/registration" label="Find registrations" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <SearchBox name="q" defaultValue={f.q} placeholder="Name or matric no." label="Search registrations" />
        <FilterSelect label="Centre" name="centreId" defaultValue={f.centreId}>
          <option value="">All</option>
          {(centres.ok ? centres.data.items : []).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
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
        <FilterSelect label="Programme" name="programmeId" defaultValue={f.programmeId}>
          <option value="">All</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Level" name="level" defaultValue={f.level}>
          <option value="">All</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}L
            </option>
          ))}
        </FilterSelect>
      </LiveSearchForm>
      {!r.items.length ? (
        <EmptyCard title={filtered ? "No students match" : "No students yet"} icon="how_to_reg" action={filtered ? <ButtonLink href="/staff/registration" variant="secondary">Clear filters</ButtonLink> : undefined}>
          {filtered ? "Check the spelling or the matric number, or try fewer filters." : "Students appear here once they are imported."}
        </EmptyCard>
      ) : (
        <>
          <DataTable
            caption="Registrations"
            rows={r.items}
            rowKey={(x) => x.studentId}
            columns={[
              { header: "Student", cell: (x) => <Link href={`/staff/registration/students/${x.studentId}`} className="font-semibold text-brand hover:underline">{x.fullName}</Link> },
              { header: "Matric no.", cell: (x) => <span className="font-mono">{x.matricNumber}</span> },
              { header: "Programme · level", cell: (x) => `${x.programme?.name ?? "—"}${x.level ? ` · ${x.level}L` : ""}` },
              { header: "Centre", cell: (x) => x.centre?.name ?? "—" },
              { header: "Units", cell: (x) => (x.units !== null ? `${x.units} (${x.courseCount} courses)` : "—"), numeric: true },
              { header: "Submitted", cell: (x) => formatShort(x.submittedAt), className: "whitespace-nowrap" },
              {
                header: "Status",
                cell: (x) => (
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={TONE[x.status] ?? "neutral"}>{x.statusLabel}</Badge>
                    {x.changedAt ? <Badge>{`Changed ${formatShort(x.changedAt).split(",")[0]}`}</Badge> : null}
                  </span>
                ),
              },
            ]}
          />
          <Pager page={r.page} size={r.size} total={r.total} href={href} noun="students" />
        </>
      )}
    </>
  );
}
