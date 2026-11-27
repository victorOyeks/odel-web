import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Centre } from "@/lib/types-b1";
import { AdminOnly } from "@/components/staff/admin-only";
import { LoadFailed } from "@/components/staff/load-state";
import { CentresView } from "@/components/academic/centres";

export const metadata: Metadata = { title: "Study centres" };

/** W-14 centres, W-14b centre profile, W-14c add centre, W-14d add room. */
export default async function CentresPage({ searchParams }: PageProps<"/staff/centres">) {
  const sp = await searchParams;
  const res = await apiGet<{ items: Centre[] }>("/academic/centres").then(expectSession);
  if (!res.ok) return <LoadFailed result={res} what="the study centres" />;
  return (
    <AdminOnly>
      <CentresView centres={res.data.items} search={typeof sp.q === "string" ? sp.q : ""} openId={typeof sp.centre === "string" ? sp.centre : null} />
    </AdminOnly>
  );
}
