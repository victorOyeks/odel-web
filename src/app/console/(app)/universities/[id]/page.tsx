import type { Metadata } from "next";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { TenantDetail } from "@/lib/types";
import { formatDay, formatWhen } from "@/lib/format";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { Icon } from "@/components/ui/icon";
import { PageState } from "@/components/ui/page-state";
import { RetryButton } from "@/components/states/retry-button";
import { KeyValues } from "@/components/console/kv";
import { statusLabel } from "@/components/console/status-badge";
import { ResendInvitation } from "@/components/console/resend-invitation";

export const metadata: Metadata = { title: "University" };

function Swatch({ hex }: { hex: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block size-4 rounded-sm border border-line" style={{ background: hex }} />
      {hex}
    </span>
  );
}

/** SA-01b University page (smallest form) and SA-05b University created (?created=1). */
export default async function UniversityPage({ params, searchParams }: PageProps<"/console/universities/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const created = sp.created === "1";
  const res = await expectSession(await apiGet<TenantDetail>(`/platform/tenants/${encodeURIComponent(id)}`));

  if (!res.ok) {
    return (
      <section className="rounded-lg border border-line bg-surface">
        {res.status === 404 ? (
          <PageState kind="empty" icon="account_balance" title="We could not find that university" headingLevel={1} action={<ButtonLink href="/" variant="secondary">Back to universities</ButtonLink>}>
            It may have been removed, or the link is wrong.
          </PageState>
        ) : (
          <PageState kind="error" headingLevel={1} action={<RetryButton variant="secondary" />} />
        )}
      </section>
    );
  }
  const t = res.data;
  const admin = t.firstAdmin;
  const by = t.createdBy ? ` by ${t.createdBy.fullName}` : "";

  const steps = (
    <ul aria-label="Progress" className="flex flex-wrap gap-2">
      {t.nextSteps.map((s) => (
        <li key={s.label} className={cn("flex items-center gap-2 rounded-[20px] border border-line px-3 py-2 text-label", s.done ? "bg-success-subtle text-success-ink" : "bg-surface text-ink")}>
          <Icon name={s.done ? "check_circle" : "hourglass_empty"} className={s.done ? "text-success" : "text-icon-2"} />
          <span>
            <span className="sr-only">{s.done ? "Done: " : "Waiting: "}</span>
            {s.label.replace(/^Waiting: /, "")}
          </span>
        </li>
      ))}
    </ul>
  );

  if (created) {
    return (
      <>
        <PageHeader title={`${t.name} is set up`} subtitle={`Created ${formatWhen(t.createdAt)}${by}.`} />
        <section aria-labelledby="next-steps" className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-5">
          <h2 id="next-steps" className="text-overline text-ink-2">
            Next steps
          </h2>
          <ul className="flex flex-col gap-2">
            {t.nextSteps.map((s) => (
              <li key={s.label} className="flex items-start gap-2.5 text-body text-ink">
                <Icon name={s.done ? "check_circle" : "hourglass_empty"} className={s.done ? "text-success" : "text-warning"} />
                <span>
                  <span className="sr-only">{s.done ? "Done: " : ""}</span>
                  {s.label}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={`/universities/${t.id}`}>Open the university page</ButtonLink>
          <ButtonLink href="/" variant="secondary">
            Back to universities
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t.name} subtitle={`${statusLabel(t.status)} · created ${formatWhen(t.createdAt)}${by} · ${t.webAddress}`} />
      {steps}
      <KeyValues
        rows={[
          { label: "University", value: `${t.name} · ${t.shortName}` },
          { label: "Web address", value: `${t.webAddress} · short address ${t.slug}` },
          { label: "Staff sign-in", value: `Google accounts ending @${t.googleDomain}` },
          {
            label: "Branding",
            value: (
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                <Swatch hex={t.branding.primaryColor} /> <Swatch hex={t.branding.accentColor} />
                <span>· readability {t.branding.readabilityPassed ? "passed" : "failed"}</span>
              </span>
            ),
          },
          {
            label: "Logo",
            value: t.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.branding.logoUrl} alt={`${t.name} logo`} className="h-12 w-auto max-w-[120px] object-contain" />
            ) : (
              "No logo yet"
            ),
          },
          {
            label: "First admin",
            value: admin
              ? `${admin.fullName} · ${admin.email} · ${admin.invitedAt ? `invited ${formatDay(admin.invitedAt)}` : "not invited yet"}, ${
                  admin.accepted ? `accepted${admin.acceptedAt ? ` ${formatDay(admin.acceptedAt)}` : ""}` : "not yet accepted"
                }`
              : "None yet",
          },
        ]}
      />
      {t.status === "SETTING_UP" ? (
        <Banner tone="info" title={`${t.name.split(" ")[0]} goes live when ${admin?.fullName ?? "the first admin"} accepts the invitation and finishes the setup checklist.`}>
          Until then students cannot sign in.
        </Banner>
      ) : null}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-start sm:justify-end">
        <ButtonLink href="/" variant="ghost">
          Back to universities
        </ButtonLink>
        {admin && !admin.accepted ? <ResendInvitation tenantId={t.id} adminName={admin.fullName} /> : null}
      </div>
    </>
  );
}
