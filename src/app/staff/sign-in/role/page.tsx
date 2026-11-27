import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/api/server";
import { getSurface } from "@/lib/request";
import { homePath, safeNext, signInPath } from "@/lib/host";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RoleChooser } from "@/components/auth/role-chooser";
import { pathForStage } from "@/components/auth/routing";

export const metadata: Metadata = { title: "Choose your role" };

/** W-06 Choose role. */
export default async function RolePage({ searchParams }: PageProps<"/staff/sign-in/role">) {
  const sp = await searchParams;
  const surface = await getSurface();
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homePath(surface));
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) return null;
  if (!session) redirect(`${signInPath(surface)}?error=expired`);
  if (session.stage !== "CHOOSE_ROLE" && session.stage !== "SIGNED_IN") redirect(pathForStage(session.stage, surface, next));
  return (
    <AuthLayout ctx={ctx.data} surface={surface}>
      <RoleChooser roles={session.roles} initial={session.activeRoleId} surface={surface} next={next} />
    </AuthLayout>
  );
}
