import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { Page, TenantListItem } from "@/lib/types";
import { count } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";
import { TenantStatusBadge } from "@/components/console/status-badge";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "Universities" };

/** SA-01 Universities on the platform (and its empty state). */
export default async function UniversitiesPage() {
  const res = await expectSession(await apiGet<Page<TenantListItem>>("/platform/tenants"));
  const add = (
    <ButtonLink href="/universities/new" leadingIcon="add">
      Add a university
    </ButtonLink>
  );
  const header = (
    <PageHeader
      title="Universities on the platform"
      subtitle="Each university is a separate tenant: its own branding, rules, users and data."
      actions={res.ok && res.data.items.length ? add : undefined}
    />
  );
  if (!res.ok) {
    return (
      <>
        {header}
        <section className="rounded-lg border border-line bg-surface">
          {res.status === 403 ? (
            <PageState kind="no-access">Only platform admins can see the universities.</PageState>
          ) : (
            <PageState kind="error" action={<RetryButton variant="secondary" />}>
              We could not load the universities. Check your connection and try again.
            </PageState>
          )}
        </section>
      </>
    );
  }
  const items = res.data.items;
  if (!items.length) {
    return (
      <>
        {header}
        <section className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" icon="account_balance" title="No universities yet" action={add}>
            Add the first university to give it its own web address, branding and first admin. Nothing goes live until you
            create it on the last step.
          </PageState>
        </section>
      </>
    );
  }
  return (
    <>
      {header}
      {/* Desktop and tablet: table */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Universities</caption>
          <thead className="bg-subtle text-label-sm text-ink-2">
            <tr className="border-b border-line">
              <th scope="col" className="h-10 px-4 font-semibold">University</th>
              <th scope="col" className="h-10 w-[110px] px-4 font-semibold lg:w-[140px]">Students</th>
              <th scope="col" className="h-10 w-[100px] px-4 font-semibold lg:w-[140px]">Centres</th>
              <th scope="col" className="h-10 w-[200px] px-4 font-semibold">Web address</th>
              <th scope="col" className="hidden h-10 w-[170px] px-4 font-semibold xl:table-cell">First admin</th>
              <th scope="col" className="h-10 w-[130px] px-4 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="relative border-t border-line hover:bg-canvas">
                <td className="h-[52px] px-3">
                  <Link href={`/universities/${t.id}`} className="text-label text-ink after:absolute after:inset-0 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 text-body-sm">{count(t.students)}</td>
                <td className="px-3 text-body-sm">{count(t.centres)}</td>
                <td className="truncate px-3 text-body-sm">{t.webAddress}</td>
                <td className="hidden truncate px-3 text-body-sm xl:table-cell">
                  {t.firstAdmin ? `${t.firstAdmin.fullName}${t.firstAdmin.accepted ? "" : " · invited"}` : "—"}
                </td>
                <td className="px-3">
                  <TenantStatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: stacked cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((t) => (
          <li key={t.id}>
            <Link href={`/universities/${t.id}`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 hover:border-line-strong">
              <span className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-label-lg text-ink">{t.name}</span>
                <TenantStatusBadge status={t.status} />
              </span>
              <span className="text-body-sm text-ink-2">{t.webAddress}</span>
              <span className="flex items-center gap-4 text-body-sm text-ink-2">
                <span>Students {count(t.students)}</span>
                <span>Centres {count(t.centres)}</span>
                <Icon name="chevron_right" className="ml-auto text-icon-2" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
