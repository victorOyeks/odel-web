import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api/server";
import { PageHeader } from "@/components/shell/page-header";
import { PageState } from "@/components/ui/page-state";

export const metadata: Metadata = { title: "Home" };

/** Staff home. The ODeL admin starts on the setup checklist; other roles get a placeholder until their screens are built. */
export default async function StaffHome() {
  const session = await getSession();
  const active = session?.roles.find((r) => r.id === session.activeRoleId);
  if (active?.role === "ODEL_ADMIN") redirect("/staff/setup");
  const first = session?.user.fullName.split(" ").find((w) => !/^(Dr|Prof|Mr|Mrs|Ms)\.?$/.test(w)) ?? "";
  return (
    <>
      <PageHeader title={`Welcome, ${first}`} subtitle={active ? `You are working as ${active.roleLabel} · ${active.scopeLabel}.` : undefined} />
      <section className="rounded-lg border border-line bg-surface">
        <PageState kind="later" title={`Your ${active?.roleLabel.toLowerCase() ?? "staff"} dashboard is on its way`}>
          The screens for this role arrive in a later phase. You can switch role from the menu at any time.
        </PageState>
      </section>
    </>
  );
}
