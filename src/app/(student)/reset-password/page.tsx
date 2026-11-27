import type { Metadata } from "next";
import { getContext } from "@/lib/api/server";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ResetFlow } from "@/components/student/auth";
import { OpensSoon } from "@/components/student/opens-soon";

export const metadata: Metadata = { title: "Reset your password" };

/** M-09 → M-03R emailed code → M-11 new password. `?login=…&sent=1` comes from the email the ODeL office sends (W-22b). */
export default async function ResetPassword({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ok) return null;
  if (ctx.data.tenant.status === "SUSPENDED") return <OpensSoon tenant={ctx.data.tenant} />;
  return (
    <AuthLayout ctx={ctx.data} surface="university" student>
      <ResetFlow initialLogin={typeof sp.login === "string" ? sp.login : ""} codeAlreadySent={sp.sent === "1"} />
    </AuthLayout>
  );
}
