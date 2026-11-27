import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { AuditItem, Page, TenantListItem } from "@/lib/types";
import { formatWhen } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { PageState } from "@/components/ui/page-state";
import { Button } from "@/components/ui/button";
import { RetryButton } from "@/components/states/retry-button";
import { ExportCsv } from "@/components/console/export-csv";

export const metadata: Metadata = { title: "Audit trail" };

/** SA-09 Audit trail: every provider action and every staff sign-in, newest first. */
export default async function AuditPage({ searchParams }: PageProps<"/console/audit">) {
  const sp = await searchParams;
  const tenantId = typeof sp.tenantId === "string" ? sp.tenantId : "";
  const page = Math.max(0, Number(sp.page) || 0);
  const q = new URLSearchParams({ page: String(page) });
  if (tenantId) q.set("tenantId", tenantId);
  const [res, tenants] = await Promise.all([
    apiGet<Page<AuditItem>>(`/platform/audit?${q}`).then(expectSession),
    apiGet<Page<TenantListItem>>("/platform/tenants"),
  ]);
  const items = res.ok ? res.data.items : [];
  const size = res.ok ? res.data.size ?? 20 : 20;
  const total = res.ok ? res.data.total ?? items.length : 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const link = (p: number) => `/audit?${new URLSearchParams({ ...(tenantId ? { tenantId } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Every provider action on any university, kept for 7 years. Universities see the entries about them."
        actions={<ExportCsv items={items} />}
      />
      <form method="get" action="/audit" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-label text-ink">
          University
          <select
            name="tenantId"
            defaultValue={tenantId}
            className="h-12 min-w-64 rounded-md border border-line-strong bg-surface px-3 text-body-lg text-ink md:h-10 md:text-body"
          >
            <option value="">All universities</option>
            {tenants.ok ? tenants.data.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>) : null}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Show
        </Button>
      </form>

      {!res.ok ? (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="error" action={<RetryButton variant="secondary" />}>We could not load the audit trail. Check your connection and try again.</PageState>
        </section>
      ) : !items.length ? (
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" icon="history" title="Nothing recorded yet">
            {tenantId ? "No actions on this university yet." : "Sign-ins and changes appear here as they happen."}
          </PageState>
        </section>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
            <table className="w-full table-fixed border-collapse text-left">
              <caption className="sr-only">Audit trail, newest first</caption>
              <thead className="bg-subtle text-label-sm text-ink-2">
                <tr className="border-b border-line">
                  <th scope="col" className="h-10 w-[190px] px-4 font-semibold">When</th>
                  <th scope="col" className="h-10 w-[180px] px-4 font-semibold">Who</th>
                  <th scope="col" className="h-10 px-4 font-semibold">What</th>
                  <th scope="col" className="h-10 w-[200px] px-4 font-semibold">University</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="h-[52px] px-3 text-label text-ink">
                      <time dateTime={a.at}>{formatWhen(a.at)}</time>
                    </td>
                    <td className="px-3 text-body-sm text-ink">{a.actor?.fullName ?? "System"}</td>
                    <td className="px-3 py-2 text-body-sm text-ink">{a.summary}</td>
                    <td className="truncate px-3 text-body-sm text-ink">{a.tenant?.name ?? "Platform"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {items.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4">
                <p className="text-body text-ink">{a.summary}</p>
                <p className="text-body-sm text-ink-2">
                  <time dateTime={a.at}>{formatWhen(a.at)}</time> · {a.actor?.fullName ?? "System"} · {a.tenant?.name ?? "Platform"}
                </p>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-body text-ink-2">
              {page > 0 ? <Link className="inline-flex min-h-12 items-center font-semibold text-brand" href={link(page - 1)}>Newer</Link> : <span />}
              <span>
                Page {page + 1} of {pages}
              </span>
              {page + 1 < pages ? <Link className="inline-flex min-h-12 items-center font-semibold text-brand" href={link(page + 1)}>Older</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
