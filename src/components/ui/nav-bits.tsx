import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/** Underlined tab links (W-11 … W-17 Academic setup tabs). The current tab has aria-current="page". */
export function TabLinks({ tabs, active, label }: { tabs: { href: string; label: string; key: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-12 items-center border-b-2 px-4 text-label whitespace-nowrap md:min-w-[140px] md:justify-center",
                  on ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Filter chips that are links (W-16 Courses / Centres). */
export function ChipLinks({ chips, active, label }: { chips: { href: string; label: string; key: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = c.key === active;
          return (
            <li key={c.key}>
              <Link
                href={c.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-12 items-center gap-1.5 rounded-full border px-3.5 text-label md:min-h-9",
                  on ? "border-brand bg-brand-subtle text-brand" : "border-line-strong bg-surface text-ink hover:bg-subtle",
                )}
              >
                {on ? <Icon name="check" size={16} /> : null}
                {c.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Newer / page n of m / older, as links that keep the other query values. */
export function Pager({ page, size, total, href, noun }: { page: number; size: number; total: number; href: (p: number) => string; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? page * size + 1 : 0;
  const to = Math.min(total, (page + 1) * size);
  return (
    <nav aria-label="Pages" className="flex flex-col gap-2 text-body text-ink-2 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {from.toLocaleString("en-NG")}–{to.toLocaleString("en-NG")} of {total.toLocaleString("en-NG")} {noun}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {page > 0 ? (
            <Link href={href(page - 1)} className="inline-flex min-h-12 items-center gap-1 rounded-md px-3 font-semibold text-brand hover:bg-brand-subtle md:min-h-10">
              <Icon name="chevron_left" /> Previous
            </Link>
          ) : null}
          <span aria-current="page">
            Page {page + 1} of {pages}
          </span>
          {page + 1 < pages ? (
            <Link href={href(page + 1)} className="inline-flex min-h-12 items-center gap-1 rounded-md px-3 font-semibold text-brand hover:bg-brand-subtle md:min-h-10">
              Next <Icon name="chevron_right" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}

/** A plain text link with a 48 px target on phones. */
export function TextLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex min-h-12 items-center font-semibold text-brand underline-offset-4 hover:underline md:min-h-0", className)}>
      {children}
    </Link>
  );
}
