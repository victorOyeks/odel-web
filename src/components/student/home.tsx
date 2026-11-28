import type { PublicTenant } from "@/lib/types";
import type { StudentProfile } from "@/lib/types-b1";
import type { Fee, RegMe } from "@/lib/types-b2";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { FeeCard } from "@/components/payments/fee-card";
import { IdleTimer } from "@/components/shell/idle-timer";
import { Banner } from "@/components/ui/banner";
import { Icon } from "@/components/ui/icon";
import { PageState } from "@/components/ui/page-state";
import { StudentShell } from "./student-shell";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function StudentFrame({ tenant, profile, idleSeconds, active, title, children }: { tenant: PublicTenant; profile: StudentProfile; idleSeconds: number; active: string; title: string; children: React.ReactNode }) {
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

/** Home (P-01 … E-08): greeting, the semester's fee card and what the fee unlocks, then the student's details. */
export function StudentHome({ tenant, profile, idleSeconds, justActivated, fee, reg }: { tenant: PublicTenant; profile: StudentProfile; idleSeconds: number; justActivated: boolean; fee: Fee | null; reg: RegMe | null }) {
  const registered = !!reg?.registration;
  const registerHref = fee?.status === "PAID" && !registered && reg?.canRegister ? "/registration" : null;
  return (
    <StudentFrame tenant={tenant} profile={profile} idleSeconds={idleSeconds} active="home" title="Home">
      <div className="hidden flex-col gap-1 lg:flex">
        <h1 className="text-h2 text-ink">
          {greeting()}, {profile.firstName}
        </h1>
        <p className="text-body text-ink-2">
          {profile.centre.name} · {profile.levelLabel}
        </p>
      </div>
      {justActivated ? <Banner tone="success" title="Your account is active">Next time, sign in with your matric number and password.</Banner> : null}
      {fee ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start">
          <FeeCard fee={fee} registerHref={registerHref} />
          <SemesterPanel fee={fee} reg={reg} />
        </div>
      ) : (
        <section aria-label="Your courses" className="rounded-lg border border-line bg-surface">
          <PageState kind="empty" title="Your courses appear after registration">
            When the semester opens you pay the platform fee and choose your courses here. We will email you at {profile.email ?? "your email"} when it opens.
          </PageState>
        </section>
      )}
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
      <p className="text-body text-ink-2">
        Something wrong in your details? Contact the ODeL office at {profile.centre.name}.
      </p>
    </StudentFrame>
  );
}

/** "Your semester": what the fee unlocks, with the registration state from the registration service. */
function SemesterPanel({ fee, reg }: { fee: Fee; reg: RegMe | null }) {
  const paid = fee.status === "PAID";
  const r = reg?.registration;
  const w = reg?.window;
  const regLine = r
    ? { icon: "check_circle" as const, done: true, title: "Course registration", body: `Registered ${r.courseCount} courses · ${r.totalUnits} units · slip ${r.slipNumber}`, href: "/registration", link: "View registration" }
    : !reg
      ? { icon: "lock" as const, done: false, title: "Course registration", body: "We could not load registration just now. Refresh the page to try again.", href: null, link: null }
      : reg.canRegister
        ? { icon: "how_to_reg" as const, done: false, title: "Course registration", body: `Open to you${w?.registerBy ? ` until ${formatDate(w.registerBy)}` : ""}.`, href: "/registration", link: "Register now" }
        : { icon: "lock" as const, done: false, title: "Course registration", body: reg.blocked?.code === "fee_not_paid" || (reg.blocked?.code === "not_open" && !paid) ? `${w?.state === "NOT_OPEN" && w.opensOn ? `Opens ${formatDate(w.opensOn, false)} · ` : ""}locked until you pay` : reg.blocked?.message ?? (w?.label ?? ""), href: reg.blocked?.code?.startsWith("late") ? "/registration" : null, link: reg.blocked?.code === "late_request_needed" ? "Ask for late registration" : reg.blocked?.code === "late_request_pending" ? "See my request" : null };
  const items = [
    regLine,
    { icon: r ? ("menu_book" as const) : ("lock" as const), done: !!r, title: "Courses and materials", body: r ? "Your courses open as lecturers publish them." : "Available after you register", href: null, link: null },
    { icon: paid ? ("assignment" as const) : ("lock" as const), done: paid, title: "Exams", body: paid ? "You can sit this semester's exams once you are registered." : "You need to pay to take exams", href: null, link: null },
  ];
  return (
    <section aria-labelledby="semester" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <h2 id="semester" className="text-h4 text-ink">
        Your semester · {fee.label}
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.title} className="flex items-start gap-3">
            <Icon name={i.icon} className={i.done ? "mt-0.5 text-success" : "mt-0.5 text-icon-2"} />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-label-lg text-ink">{i.title}</p>
              <p className="text-body-sm text-ink-2">{i.body}</p>
              {i.href && i.link ? (
                <Link href={i.href} className="inline-flex min-h-12 items-center text-label text-brand underline-offset-4 hover:underline md:min-h-0 md:pt-1">
                  {i.link}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudentSectionLater({ tenant, profile, idleSeconds, section, active }: { tenant: PublicTenant; profile: StudentProfile; idleSeconds: number; section: string; active: string }) {
  return (
    <StudentFrame tenant={tenant} profile={profile} idleSeconds={idleSeconds} active={active} title={section}>
      <section className="flex flex-1 items-start justify-center rounded-lg border border-line bg-surface sm:items-center">
        <PageState kind="later" headingLevel={1} title={`${section} opens soon`}>
          This part of the portal opens after registration. We will email you when it is ready.
        </PageState>
      </section>
    </StudentFrame>
  );
}
