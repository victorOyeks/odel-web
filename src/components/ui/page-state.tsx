import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

export type PageStateKind = "empty" | "error" | "no-access" | "signed-out" | "later";

const KIND: Record<PageStateKind, { wrap: string; icon: string; name: IconName; title: string; body: string }> = {
  empty: {
    wrap: "bg-brand-subtle",
    icon: "text-brand",
    name: "menu_book",
    title: "No content yet",
    body: "There is nothing here yet. We will tell you when there is.",
  },
  error: {
    wrap: "bg-danger-subtle",
    icon: "text-danger",
    name: "cloud_off",
    title: "Could not load this page",
    body: "Check your connection and try again. Your work is safe.",
  },
  "no-access": {
    wrap: "bg-subtle",
    icon: "text-icon-2",
    name: "lock",
    title: "You do not have access",
    body: "Switch role or ask the ODeL office to update your access.",
  },
  "signed-out": {
    wrap: "bg-brand-subtle",
    icon: "text-brand",
    name: "schedule",
    title: "You were signed out",
    body: "For your security we sign you out after 30 minutes of inactivity. Nothing you saved is lost.",
  },
  later: {
    wrap: "bg-brand-subtle",
    icon: "text-brand",
    name: "construction",
    title: "Coming in a later phase",
    body: "This part of the portal is not built yet.",
  },
};

/** Empty / error / no-access / signed-out states (D0 "Page State"). Drop into any screen's content area. */
export function PageState({
  kind,
  title,
  children,
  action,
  icon,
  className,
  headingLevel = 2,
}: {
  kind: PageStateKind;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  className?: string;
  headingLevel?: 1 | 2 | 3;
}) {
  const k = KIND[kind];
  const H = `h${headingLevel}` as "h1" | "h2" | "h3";
  return (
    <div
      role={kind === "error" ? "alert" : undefined}
      className={cn("mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-8 text-center", className)}
    >
      <div className={cn("flex size-[72px] items-center justify-center rounded-full", k.wrap)}>
        <Icon name={icon ?? k.name} size={32} className={k.icon} />
      </div>
      <H className="text-h4 text-ink">{title ?? k.title}</H>
      <div className="text-body text-ink-2">{children ?? k.body}</div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
