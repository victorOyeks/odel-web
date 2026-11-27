import type { ReactNode } from "react";
import type { ApiResult } from "@/lib/api/result";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";

/** The no-access or error state for a page whose data call failed (after expectSession has handled 401). */
export function LoadFailed({ result, what }: { result: ApiResult<unknown>; what: string }) {
  if (result.ok) return null;
  return (
    <section className="rounded-lg border border-line bg-surface">
      {result.status === 403 ? (
        <PageState kind="no-access">This page is for the ODeL admin. Switch role from the menu, or ask the ODeL office to update your access.</PageState>
      ) : result.status === 404 ? (
        <PageState kind="error" title="We could not find that" action={<RetryButton variant="secondary" />}>
          It may have been removed. Go back to the list and try again.
        </PageState>
      ) : (
        <PageState kind="error" action={<RetryButton variant="secondary" />}>
          We could not load {what}. Check your connection and try again. Your work is safe.
        </PageState>
      )}
    </section>
  );
}

/** A bordered white card. */
export function Card({ children, className = "", title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6 ${className}`}>
      {title || actions ? (
        <div className="flex flex-wrap items-center gap-3">
          {title ? <h2 className="min-w-0 flex-1 text-h4 text-ink">{title}</h2> : null}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Empty state inside a card. */
export function EmptyCard({ title, children, action, icon }: { title: string; children: ReactNode; action?: ReactNode; icon?: Parameters<typeof PageState>[0]["icon"] }) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <PageState kind="empty" title={title} action={action} icon={icon}>
        {children}
      </PageState>
    </section>
  );
}
