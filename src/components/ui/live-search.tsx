"use client";

import { createContext, useContext, useEffect, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

const Pending = createContext(false);
/** True while a live search is loading (the search box shows a small spinner). */
export const useSearchPending = () => useContext(Pending);

/**
 * A list's search and filters that apply as you go: typing searches after 300 ms (2 characters at least; an empty box shows
 * everything), a filter or date applies at once, Enter searches now. The query stays in the address (router.replace), and
 * each new navigation supersedes the one before, so results never arrive out of order. The page number resets.
 */
export function LiveSearchForm({ action, label, className, children }: { action: string; label: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<number | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function go() {
    if (timer.current) window.clearTimeout(timer.current);
    const el = form.current;
    if (!el) return;
    const params = new URLSearchParams();
    new FormData(el).forEach((v, k) => {
      const s = String(v).trim();
      if (!s) return;
      const isSearch = !!el.querySelector(`input[type="search"][name="${k}"]`);
      if (isSearch && s.length < 2) return;
      params.set(k, s);
    });
    const url = `${action}${params.size ? `?${params}` : ""}`;
    if (url === last.current) return;
    last.current = url;
    start(() => router.replace(url, { scroll: false }));
  }

  return (
    <Pending.Provider value={pending}>
      <form
        ref={form}
        role="search"
        aria-label={label}
        aria-busy={pending || undefined}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        onInput={(e) => {
          const t = e.target;
          if (t instanceof HTMLInputElement && (t.type === "search" || t.type === "text")) {
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(go, 300);
          }
        }}
        onChange={(e) => {
          const t = e.target;
          if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === "date")) go();
        }}
      >
        {children}
      </form>
    </Pending.Provider>
  );
}
