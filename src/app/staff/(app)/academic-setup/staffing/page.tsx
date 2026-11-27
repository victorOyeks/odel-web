import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Staffing } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { StaffingView } from "@/components/academic/staffing";

export const metadata: Metadata = { title: "Staffing" };

/** W-16 courses / centres, W-16b who teaches, W-16c coordinator, W-16d copy from last session, W-16e before import. */
export default async function StaffingPage({ searchParams }: PageProps<"/staff/academic-setup/staffing">) {
  const sp = await searchParams;
  const tab = sp.tab === "centres" ? "centres" : "courses";
  const res = await apiGet<Staffing>("/academic/staffing").then(expectSession);
  if (!res.ok) return <LoadFailed result={res} what="staffing" />;
  return <StaffingView staffing={res.data} tab={tab} />;
}
