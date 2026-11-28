import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Reports" };

/** Reports. B1 has the university's audit log; the other reports arrive with their phases. */
export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" subtitle="What has happened in the portal. More reports arrive as the portal grows." />
      <ul className="grid gap-4 md:grid-cols-2">
        <li>
          <Link href="/staff/reports/audit" className="flex h-full items-start gap-4 rounded-lg border border-line bg-surface p-5 hover:border-brand">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
              <Icon name="history" size={24} />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-label-lg text-ink">Audit log</span>
              <span className="text-body text-ink-2">Sign-ins, role changes, setup changes, student imports, welcome emails and activations. Kept for 7 years.</span>
            </span>
          </Link>
        </li>
        {[
          { href: "/staff/payments", icon: "payments" as const, label: "Platform fee payments", body: "Who has paid this semester, confirming, refunds and reversals. Export as CSV." },
          { href: "/staff/registration", icon: "how_to_reg" as const, label: "Registrations", body: "Registered, paid but not registered, late requests and course changes. Export as CSV." },
        ].map((l) => (
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
        <li className="flex items-start gap-4 rounded-lg border border-dashed border-line-strong p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-subtle text-icon-2">
            <Icon name="bar_chart" size={24} />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-label-lg text-ink">Results</span>
            <span className="text-body text-ink-2">Results reports arrive with results in a later phase.</span>
          </span>
        </li>
      </ul>
    </>
  );
}
