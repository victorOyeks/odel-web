import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Centre, Paged } from "@/lib/types-b1";
import type { RegRequest } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/fields";
import { LiveSearchForm } from "@/components/ui/live-search";
import { ChipLinks } from "@/components/ui/nav-bits";
import { EmptyCard, LoadFailed } from "@/components/staff/load-state";
import { qs } from "@/components/staff-b2/bits";
import { RegTabs, activeRole } from "@/components/staff-b2/reg-tabs";
import { Approvals } from "@/components/staff-b2/approvals";

export const metadata: Metadata = { title: "Approvals" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** A-03 Approvals (coordinator: own centres; ODeL admin: every centre, and A-03e the ODeL office queue for centres with no coordinator). */
export default async function ApprovalsPage({ searchParams }: PageProps<"/staff/registration/requests">) {
  const sp = await searchParams;
  const role = await activeRole();
  const f = { kind: str(sp.kind), status: str(sp.status) || "PENDING", centreId: str(sp.centreId), noCoordinator: str(sp.noCoordinator) };
  const [res, centres] = await Promise.all([
    apiGet<Paged<RegRequest> & { counts: { late: number; change: number } }>(`/registration/requests?${qs(f, { size: "50" })}`).then(expectSession),
    apiGet<{ items: Centre[] }>("/academic/centres"),
  ]);
  if (!res.ok) return <LoadFailed result={res} what="the approvals" />;
  const d = res.data;
  const base = { status: f.status === "PENDING" ? "" : f.status, centreId: f.centreId, noCoordinator: f.noCoordinator };
  const chip = (kind: string) => `/staff/registration/requests?${qs(base, { kind })}`;
  const mine = role === "CENTRE_COORDINATOR";
  const centreList = centres.ok ? centres.data.items : [];
  const scope = mine ? "from students at your centres" : f.noCoordinator === "true" ? "from centres with no coordinator this session (the ODeL office decides these)" : "from every study centre";
  return (
    <>
      <PageHeader title="Approvals" subtitle={`Late registrations and course changes ${scope}. Reply within 2 working days.`} />
      <RegTabs active="approvals" pending={f.status === "PENDING" ? d.counts.late + d.counts.change : undefined} />
      <ChipLinks
        label="Kind of request"
        active={f.kind || "all"}
        chips={[
          { key: "all", label: `All (${d.counts.late + d.counts.change})`, href: chip("") },
          { key: "LATE", label: `Late registration (${d.counts.late})`, href: chip("LATE") },
          { key: "CHANGE", label: `Course changes (${d.counts.change})`, href: chip("CHANGE") },
        ]}
      />
      <LiveSearchForm action="/staff/registration/requests" label="Filter requests" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        {f.kind ? <input type="hidden" name="kind" value={f.kind} /> : null}
        <FilterSelect label="Show" name="status" defaultValue={f.status}>
          <option value="PENDING">Waiting for a decision</option>
          <option value="APPROVED">Approved</option>
          <option value="DECLINED">Declined</option>
          <option value="CANCELLED">Cancelled by the student</option>
          <option value="ALL">Everything</option>
        </FilterSelect>
        {!mine ? (
          <>
            <FilterSelect label="Centre" name="centreId" defaultValue={f.centreId}>
              <option value="">All</option>
              {centreList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.coordinator ? "" : " (no coordinator)"}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Queue" name="noCoordinator" defaultValue={f.noCoordinator}>
              <option value="">Every centre</option>
              <option value="true">ODeL office (no coordinator)</option>
            </FilterSelect>
          </>
        ) : null}
      </LiveSearchForm>
      <Approvals
        items={d.items}
        selectedId={str(sp.id) || null}
        canDecide={role === "ODEL_ADMIN" || role === "CENTRE_COORDINATOR"}
        notice={null}
        empty={
          <EmptyCard
            title={f.status === "PENDING" ? "Nothing waiting" : "No requests match"}
            icon="fact_check"
            action={f.status !== "PENDING" || f.kind || f.centreId || f.noCoordinator ? <ButtonLink href="/staff/registration/requests" variant="secondary">Show what is waiting</ButtonLink> : undefined}
          >
            {f.status === "PENDING" ? "New late registration and course change requests appear here, and you get an email for each." : "Try another filter."}
          </EmptyCard>
        }
      />
    </>
  );
}
