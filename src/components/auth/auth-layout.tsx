import type { ReactNode } from "react";
import type { PublicContext } from "@/lib/types";
import type { Surface } from "@/lib/host";
import { Logo } from "@/components/ui/logo";
import { OfflineBanner } from "@/components/states/offline-banner";

const COPY = {
  university: {
    portal: "ODeL Staff Portal",
    headline: "Teach, assess and run the ODeL programme from one place.",
    body: "For lecturers, facilitators, exam officers, centre coordinators, heads of department, the ODeL directorate and university management.",
  },
  console: {
    portal: "Provider console",
    headline: "Run every university on the platform from one place.",
    body: "For the ODeL platform team: universities, branding, support and the audit trail.",
  },
};

/**
 * Staff and provider sign-in frame (W-01 … W-06, S-02): brand panel on the
 * left from 1024 px; on tablets and phones the crest and name sit above the form.
 */
export function AuthLayout({ ctx, surface, children }: { ctx: PublicContext; surface: Surface; children: ReactNode }) {
  const copy = COPY[surface];
  const t = ctx.tenant;
  const brand = (
    <div className="flex items-center gap-3.5">
      <Logo name={t.name} logoUrl={t.logoUrl} inverse className="h-[59px] w-16 lg:h-[59px] lg:w-16" />
      <div className="flex flex-col">
        <p className="text-label-lg">{t.name}</p>
        <p className="text-body-sm">{copy.portal}</p>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-dvh flex-1 flex-col lg:flex-row">
      <aside className="hidden w-[min(560px,40vw)] shrink-0 flex-col gap-5 bg-brand px-16 pt-16 pb-14 text-white lg:flex">
        {brand}
        <div className="flex-1" />
        <p className="text-display">{copy.headline}</p>
        <p className="text-body-lg opacity-85">{copy.body}</p>
      </aside>
      <header className="flex items-center bg-brand px-4 py-4 text-white sm:px-8 lg:hidden">
        <div className="flex items-center gap-3">
          <Logo name={t.name} logoUrl={t.logoUrl} inverse className="h-10 w-11" />
          <div className="flex flex-col">
            <p className="text-label">{t.name}</p>
            <p className="text-body-sm">{copy.portal}</p>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-start px-4 py-8 sm:px-8 sm:py-12 lg:justify-center lg:py-16">
        <div className="flex w-full max-w-[440px] flex-col gap-5">
          <OfflineBanner />
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-h2 text-ink">{children}</h1>;
}

export function AuthLead({ children }: { children: ReactNode }) {
  return <p className="text-body-lg text-ink-2">{children}</p>;
}
