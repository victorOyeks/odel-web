import { notFound } from "next/navigation";
import { requireSignedIn } from "@/lib/guard";
import { AppShell } from "@/components/shell/app-shell";
import { CONSOLE_FOOTER, CONSOLE_NAV } from "@/components/shell/roles";
import { PageState } from "@/components/ui/page-state";

/** Provider console shell (console host only). */
export default async function ConsoleLayout({ children }: LayoutProps<"/console">) {
  const { session, ctx, surface } = await requireSignedIn();
  if (surface !== "console") notFound();
  const active = session.roles.find((r) => r.id === session.activeRoleId);
  const allowed = active?.role === "SUPER_ADMIN" || active?.role === "PLATFORM_SUPPORT";
  return (
    <AppShell
      surface={surface}
      brand={{ name: ctx.tenant.name, logoUrl: null, portal: "Provider console" }}
      user={session.user}
      roles={session.roles}
      activeRoleId={session.activeRoleId}
      nav={CONSOLE_NAV}
      footer={CONSOLE_FOOTER}
      idleTimeoutSeconds={session.idleTimeoutSeconds}
    >
      {allowed ? (
        children
      ) : (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="no-access" headingLevel={1}>
            The provider console is for the platform team. Ask a platform admin to update your access.
          </PageState>
        </section>
      )}
    </AppShell>
  );
}
