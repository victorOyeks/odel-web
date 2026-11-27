import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Paged, StudentFilters, StudentRow } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { StudentsView } from "@/components/students/students";

export const metadata: Metadata = { title: "Students" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** W-22 students list, W-22b student record, W-22c add a student. */
export default async function StudentsPage({ searchParams }: PageProps<"/staff/students">) {
  const sp = await searchParams;
  const f = { q: str(sp.q), programme: str(sp.programme), level: str(sp.level), centre: str(sp.centre), status: str(sp.status), page: str(sp.page) || "0" };
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  q.set("size", "20");
  const [res, filters] = await Promise.all([apiGet<Paged<StudentRow>>(`/students?${q}`).then(expectSession), apiGet<StudentFilters>("/students/filters")]);
  if (!res.ok) return <LoadFailed result={res} what="the students" />;
  return <StudentsView data={res.data} f={f} filters={filters.ok ? filters.data : { programmes: [], centres: [], statuses: [] }} openId={str(sp.student) || null} />;
}
