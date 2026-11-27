import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "accent";
type Size = "lg" | "md" | "sm";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:brightness-110 disabled:bg-muted disabled:text-ink-3",
  secondary: "bg-surface text-brand border-[1.5px] border-brand hover:bg-brand-subtle disabled:border-line disabled:text-ink-3",
  ghost: "text-brand hover:bg-brand-subtle disabled:text-ink-3",
  danger: "bg-danger text-white hover:brightness-110",
  accent: "bg-accent text-inverse hover:brightness-105",
};

// Large 48 is the phone default; on wider screens Medium is 40 and Small 32.
// Below md every button keeps a 48 px touch target.
const SIZE: Record<Size, string> = {
  lg: "h-12 px-5 text-label-lg gap-2",
  md: "h-12 md:h-10 px-4 text-label gap-2",
  sm: "h-12 md:h-8 px-3 text-label-sm gap-1",
};

interface Common {
  variant?: Variant;
  size?: Size;
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  loading?: boolean;
  block?: boolean;
  className?: string;
  children: ReactNode;
}

function inner({ leadingIcon, trailingIcon, loading, children }: Common) {
  return (
    <>
      {loading ? (
        <Icon name="progress_activity" className="spin" />
      ) : leadingIcon ? (
        <Icon name={leadingIcon} />
      ) : null}
      <span className="whitespace-nowrap">{children}</span>
      {trailingIcon && !loading ? <Icon name={trailingIcon} /> : null}
      {loading ? <span className="sr-only">Loading</span> : null}
    </>
  );
}

function classes({ variant = "primary", size = "md", block, className }: Common) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-sans transition-[background,filter] disabled:cursor-not-allowed cursor-pointer select-none",
    VARIANT[variant],
    SIZE[size],
    block && "w-full",
    className,
  );
}

export function Button(props: Common & Omit<ComponentProps<"button">, "children" | "className">) {
  const { variant, size, leadingIcon, trailingIcon, loading, block, className, children, disabled, ...rest } = props;
  const common = { variant, size, leadingIcon, trailingIcon, loading, block, className, children };
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={classes(common)}>
      {inner(common)}
    </button>
  );
}

export function ButtonLink(props: Common & { href: string; prefetch?: boolean; external?: boolean }) {
  const { href, prefetch, external, ...common } = props;
  if (external) {
    return (
      <a href={href} className={classes(common)}>
        {inner(common)}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={classes(common)}>
      {inner(common)}
    </Link>
  );
}
