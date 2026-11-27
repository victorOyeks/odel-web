import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { AcademicSession } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { SessionsView } from "@/components/academic/sessions";

export const metadata: Metadata = { title: "Sessions & semesters" };

/** W-11 Sessions & semesters, W-11b edit, W-11c new. */
export default async function SessionsPage() {
  const res = await apiGet<{ items: AcademicSession[] }>("/academic/sessions").then(expectSession);
  if (!res.ok) return <LoadFailed result={res} what="the sessions" />;
  return <SessionsView sessions={res.data.items} />;
}
