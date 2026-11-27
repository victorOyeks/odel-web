"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import type { IconName } from "./icon-names";

/**
 * Modal built on the native <dialog>: focus is trapped, Esc closes it and the
 * page behind is inert. `role="alertdialog"` when it needs an answer.
 */
export function Dialog({
  open,
  onClose,
  icon,
  iconClassName = "text-warning",
  title,
  children,
  actions,
  alert = false,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  icon?: IconName;
  iconClassName?: string;
  title: string;
  children?: ReactNode;
  actions: ReactNode;
  alert?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={alert ? "alertdialog" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[420px] rounded-xl bg-surface p-0 text-ink shadow-pop"
    >
      <div className="flex flex-col items-center gap-3 px-7 pt-7 pb-6 text-center">
        {icon ? <Icon name={icon} size={32} className={cn(iconClassName)} /> : null}
        <h2 id={titleId} className="text-h3">
          {title}
        </h2>
        {children ? <div className="text-body text-ink-2">{children}</div> : null}
        <div className="mt-1 flex w-full flex-wrap-reverse items-center justify-center gap-3">{actions}</div>
      </div>
    </dialog>
  );
}
