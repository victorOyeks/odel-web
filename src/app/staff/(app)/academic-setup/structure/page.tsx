import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { ProgrammeDetail, Structure } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { StructureView } from "@/components/academic/structure";

export const metadata: Metadata = { title: "Academic structure" };

/** W-12 tree + right panel (W-12b faculty, W-12e department, W-12 programme), add/edit W-12d … W-12j, W-12c import. */
export default async function StructurePage({ searchParams }: PageProps<"/staff/academic-setup/structure">) {
  const sp = await searchParams;
  const sel = typeof sp.sel === "string" ? sp.sel : "";
  const [kind, id] = sel.split(":");
  const [res, prog] = await Promise.all([
    apiGet<Structure>("/academic/structure").then(expectSession),
    kind === "programme" && id ? apiGet<ProgrammeDetail>(`/academic/programmes/${encodeURIComponent(id)}`) : Promise.resolve(null),
  ]);
  if (!res.ok) return <LoadFailed result={res} what="the academic structure" />;
  return <StructureView structure={res.data} selected={kind && id ? { kind: kind as "faculty" | "department" | "programme", id } : null} programme={prog && prog.ok ? prog.data : null} />;
}
