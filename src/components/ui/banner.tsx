import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

type Tone = "info" | "success" | "warning" | "danger" | "offline";

const TONE: Record<Tone, { box: string; icon: string; name: IconName; action: string }> = {
  info: { box: "bg-info-subtle", icon: "text-info", name: "info", action: "text-info-ink" },
  success: { box: "bg-success-subtle", icon: "text-success", name: "check_circle", action: "text-success-ink" },
  warning: { box: "bg-warning-subtle", icon: "text-warning", name: "warning", action: "text-warning-ink" },
  danger: { box: "bg-danger-subtle", icon: "text-danger", name: "error", action: "text-danger" },
  offline: { box: "bg-inverse text-white", icon: "text-white", name: "wifi_off", action: "text-white" },
};

/** Inline, persistent message. Says what happened and what to do next. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  const t = TONE[tone];
  const loud = tone === "danger" || tone === "offline" || tone === "warning";
  return (
    <div
      role={loud ? "alert" : "status"}
      className={cn("flex w-full items-start gap-3 rounded-lg px-4 py-3.5", t.box, className)}
    >
      <Icon name={icon ?? t.name} size={24} className={t.icon} />
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1 text-body", tone === "offline" ? "text-white" : "")}>
        <p className={cn("font-semibold", tone === "offline" ? "" : "text-ink")}>{title}</p>
        {children ? <div className={tone === "offline" ? "" : "text-ink-2"}>{children}</div> : null}
        {action ? <div className={cn("font-semibold", t.action)}>{action}</div> : null}
      </div>
    </div>
  );
}
