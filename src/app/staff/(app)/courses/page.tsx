import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { CoursePage, StaffOption, Structure } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { CoursesView } from "@/components/academic/courses";

export const metadata: Metadata = { title: "Course catalogue" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** W-13 course catalogue, W-13b/d add a course and choose programmes, W-13e edit, W-13c CSV import. */
export default async function CoursesPage({ searchParams }: PageProps<"/staff/courses">) {
  const sp = await searchParams;
  const filters = { search: str(sp.search), programmeId: str(sp.programmeId), level: str(sp.level), semester: str(sp.semester), lecturer: str(sp.lecturer) || "any", page: str(sp.page) || "0" };
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  q.set("size", "25");
  const [res, structure, lecturers] = await Promise.all([
    apiGet<CoursePage>(`/academic/courses?${q}`).then(expectSession),
    apiGet<Structure>("/academic/structure"),
    apiGet<{ items: StaffOption[] }>("/academic/staff-options?role=LECTURER"),
  ]);
  if (!res.ok) return <LoadFailed result={res} what="the course catalogue" />;
  const programmes = structure.ok ? structure.data.faculties.flatMap((f) => f.departments.flatMap((d) => d.programmes)) : [];
  return <CoursesView data={res.data} filters={filters} programmes={programmes} lecturers={lecturers.ok ? lecturers.data.items : []} />;
}
