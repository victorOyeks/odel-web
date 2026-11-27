import type { Metadata } from "next";
import { getSession } from "@/lib/api/server";
import { getPath } from "@/lib/request";
import { sectionLabel } from "@/components/shell/roles";
import { PageState } from "@/components/ui/page-state";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Coming in a later phase" };

/** Menu items and checklist steps whose screens arrive after B0 land here instead of a broken page. */
export default async function ComingLater() {
  const [path, session] = await Promise.all([getPath(), getSession()]);
  const label = sectionLabel(path, "university");
  const isAdmin = session?.roles.find((r) => r.id === session.activeRoleId)?.role === "ODEL_ADMIN";
  return (
    <section className="flex flex-1 items-start justify-center rounded-lg border border-line bg-surface sm:items-center">
      <PageState
        kind="later"
        headingLevel={1}
        title={`${label} is coming in a later phase`}
        action={<ButtonLink href={isAdmin ? "/staff/setup" : "/staff"} variant="secondary">{isAdmin ? "Go to setup checklist" : "Go to home"}</ButtonLink>}
      >
        This part of the portal is not built yet. {isAdmin ? "Your setup checklist shows what you can do now." : "We will tell you when it is ready."}
      </PageState>
    </section>
  );
}
