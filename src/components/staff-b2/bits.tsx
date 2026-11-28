import type { ReactNode } from "react";
import { Children } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import type { BadgeTone } from "@/components/ui/badge";
import type { IconName } from "@/components/ui/icon-names";

/** Stat card (A-01, A-07). */
export function StatCard({ icon, iconClass, label, value, sub }: { icon: IconName; iconClass?: string; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-4">
      <p className="flex items-center gap-1.5 text-label-sm text-ink-2">
        <Icon name={icon} size={20} className={cn("text-icon-2", iconClass)} />
        {label}
      </p>
      <p className="text-h2 text-ink">{value}</p>
      {sub ? <p className="text-body-sm text-ink-2">{sub}</p> : null}
    </div>
  );
}

/** Summary cards that always fill the row: as many columns as cards on wide screens (no empty space on the right). */
const STAT_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
};

export function StatGrid({ children }: { children: ReactNode }) {
  const n = Children.toArray(children).filter(Boolean).length;
  return <div className={cn("grid gap-3", STAT_COLS[n] ?? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6")}>{children}</div>;
}

export const dateInput = "h-12 rounded-md border border-line-strong bg-surface px-3 text-body text-ink md:h-10";

/** A file download through the same-origin API proxy (CSV exports, PDFs). */
export function DownloadLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "secondary" | "ghost" }) {
  return (
    <a
      href={href}
      download
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2 rounded-md px-4 text-label md:h-10",
        variant === "secondary" ? "border-[1.5px] border-brand bg-surface text-brand hover:bg-brand-subtle" : "text-brand hover:bg-brand-subtle",
      )}
    >
      <Icon name="download" />
      {children}
    </a>
  );
}

export const qs = (f: Record<string, string>, extra: Record<string, string> = {}) => new URLSearchParams(Object.entries({ ...f, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

export const PAY_TONE: Record<string, BadgeTone> = { PAID: "success", CONFIRMING: "info", NOT_PAID: "danger", FAILED: "danger", REFUNDED: "neutral", REVERSED: "danger" };
