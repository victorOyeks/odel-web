import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/api/server";
import { getSurface } from "@/lib/request";
import { homePath, safeNext, signInPath } from "@/lib/host";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SetupFlow } from "@/components/auth/setup-flow";
import { pathForStage } from "@/components/auth/routing";

export const metadata: Metadata = { title: "Protect your account" };

/** W-04 2FA setup, then W-05 backup codes. */
export default async function SetUpPage({ searchParams }: PageProps<"/staff/sign-in/set-up">) {
  const sp = await searchParams;
  const surface = await getSurface();
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homePath(surface));
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) return null;
  if (!session) redirect(`${signInPath(surface)}?error=expired`);
  if (session.stage !== "MFA_SETUP") redirect(pathForStage(session.stage, surface, next));
  const stem = ctx.data.kind === "PLATFORM" ? "ODeL Platform" : ctx.data.tenant.shortName ?? ctx.data.tenant.name;
  return (
    <AuthLayout ctx={ctx.data} surface={surface}>
      <SetupFlow surface={surface} next={next} fileStem={stem} />
    </AuthLayout>
  );
}
