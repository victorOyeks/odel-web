import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DEV_TOOLS } from "@/lib/config";
import { getContext } from "@/lib/api/server";
import { StudentShell } from "@/components/student/student-shell";
import { PageState } from "@/components/ui/page-state";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { FeeBlocked } from "@/components/states/fee-blocked";

export const metadata: Metadata = { title: "State gallery", robots: { index: false } };

function Card({ id, name, children }: { id: string; name: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-overline text-ink-3">
        {name}
      </h2>
      <div className="rounded-lg border border-line bg-surface p-4">{children}</div>
    </section>
  );
}

/**
 * Dev-only gallery of the student shell and the shared states every screen
 * uses (D0 Page State). 404 in a real production build.
 */
export default async function StatesGallery() {
  if (!DEV_TOOLS) notFound();
  const ctx = await getContext();
  if (!ctx.ok) return null;
  const t = ctx.data.tenant;
  return (
    <StudentShell
      university={{ name: t.name, logoUrl: t.logoUrl }}
      student={{
        fullName: "Adeola Okafor",
        initials: "AO",
        subtitle: "Student · WU/ODL/24/0153",
        greeting: "Good morning, Adeola",
        context: "Akure Study Centre · 200L",
      }}
      active="home"
      title="Shared states"
      unread
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-h2">Shared states</h1>
        <p className="text-body text-ink-2">Every student screen uses these. Resize the window to see the phone and desktop shells.</p>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card id="s-empty" name="Empty">
          <PageState kind="empty" action={<ButtonLink href="/courses" variant="secondary">Go to course home</ButtonLink>}>
            Your lecturer has not uploaded materials for this week. We will notify you when they do.
          </PageState>
        </Card>
        <Card id="s-loading" name="Loading (skeleton)">
          <SkeletonList rows={2} label="Loading your courses" />
        </Card>
        <Card id="s-error" name="Error">
          <PageState kind="error" action={<ButtonLink href="/dev/states" variant="secondary">Try again</ButtonLink>} />
        </Card>
        <Card id="s-noaccess" name="No access">
          <PageState kind="no-access" action={<ButtonLink href="/" variant="secondary">Go to home</ButtonLink>}>
            This page is for exam officers. Ask the ODeL office if you think you should see it.
          </PageState>
        </Card>
        <Card id="s-signedout" name="Signed out">
          <PageState kind="signed-out" action={<ButtonLink href="/" variant="secondary">Sign in again</ButtonLink>} />
        </Card>
        <Card id="s-fee" name="Fee blocked">
          <FeeBlocked amount={15000} session="2026/2027" />
        </Card>
        <Card id="s-offline" name="Offline banner">
          <Banner tone="offline" title="You’re offline" action="See downloads">
            Downloaded lectures still play. We will sync your progress when you reconnect.
          </Banner>
          <p className="mt-3 text-body-sm text-ink-2">
            Shown automatically at the top of every page when the connection drops. The full offline page is at{" "}
            <Link className="text-brand underline" href="/offline">/offline</Link>.
          </p>
        </Card>
        <Card id="s-slow" name="Poor connection">
          <Banner tone="warning" title="Slow connection" action="Switch to audio only">
            Videos will play in 240p and images load later to save time and data.
          </Banner>
        </Card>
        <Card id="s-maint" name="Maintenance">
          <Banner tone="info" title="Planned maintenance Sun 2–4 am">
            The portal will be unavailable. Downloaded lectures still play offline.
          </Banner>
        </Card>
      </div>
    </StudentShell>
  );
}
