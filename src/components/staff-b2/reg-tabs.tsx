import "server-only";
import { getSession } from "@/lib/api/server";
import { TabLinks } from "@/components/ui/nav-bits";

/** A-07 tabs: Students (report), Approvals (A-03), Rules (A-05), Carry-overs. The coordinator sees the first two. */
export async function RegTabs({ active, pending }: { active: "students" | "approvals" | "rules" | "carry"; pending?: number }) {
  const session = await getSession();
  const role = session?.roles.find((r) => r.id === session.activeRoleId)?.role;
  const tabs = [
    { key: "students", label: "Students", href: "/staff/registration" },
    { key: "approvals", label: pending ? `Approvals (${pending})` : "Approvals", href: "/staff/registration/requests" },
    ...(role === "ODEL_ADMIN" || role === "ODEL_DIRECTOR"
      ? [
          { key: "rules", label: "Rules", href: "/staff/registration/rules" },
          { key: "carry", label: "Carry-overs", href: "/staff/registration/carry-overs" },
        ]
      : []),
  ];
  return <TabLinks tabs={tabs} active={active} label="Registration" />;
}

export async function activeRole() {
  const session = await getSession();
  return session?.roles.find((r) => r.id === session.activeRoleId)?.role;
}
