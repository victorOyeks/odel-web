import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/api/server";
import { safeNext } from "@/lib/host";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SignInForm } from "@/components/student/auth";
import { OpensSoon } from "@/components/student/opens-soon";

export const metadata: Metadata = { title: "Sign in" };

/** M-08 student sign-in, E-04 wrong password, E-05 locked, E-06 suspended, S-02 signed out. */
export default async function StudentSignIn({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) return null;
  if (ctx.data.tenant.status === "SUSPENDED") return <OpensSoon tenant={ctx.data.tenant} />;
  if (session?.roles.some((r) => r.role === "STUDENT")) redirect("/");
  const notice = sp.reason === "idle" ? "idle" : sp.signedOut ? "signedOut" : null;
  return (
    <AuthLayout ctx={ctx.data} surface="university" student>
      <SignInForm initialLogin={typeof sp.login === "string" ? sp.login : ""} notice={notice} next={safeNext(typeof sp.next === "string" ? sp.next : null, "/")} />
    </AuthLayout>
  );
}
