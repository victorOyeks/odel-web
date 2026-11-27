import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/api/server";
import { getSurface } from "@/lib/request";
import { homePath, safeNext, signInPath } from "@/lib/host";
import { AuthLayout } from "@/components/auth/auth-layout";
import { VerifyForm } from "@/components/auth/verify-form";
import { pathForStage } from "@/components/auth/routing";

export const metadata: Metadata = { title: "Enter your code" };

/** W-03 2FA code. */
export default async function TwoStepPage({ searchParams }: PageProps<"/staff/sign-in/two-step">) {
  const sp = await searchParams;
  const surface = await getSurface();
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homePath(surface));
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) return null;
  if (!session) redirect(`${signInPath(surface)}?error=expired`);
  if (session.stage !== "MFA_REQUIRED") redirect(pathForStage(session.stage, surface, next));
  const issuer = ctx.data.kind === "PLATFORM" ? "ODeL Platform" : ctx.data.tenant.shortName ?? ctx.data.tenant.name;
  return (
    <AuthLayout ctx={ctx.data} surface={surface}>
      <VerifyForm issuer={issuer} surface={surface} next={next} />
    </AuthLayout>
  );
}
