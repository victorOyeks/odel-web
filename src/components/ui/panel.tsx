"use client";

import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/**
 * Form dialogs of the staff web. `sheet` slides in from the right (W-11b, W-14b, W-22b); `modal` sits in the
 * middle (W-12c, W-13b, W-15b). Below 768 px both become full-screen so forms are not squeezed. Built on the
 * native <dialog>: focus is trapped, Esc closes it, the page behind is inert.
 */
export function Panel({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "modal",
  width = "md",
  onSubmit,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "sheet";
  width?: "sm" | "md" | "lg";
  /** Wraps the body and footer in a form; Enter submits. */
  onSubmit?: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const w = { sm: "md:max-w-[440px]", md: "md:max-w-[560px]", lg: "md:max-w-[720px]" }[width];
  const inner = (
    <>
      <div className="flex items-start gap-3 px-5 pt-5 pb-3 md:px-7 md:pt-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className="text-h3 text-ink">
            {title}
          </h2>
          {description ? <div className="text-body text-ink-2">{description}</div> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mt-2 -mr-2 flex size-12 shrink-0 items-center justify-center rounded-md text-icon hover:bg-subtle">
          <Icon name="close" size={24} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-4 md:px-7">{children}</div>
      {footer ? (
        <div className="flex flex-col-reverse gap-3 border-t border-line px-5 py-4 md:flex-row md:items-center md:justify-end md:border-0 md:px-7 md:pb-6">{footer}</div>
      ) : null}
    </>
  );
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink md:shadow-pop",
        variant === "sheet"
          ? "md:ml-auto md:h-dvh md:w-[min(520px,100vw)] md:rounded-none"
          : cn("md:m-auto md:h-auto md:max-h-[calc(100dvh-48px)] md:w-[calc(100%-48px)] md:rounded-xl", w),
      )}
    >
      {open ? (
        onSubmit ? (
          <form
            noValidate
            className="flex h-full max-h-[inherit] flex-col"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {inner}
          </form>
        ) : (
          <div className="flex h-full max-h-[inherit] flex-col">{inner}</div>
        )
      ) : null}
    </dialog>
  );
}
