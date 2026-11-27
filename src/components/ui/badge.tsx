import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONE: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: "bg-subtle text-ink-2", dot: "bg-ink-3" },
  success: { box: "bg-success-subtle text-success-ink", dot: "bg-success" },
  warning: { box: "bg-warning-subtle text-warning-ink", dot: "bg-warning" },
  danger: { box: "bg-danger-subtle text-danger", dot: "bg-danger" },
  info: { box: "bg-info-subtle text-info-ink", dot: "bg-info" },
  brand: { box: "bg-brand-subtle text-brand", dot: "bg-brand" },
};

/** Status chip. Never colour alone: the label names the status. */
export function Badge({ tone = "neutral", children, className }: { tone?: BadgeTone; children: string; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full py-[3px] pr-2.5 pl-2 text-label-sm whitespace-nowrap", t.box, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}
