import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Label above, helper or error below; the error is announced via aria-describedby. */
export function TextField({
  label,
  hint,
  error,
  trailing,
  className,
  inputClassName,
  id,
  ...input
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  inputClassName?: string;
} & ComponentProps<"input">) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-label text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-12 w-full items-center gap-2 overflow-hidden rounded-md bg-surface px-3.5 focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-focus",
          error ? "border-2 border-danger-line" : "border border-line-strong",
        )}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn("h-full min-w-0 flex-1 bg-transparent text-body-lg text-ink outline-none placeholder:text-ink-3", inputClassName)}
          {...input}
        />
        {trailing}
      </div>
      {error ? (
        <p id={errorId} className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-body-sm text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
