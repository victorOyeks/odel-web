"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Six boxes for a 6-digit code. Auto-advances, accepts paste and one-time-code
 * autofill. Each box is labelled "Digit n of 6"; the group has the visible label.
 */
export function OtpInput({
  value,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");

  const set = (next: string) => onChange(next.replace(/\D/g, "").slice(0, 6));
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus();

  const onInput = (i: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    if (typed.length > 1) {
      // Autofill or a fast typist: spread from this box on.
      const next = (value.slice(0, i) + typed).slice(0, 6);
      set(next);
      focus(next.length);
      return;
    }
    const arr = digits.slice();
    arr[i] = typed;
    set(arr.join(""));
    focus(i + 1);
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const arr = digits.slice();
      if (arr[i]) {
        arr[i] = "";
        set(arr.join(""));
      } else if (i > 0) {
        arr[i - 1] = "";
        set(arr.join(""));
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") focus(i - 1);
    else if (e.key === "ArrowRight") focus(i + 1);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    set(text);
    focus(Math.min(text.length, 5));
  };

  return (
    <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKey(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? 6 : 1}
          aria-label={`Digit ${i + 1} of 6`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          className={cn(
            "h-14 w-11 min-w-0 rounded-md bg-surface text-center font-mono text-[24px] leading-8 font-bold text-ink outline-none xs:w-12",
            invalid ? "border-2 border-danger-line" : "border border-line-strong focus:border-2 focus:border-focus",
          )}
        />
      ))}
    </div>
  );
}
