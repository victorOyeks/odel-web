import type { ReactNode } from "react";
import { getSession } from "@/lib/api/server";
import { PageState } from "@/components/ui/page-state";

/**
 * Setup screens are for the ODeL admin (the director may look). Some reads they use are open to every staff role in the
 * API (other screens need them), so the page itself says "no access" to everyone else.
 */
export async function AdminOnly({ children }: { children: ReactNode }) {
  const s = await getSession();
  const role = s?.roles.find((r) => r.id === s.activeRoleId)?.role;
  if (role === "ODEL_ADMIN" || role === "ODEL_DIRECTOR") return <>{children}</>;
  return (
    <section className="rounded-lg border border-line bg-surface">
      <PageState kind="no-access" headingLevel={1}>
        This page is for the ODeL admin. Switch role from the menu, or ask the ODeL office to update your access.
      </PageState>
    </section>
  );
}
