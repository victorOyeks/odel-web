import Link from "next/link";
import type { PublicTenant } from "@/lib/types";
import { Logo } from "@/components/ui/logo";
import { Icon } from "@/components/ui/icon";
import { OfflineBanner } from "@/components/states/offline-banner";

/** B0 student home: branded holding page until student sign-in and activation arrive in B1. */
export function OpensSoon({ tenant, section }: { tenant: PublicTenant; section?: string }) {
  const paused = tenant.status === "SUSPENDED";
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="bg-brand px-4 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Logo name={tenant.name} logoUrl={tenant.logoUrl} inverse className="h-10 w-11" />
          <div className="flex flex-col">
            <p className="text-label">{tenant.name}</p>
            <p className="text-body-sm">ODeL Portal</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8 sm:py-16">
        <OfflineBanner />
        <div className="flex size-[72px] items-center justify-center rounded-full bg-brand-subtle">
          <Icon name={paused ? "pause_circle" : "school"} size={32} className="text-brand" />
        </div>
        <h1 className="text-h2 text-ink sm:text-display">
          {paused ? `${tenant.name}’s portal is paused` : section ? `${section} opens soon` : "Student portal opens soon"}
        </h1>
        <p className="max-w-xl text-body-lg text-ink-2">
          {paused
            ? "The university has paused its ODeL portal. Contact the ODeL office for help."
            : `${tenant.name} is setting up its open and distance learning portal. When it opens, you will get an email with a link to activate your account and sign in with your matric number.`}
        </p>
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:flex-row sm:items-center">
          <Icon name="mail" size={24} className="text-brand" />
          <p className="flex-1 text-body text-ink-2">Watch your email inbox for a message from the ODeL office. Check your spam folder too.</p>
        </div>
        <p className="text-body text-ink-2">
          Staff?{" "}
          <Link href="/staff/sign-in" className="inline-flex min-h-12 items-center font-semibold text-brand underline-offset-4 hover:underline md:min-h-0">
            Go to staff sign-in
          </Link>
        </p>
      </main>
    </div>
  );
}
