import { cn } from "@/lib/cn";
import type { IconName } from "./icon-names";

const SIZES = { 16: "text-[16px] size-4", 20: "text-[20px] size-5", 24: "text-[24px] size-6", 32: "text-[32px] size-8" } as const;

/** Material Symbols Rounded icon (decorative; give the parent an accessible name). */
export function Icon({ name, size = 20, className }: { name: IconName; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("material-symbol", SIZES[size], className)}>
      {name}
    </span>
  );
}
