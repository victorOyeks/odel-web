import type { ReactNode } from "react";
import type { PublicContext } from "@/lib/types";
import type { Surface } from "@/lib/host";
import { Logo } from "@/components/ui/logo";
import { OfflineBanner } from "@/components/states/offline-banner";
import { Icon } from "@/components/ui/icon";
import type { IconName } from "@/components/ui/icon-names";

const COPY = {
  university: {
    portal: "ODeL Staff Portal",
    headline: "Teach, assess and run the ODeL programme from one place.",
    body: "For lecturers, facilitators, exam officers, centre coordinators, heads of department, the ODeL directorate and university management.",
    points: [
      { icon: "menu_book", text: "Courses, live classes and recordings for every study centre" },
      { icon: "fact_check", text: "Exams, marking and results with approvals at every step" },
      { icon: "groups", text: "Students, staff and centres in one shared view" },
    ],
  },
  console: {
    portal: "Provider console",
    headline: "Run every university on the platform from one place.",
    body: "For the ODeL platform team: universities, branding, support and the audit trail.",
    points: [
      { icon: "account_balance", text: "Set up a university with its own address, colours and admin" },
      { icon: "monitor_heart", text: "Watch platform health across every university" },
      { icon: "history", text: "Every provider action kept in the audit trail" },
    ],
  },
} satisfies Record<Surface, { portal: string; headline: string; body: string; points: { icon: IconName; text: string }[] }>;

/** The crest on a white tile: crests are drawn for light backgrounds, so they never sit straight on the brand colour. */
function Crest({ name, logoUrl, size }: { name: string; logoUrl: string | null | undefined; size: "sm" | "lg" }) {
  const box = size === "lg" ? "size-16 rounded-xl p-1.5" : "size-11 rounded-lg p-1";
  if (!logoUrl) return <Logo name={name} logoUrl={null} inverse className={size === "lg" ? "size-16 rounded-xl text-label-lg" : "size-11"} />;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center bg-white shadow-sm ${box}`}>
      <Logo name={name} logoUrl={logoUrl} className="size-full" />
    </span>
  );
}

/**
 * Staff and provider sign-in frame (W-01 … W-06, S-02): brand panel on the left from 1024 px, the form in a
 * card on the right; on tablets and phones a slim brand header sits above the card.
 */
export function AuthLayout({ ctx, surface, children }: { ctx: PublicContext; surface: Surface; children: ReactNode }) {
  const copy = COPY[surface];
  const t = ctx.tenant;
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas lg:flex-row">
      <aside className="relative hidden w-[min(600px,44vw)] shrink-0 overflow-hidden bg-brand text-white lg:flex">
        {/* Light from the top left, the university's accent glowing from the bottom right. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(110% 70% at 0% 0%, rgb(255 255 255 / 0.10), transparent 60%), radial-gradient(80% 55% at 100% 100%, color-mix(in srgb, var(--accent) 38%, transparent), transparent 65%)",
          }}
        />
        {t.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.logoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -right-48 top-[42%] w-[440px] max-w-none -translate-y-1/2 opacity-[0.06] grayscale"
          />
        ) : null}
        <div className="relative flex flex-1 flex-col px-14 pt-14 pb-10">
          <div className="flex items-center gap-4">
            <Crest name={t.name} logoUrl={t.logoUrl} size="lg" />
            <div className="flex flex-col">
              <p className="text-label-lg">{t.name}</p>
              <p className="text-body-sm opacity-80">{copy.portal}</p>
            </div>
          </div>
          <div className="flex-1" />
          <span aria-hidden="true" className="mb-6 h-1 w-14 rounded-full bg-accent" />
          <p className="text-display text-balance">{copy.headline}</p>
          <p className="mt-4 max-w-[46ch] text-body-lg opacity-85">{copy.body}</p>
          <ul className="mt-9 flex flex-col gap-4">
            {copy.points.map((p) => (
              <li key={p.text} className="flex items-center gap-3.5">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon name={p.icon} size={20} className="text-white" />
                </span>
                <span className="text-body opacity-90">{p.text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10 flex items-center justify-between gap-4 border-t border-white/15 pt-5 text-body-sm opacity-75">
            <span className="flex items-center gap-2">
              <Icon name="lock" size={16} />
              Protected by two-step sign-in
            </span>
            <span>
              © {year} {t.name}
            </span>
          </div>
        </div>
      </aside>

      <header className="relative flex items-center gap-3 overflow-hidden bg-brand px-4 py-4 text-white sm:px-8 lg:hidden">
        <Crest name={t.name} logoUrl={t.logoUrl} size="sm" />
        <div className="flex flex-col">
          <p className="text-label">{t.name}</p>
          <p className="text-body-sm opacity-80">{copy.portal}</p>
        </div>
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-accent" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-start px-4 py-8 sm:px-8 sm:py-14 lg:justify-center">
        <div className="flex w-full max-w-[460px] flex-col gap-4">
          <OfflineBanner />
          <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_16px_40px_-16px_rgb(16_24_40/0.18)] sm:p-9">
            {children}
          </div>
          <p className="text-center text-body-sm text-ink-3">
            {surface === "console" ? "Platform team only. Every sign-in is recorded." : "Need help signing in? Contact the ODeL office at your study centre."}
          </p>
        </div>
      </main>
    </div>
  );
}

/** Small label above a sign-in title, in the university's accent. */
export function AuthEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-label-sm uppercase tracking-[0.08em] text-accent-ink">{children}</p>;
}

export function AuthTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-h2 text-ink">{children}</h1>;
}

export function AuthLead({ children }: { children: ReactNode }) {
  return <p className="text-body-lg text-ink-2">{children}</p>;
}
