import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api/server";
import { PageHeader } from "@/components/shell/page-header";
import { PageState } from "@/components/ui/page-state";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-names";

export const metadata: Metadata = { title: "Home" };

/** Staff home. The ODeL admin starts on the setup checklist; other roles get a placeholder until their screens are built. */
export default async function StaffHome() {
  const session = await getSession();
  const active = session?.roles.find((r) => r.id === session.activeRoleId);
  if (active?.role === "ODEL_ADMIN") redirect("/staff/setup");
  const role = active?.role;
  const links: { href: string; label: string; body: string; icon: IconName }[] = [
    ...(role === "CENTRE_COORDINATOR"
      ? [
          { href: "/staff/registration/requests", label: "Approvals", body: "Late registrations and course changes from students at your centre.", icon: "fact_check" as const },
          { href: "/staff/registration", label: "Registrations", body: "Who at your centre has registered, and who has paid but not registered.", icon: "how_to_reg" as const },
        ]
      : []),
    ...(role === "ODEL_DIRECTOR" || role === "MANAGEMENT" ? [{ href: "/staff/payments", label: "Payments", body: "Platform fee payments this semester.", icon: "payments" as const }] : []),
    ...(role === "ODEL_DIRECTOR" ? [{ href: "/staff/registration", label: "Registration", body: "Registrations, approvals and the rules.", icon: "how_to_reg" as const }] : []),
  ];
  const first = session?.user.fullName.split(" ").find((w) => !/^(Dr|Prof|Mr|Mrs|Ms)\.?$/.test(w)) ?? "";
  return (
    <>
      <PageHeader title={`Welcome, ${first}`} subtitle={active ? `You are working as ${active.roleLabel} · ${active.scopeLabel}.` : undefined} />
      {links.length ? (
        <ul className="grid gap-4 md:grid-cols-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="flex h-full items-start gap-4 rounded-lg border border-line bg-surface p-5 hover:border-brand">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
                  <Icon name={l.icon} size={24} />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-label-lg text-ink">{l.label}</span>
                  <span className="text-body text-ink-2">{l.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <section className="rounded-lg border border-line bg-surface">
        <PageState kind="later" title={`Your ${active?.roleLabel.toLowerCase() ?? "staff"} dashboard is on its way`}>
          {links.length ? "More screens for this role arrive in later phases." : "The screens for this role arrive in a later phase."} You can switch role from the menu at any time.
        </PageState>
      </section>
    </>
  );
}
