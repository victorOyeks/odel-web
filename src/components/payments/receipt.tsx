"use client";

import type { PublicTenant } from "@/lib/types";
import type { StudentProfile } from "@/lib/types-b1";
import type { Payment } from "@/lib/types-b2";
import { formatWhen } from "@/lib/format";
import { Button, ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

/** P-10 / P-10b receipt: on screen as on the PDF, with Download PDF and Print. */
export function Receipt({ tenant, profile, p }: { tenant: PublicTenant; profile: StudentProfile; p: Payment }) {
  const [session, semester] = p.label.split(" · ");
  const rows: [string, string][] = [
    ["Receipt no.", p.reference],
    ["Student", profile.fullName],
    ["Matric no.", profile.matricNumber],
    ["Programme", `${profile.programme.name} · ${profile.levelLabel}`],
    ["Session", session ?? p.label],
    ["Semester", semester ?? ""],
    ["Paid on", p.paidAt ? formatWhen(p.paidAt, true) : "—"],
    ["Method", p.methodLabel],
    ...(p.charge?.studentPays && !p.charge.estimate
      ? ([
          ["Platform fee", p.charge.feeLabel],
          ["Paystack charge", p.charge.chargeLabel],
          ["Total paid", p.charge.totalLabel],
        ] as [string, string][])
      : []),
    ["Status", p.status === "PAID" ? "Paid" : p.statusLabel],
  ];
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full max-w-[600px] flex-wrap gap-3 print:hidden">
        <ButtonLink href="/payments" variant="secondary" leadingIcon="arrow_back">
          Back
        </ButtonLink>
        {p.receiptUrl ? (
          <ButtonLink href={p.receiptUrl} external leadingIcon="download">
            Download PDF
          </ButtonLink>
        ) : null}
        <Button variant="secondary" leadingIcon="print" onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <article aria-label="Receipt" className="flex w-full max-w-[600px] flex-col gap-5 rounded-lg border border-line bg-surface p-5 sm:p-8 print:border-0">
        <header className="flex items-center gap-3 border-b-2 border-brand pb-4">
          <Logo name={tenant.name} logoUrl={tenant.logoUrl} className="h-11 w-12" />
          <div className="flex flex-col">
            <p className="text-label-lg text-ink">{tenant.name}</p>
            <p className="text-body-sm text-ink-2">Directorate of Distance &amp; E-learning</p>
          </div>
        </header>
        <h1 className="text-h3 text-ink">Platform fee receipt · {p.charge?.studentPays && !p.charge.estimate ? `${p.charge.totalLabel} paid` : `${p.amountLabel}.00`}</h1>
        <dl className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-6 gap-y-2 text-body">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-2">{k}</dt>
              <dd className={k === "Receipt no." ? "font-mono text-ink" : "text-ink"}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body-sm text-ink-2">The PDF also carries the Paystack reference. This receipt is valid without a signature.</p>
      </article>
    </div>
  );
}
