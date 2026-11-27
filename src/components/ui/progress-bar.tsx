import { cn } from "@/lib/cn";

/** 100% turns green. */
export function ProgressBar({ label, value, className }: { label: string; value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <div className="flex justify-between text-label-sm">
        <span className="text-ink-2">{label}</span>
        <span className="text-ink">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-2 rounded-full", pct === 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
