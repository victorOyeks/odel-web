import type { ReactNode } from "react";

/** Label / value rows in a card (SA-05, SA-01b). Stacks on phones. */
export function KeyValues({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 text-body-sm text-ink-2 sm:w-[200px] sm:pt-0.5">{r.label}</dt>
          <dd className="min-w-0 text-body break-words text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
