import { cn } from "@/lib/cn";

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-muted text-label text-brand", className)}
    >
      {initials}
    </span>
  );
}
