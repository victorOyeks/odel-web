import type { Metadata } from "next";
import { apiGet, getContext, getSession } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { PeoplePage } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { PeopleView } from "@/components/people/people";

export const metadata: Metadata = { title: "People & roles" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** W-15 people & roles, W-15b invite, W-15c bulk invite, edit roles, W-21 suspend, reinstate, reset two-step. */
export default async function PeoplePageRoute({ searchParams }: PageProps<"/staff/people">) {
  const sp = await searchParams;
  const filters = { search: str(sp.search), role: str(sp.role), status: str(sp.status), page: str(sp.page) || "0" };
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
  q.set("size", "25");
  const [res, ctx, session] = await Promise.all([apiGet<PeoplePage>(`/people?${q}`).then(expectSession), getContext(), getSession()]);
  if (!res.ok) return <LoadFailed result={res} what="People & roles" />;
  const canEdit = session?.roles.find((r) => r.id === session.activeRoleId)?.role === "ODEL_ADMIN";
  return <PeopleView data={res.data} filters={filters} domain={ctx.ok ? ctx.data.tenant.googleDomain ?? "" : ""} myEmail={session?.user.email ?? ""} canEdit={canEdit} openId={str(sp.person) || null} />;
}
