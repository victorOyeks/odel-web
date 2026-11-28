import "server-only";
import { redirect } from "next/navigation";
import { apiGet, getContext, getSession } from "@/lib/api/server";
import { getPath } from "@/lib/request";
import type { PublicTenant } from "@/lib/types";
import type { StudentProfile } from "@/lib/types-b1";

/** For student pages: the signed-in student (and the university), or a redirect to the student sign-in. */
export async function requireStudent(): Promise<{ tenant: PublicTenant; profile: StudentProfile; idleSeconds: number }> {
  const [ctx, session, path] = await Promise.all([getContext(), getSession(), getPath()]);
  if (!ctx.ok) throw new Error("context unavailable");
  const isStudent = session?.stage === "SIGNED_IN" && session.roles.some((r) => r.role === "STUDENT");
  if (!isStudent) redirect(session ? "/staff" : `/sign-in?next=${encodeURIComponent(path)}`);
  const profile = await apiGet<StudentProfile>("/student-profile");
  if (!profile.ok) redirect(profile.status === 401 ? `/sign-in?reason=idle&next=${encodeURIComponent(path)}` : "/sign-in");
  return { tenant: ctx.data.tenant, profile: profile.data, idleSeconds: session!.idleTimeoutSeconds };
}
