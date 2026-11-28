import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { RegReport, CarryOver } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { LoadFailed } from "@/components/staff/load-state";
import { RegTabs, activeRole } from "@/components/staff-b2/reg-tabs";
import { CarryOvers } from "@/components/staff-b2/carry-overs";

export const metadata: Metadata = { title: "Carry-overs" };

/** Carry-over courses (admin; director reads). Names come from the registrations report (the list carries ids only). */
export default async function CarryOversPage() {
  const [res, report, role] = await Promise.all([
    apiGet<{ items: (CarryOver & { studentName?: string; matricNumber?: string })[] }>("/registration/carry-overs").then(expectSession),
    apiGet<RegReport>("/registration/report?size=500"),
    activeRole(),
  ]);
  const names = Object.fromEntries((report.ok ? report.data.items : []).map((r) => [r.studentId, { fullName: r.fullName, matricNumber: r.matricNumber }]));
  return (
    <>
      <PageHeader title="Carry-overs" subtitle="Courses a student must take again. They are pinned on the student's registration until results clear them." />
      <RegTabs active="carry" />
      {res.ok || res.status === 400 ? <CarryOvers items={res.ok ? res.data.items : null} names={names} canEdit={role === "ODEL_ADMIN"} /> : <LoadFailed result={res} what="the carry-overs" />}
    </>
  );
}
