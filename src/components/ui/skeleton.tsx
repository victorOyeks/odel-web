import { cn } from "@/lib/cn";

/** Loading placeholder shaped like the content. Used instead of spinners on slow networks. */
export function SkeletonLine({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton h-3 rounded-full bg-muted", className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex h-[120px] w-full flex-col gap-2.5 rounded-lg border border-line bg-surface p-4", className)}>
      <SkeletonLine className="h-3.5 w-[120px]" />
      <SkeletonLine className="h-2.5 w-[85%]" />
      <SkeletonLine className="h-2.5 w-[60%]" />
      <div className="skeleton h-10 w-full rounded-sm bg-subtle" />
    </div>
  );
}

export function SkeletonList({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex w-full flex-col gap-4">
      <span className="sr-only">{label}</span>
      <SkeletonLine className="w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
