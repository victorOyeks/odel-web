"use client";


import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { useSearchPending } from "./live-search";

const box = (error?: ReactNode) =>
  cn(
    "w-full rounded-md bg-surface px-3.5 text-body-lg text-ink outline-none focus:outline-2 focus:outline-offset-0 focus:outline-focus disabled:bg-subtle disabled:text-ink-3",
    error ? "border-2 border-danger-line" : "border border-line-strong",
  );

function Help({ id, error, hint }: { id: string; error?: ReactNode; hint?: ReactNode }) {
  return (
    <>
      {error ? (
        <p id={`${id}-error`} className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-ink-2">
          {hint}
        </p>
      ) : null}
    </>
  );
}

const described = (id: string, error?: ReactNode, hint?: ReactNode) => [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

/** Native select with the text-field look. */
export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  id,
  ...rest
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: ReactNode } & Omit<ComponentProps<"select">, "className">) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <label htmlFor={sid} className="text-label text-ink">
        {label}
      </label>
      <div className="relative">
        <select id={sid} aria-invalid={error ? true : undefined} aria-describedby={described(sid, error, hint)} className={cn(box(error), "h-12 appearance-none pr-10")} {...rest}>
          {children}
        </select>
        <Icon name="expand_more" className="pointer-events-none absolute top-3.5 right-3 text-icon-2" />
      </div>
      <Help id={sid} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string } & Omit<ComponentProps<"textarea">, "className">) {
  const auto = useId();
  const tid = id ?? auto;
  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <label htmlFor={tid} className="text-label text-ink">
        {label}
      </label>
      <textarea id={tid} aria-invalid={error ? true : undefined} aria-describedby={described(tid, error, hint)} className={cn(box(error), "min-h-28 py-3")} {...rest} />
      <Help id={tid} error={error} hint={hint} />
    </div>
  );
}

export function Checkbox({ label, hint, className, ...rest }: { label: ReactNode; hint?: ReactNode; className?: string } & Omit<ComponentProps<"input">, "type" | "className">) {
  return (
    <label className={cn("flex min-h-12 cursor-pointer items-start gap-3 py-2.5 md:min-h-0", className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" {...rest} />
      <span className="flex flex-col gap-0.5">
        <span className="text-body-lg text-ink">{label}</span>
        {hint ? <span className="text-body-sm text-ink-2">{hint}</span> : null}
      </span>
    </label>
  );
}

/** A small search box for list pages (submits with the page's GET form). */
export function SearchBox({ name = "q", defaultValue, placeholder, label }: { name?: string; defaultValue?: string; placeholder: string; label: string }) {
  const pending = useSearchPending();
  return (
    <label className="relative flex w-full items-center sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <Icon name="search" className="pointer-events-none absolute left-3 text-icon-2" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        className="h-12 w-full rounded-full border border-transparent bg-subtle pr-10 pl-10 text-body-lg text-ink outline-none placeholder:text-ink-3 focus:border-focus md:h-10 md:text-body"
      />
      {pending ? (
        <span role="status" className="pointer-events-none absolute right-3 flex text-brand">
          <Icon name="progress_activity" size={20} className="spin" />
          <span className="sr-only">Searching</span>
        </span>
      ) : null}
    </label>
  );
}

/** Compact filter select for list toolbars. */
export function FilterSelect({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string; children: ReactNode }) {
  return (
    <label className="relative flex h-12 min-w-0 items-center gap-1 rounded-md border border-line-strong bg-surface pr-9 pl-3 text-body md:h-10">
      <span className="shrink-0 text-ink-2">{label}:</span>
      <select name={name} defaultValue={defaultValue} className="min-w-0 flex-1 appearance-none bg-transparent font-semibold text-ink outline-none">
        {children}
      </select>
      <Icon name="expand_more" className="pointer-events-none absolute right-2.5 text-icon-2" />
    </label>
  );
}
