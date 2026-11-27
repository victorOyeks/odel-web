import type { Metadata } from "next";
import { getContext } from "@/lib/api/server";
import { Logo } from "@/components/ui/logo";
import { Banner } from "@/components/ui/banner";
import { RetryButton } from "@/components/states/retry-button";

export const metadata: Metadata = { title: "You’re offline" };

/** Cached by the service worker and shown when a page cannot load. */
export default async function OfflinePage() {
  const ctx = await getContext();
  const tenant = ctx.ok ? ctx.data.tenant : null;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4">
      <div className="flex items-center gap-3">
        <Logo name={tenant?.name ?? "ODeL"} logoUrl={tenant?.logoUrl} />
        <p className="text-label-lg text-brand">{tenant?.name ?? "ODeL"}</p>
      </div>
      <h1 className="text-h2">You’re offline</h1>
      <Banner tone="offline" title="No connection">
        This page needs the internet. Your work is safe. We will carry on when you reconnect.
      </Banner>
      <RetryButton label="Try again" />
    </main>
  );
}
