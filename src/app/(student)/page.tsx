import type { Metadata } from "next";
import { apiGet, getContext, getSession } from "@/lib/api/server";
import type { StudentProfile } from "@/lib/types-b1";
import type { Fee, RegMe } from "@/lib/types-b2";
import { AuthLayout } from "@/components/auth/auth-layout";
import { OpensSoon } from "@/components/student/opens-soon";
import { Welcome } from "@/components/student/auth";
import { StudentHome } from "@/components/student/home";

export const metadata: Metadata = { title: "Home" };

/** Student web home: M-01 welcome when signed out; the B1 Home for a signed-in student. */
export default async function StudentHomePage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) return null;
  if (ctx.data.tenant.status === "SUSPENDED") return <OpensSoon tenant={ctx.data.tenant} />;
  const isStudent = session?.stage === "SIGNED_IN" && session.roles.some((r) => r.role === "STUDENT");
  if (isStudent) {
    const [profile, fee, reg] = await Promise.all([apiGet<StudentProfile>("/student-profile"), apiGet<Fee>("/payments/fees/current"), apiGet<RegMe>("/registration/me")]);
    if (profile.ok)
      return <StudentHome tenant={ctx.data.tenant} profile={profile.data} idleSeconds={session!.idleTimeoutSeconds} justActivated={sp.welcome === "1"} fee={fee.ok ? fee.data : null} reg={reg.ok ? reg.data : null} />;
  }
  return (
    <AuthLayout ctx={ctx.data} surface="university" student>
      <Welcome />
    </AuthLayout>
  );
}
