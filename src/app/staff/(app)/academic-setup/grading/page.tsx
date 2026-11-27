import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { GradingRules, Structure } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { GradingView } from "@/components/academic/grading";

export const metadata: Metadata = { title: "Grading rules" };

/** W-17 grading rules, W-17b/c edit bands and weights, W-17d a programme's own rules, W-17e standing and degree class. */
export default async function GradingPage({ searchParams }: PageProps<"/staff/academic-setup/grading">) {
  const sp = await searchParams;
  const programmeId = typeof sp.programmeId === "string" ? sp.programmeId : "";
  const [res, structure] = await Promise.all([
    apiGet<GradingRules>(`/academic/grading${programmeId ? `?programmeId=${encodeURIComponent(programmeId)}` : ""}`).then(expectSession),
    apiGet<Structure>("/academic/structure"),
  ]);
  if (!res.ok) return <LoadFailed result={res} what="the grading rules" />;
  const programmes = structure.ok ? structure.data.faculties.flatMap((f) => f.departments.flatMap((d) => d.programmes.map((p) => ({ id: p.id, name: p.name })))) : [];
  return <GradingView key={`${programmeId}-${res.data.version}-${res.data.scope}`} rules={res.data} programmes={programmes} programmeId={programmeId} />;
}
