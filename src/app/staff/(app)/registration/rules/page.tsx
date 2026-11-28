import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Structure } from "@/lib/types-b1";
import type { RegRules } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { LoadFailed } from "@/components/staff/load-state";
import { RegTabs, activeRole } from "@/components/staff-b2/reg-tabs";
import { RulesForm } from "@/components/staff-b2/rules";

export const metadata: Metadata = { title: "Registration rules" };

/** A-05 / A-05b / A-05c Registration rules. */
export default async function RulesPage({ searchParams }: PageProps<"/staff/registration/rules">) {
  const sp = await searchParams;
  const programmeId = typeof sp.programmeId === "string" ? sp.programmeId : "";
  const [res, structure, role] = await Promise.all([
    apiGet<RegRules>(`/registration/rules${programmeId ? `?programmeId=${encodeURIComponent(programmeId)}` : ""}`).then(expectSession),
    apiGet<Structure>("/academic/structure"),
    activeRole(),
  ]);
  const programmes = structure.ok ? structure.data.faculties.flatMap((f) => f.departments.flatMap((d) => d.programmes.map((p) => ({ id: p.id, name: p.name })))) : [];
  return (
    <>
      <PageHeader title="Registration rules" subtitle="Unit limits, the course-change deadline and the fee block. The window dates come from Academic setup." />
      <RegTabs active="rules" />
      {res.ok ? <RulesForm key={programmeId} rules={res.data} programmes={programmes} canEdit={role === "ODEL_ADMIN"} /> : <LoadFailed result={res} what="the rules" />}
    </>
  );
}
