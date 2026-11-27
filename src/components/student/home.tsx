import type { PublicTenant } from "@/lib/types";
import type { StudentProfile } from "@/lib/types-b1";
import { IdleTimer } from "@/components/shell/idle-timer";
import { Banner } from "@/components/ui/banner";
import { Icon } from "@/components/ui/icon";
import { PageState } from "@/components/ui/page-state";
import { StudentShell } from "./student-shell";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Shell({ tenant, profile, idleSeconds, active, title, children }: { tenant: PublicTenant; profile: StudentProfile; idleSeconds: number; active: string; title: string; children: React.ReactNode }) {
  return (
    <>
      <StudentShell
        university={{ name: tenant.name, logoUrl: tenant.logoUrl }}
        student={{
          fullName: profile.fullName,
          initials: profile.initials,
          subtitle: `${profile.matricNumber} · ${profile.levelLabel}`,
          greeting: `${greeting()}, ${profile.firstName}`,
          context: `${profile.programme.name} · ${profile.levelLabel}`,
        }}
        active={active}
        title={title}
      >
        {children}
      </StudentShell>
      <IdleTimer timeoutSeconds={idleSeconds} surface="university" signInHref="/sign-in" />
    </>
  );
}

/** B1 Home: who you are and an honest "courses appear after registration" (the full Home arrives with B2/B3). */
export function StudentHome({ tenant, profile, idleSeconds, justActivated }: { tenant: PublicTenant; profile: StudentProfile; idleSeconds: number; justActivated: boolean }) {
  return (
    <Shell tenant={tenant} profile={profile} idleSeconds={idleSeconds} active="home" title="Home">
      <h1 className="hidden text-h2 text-ink lg:block">
        {greeting()}, {profile.firstName}
      </h1>
      {justActivated ? <Banner tone="success" title="Your account is active">Next time, sign in with your matric number and password.</Banner> : null}
      <section aria-label="Your details" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-brand-muted text-label-lg text-brand">
            {profile.initials}
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="text-label-lg text-ink">{profile.fullName}</p>
            <p className="font-mono text-body text-ink-2">{profile.matricNumber}</p>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ["school", "Programme", profile.programme.name],
            ["grading", "Level", profile.levelLabel],
            ["location_on", "Study centre", profile.centre.name],
          ].map(([icon, k, v]) => (
            <div key={k} className="flex items-start gap-3 rounded-md bg-subtle p-3">
              <Icon name={icon as "school"} className="mt-0.5 text-brand" />
              <div className="flex flex-col">
                <dt className="text-body-sm text-ink-2">{k}</dt>
                <dd className="text-label text-ink">{v}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Your courses" className="rounded-lg border border-line bg-surface">
        <PageState kind="empty" title="Your courses appear after registration">
          When registration opens for the semester, you choose your courses here. We will email you at {profile.email ?? "your email"} when it opens.
        </PageState>
      </section>
      <p className="text-body text-ink-2">
        Something wrong in your details? Contact the ODeL office at {profile.centre.name}.
      </p>
    </Shell>
  );
}

export function StudentSectionLater({ tenant, profile, idleSeconds, section, active }: { tenant: PublicTenant; profile: StudentProfile; idleSeconds: number; section: string; active: string }) {
  return (
    <Shell tenant={tenant} profile={profile} idleSeconds={idleSeconds} active={active} title={section}>
      <section className="flex flex-1 items-start justify-center rounded-lg border border-line bg-surface sm:items-center">
        <PageState kind="later" headingLevel={1} title={`${section} opens soon`}>
          This part of the portal opens after registration. We will email you when it is ready.
        </PageState>
      </section>
    </Shell>
  );
}
