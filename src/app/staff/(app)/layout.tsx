import { notFound } from "next/navigation";
import { requireSignedIn } from "@/lib/guard";
import { AppShell } from "@/components/shell/app-shell";
import { STAFF_FOOTER, staffNav } from "@/components/shell/roles";

/** Staff web shell for every signed-in staff page on a university host. */
export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  const { session, ctx, surface } = await requireSignedIn();
  if (surface !== "university") notFound();
  const active = session.roles.find((r) => r.id === session.activeRoleId);
  return (
    <AppShell
      surface={surface}
      brand={{ name: ctx.tenant.name, logoUrl: ctx.tenant.logoUrl, portal: "ODeL Portal" }}
      user={session.user}
      roles={session.roles}
      activeRoleId={session.activeRoleId}
      nav={staffNav(active?.role)}
      footer={STAFF_FOOTER}
      idleTimeoutSeconds={session.idleTimeoutSeconds}
    >
      {children}
    </AppShell>
  );
}
