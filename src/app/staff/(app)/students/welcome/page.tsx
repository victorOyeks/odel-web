import type { Metadata } from "next";
import { apiGet, getContext } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import type { WelcomeOverview } from "@/lib/types-b1";
import { LoadFailed } from "@/components/staff/load-state";
import { WelcomeView } from "@/components/students/welcome";

export const metadata: Metadata = { title: "Send welcome messages" };

/** W-20 send welcome messages, W-20d edit the wording, test send, background send with progress, W-20c delivery report. */
export default async function WelcomePage() {
  const [res, ctx] = await Promise.all([apiGet<WelcomeOverview>("/students/welcome").then(expectSession), getContext()]);
  if (!res.ok) return <LoadFailed result={res} what="the welcome email" />;
  const t = ctx.ok ? ctx.data.tenant : null;
  return <WelcomeView data={res.data} university={{ name: t?.name ?? "", logoUrl: t?.logoUrl ?? null }} />;
}
