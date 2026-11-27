import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import type { StudentImportReport } from "@/lib/types-b1";
import { ImportFlow } from "@/components/students/import";

export const metadata: Metadata = { title: "Import students" };

/** W-18 upload → W-19 row report (nothing saved) → confirm; W-18b import history. `?importId=` reopens a check. */
export default async function ImportPage({ searchParams }: PageProps<"/staff/students/import">) {
  const sp = await searchParams;
  const id = typeof sp.importId === "string" ? sp.importId : "";
  const res = id ? await apiGet<StudentImportReport>(`/imports/students/${encodeURIComponent(id)}`) : null;
  return <ImportFlow key={id} initial={res && res.ok && res.data.status === "CHECKED" ? res.data : null} />;
}
