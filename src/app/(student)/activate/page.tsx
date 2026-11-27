import type { Metadata } from "next";
import { getContext } from "@/lib/api/server";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ActivateFlow } from "@/components/student/auth";
import { OpensSoon } from "@/components/student/opens-soon";

export const metadata: Metadata = { title: "Activate your account" };

/** M-02 matric number → M-03 emailed code → M-04 password → M-05 privacy notice → M-06 details → Home; E-01 … E-03, E-06. */
export default async function Activate({ searchParams }: PageProps<"/activate">) {
  const sp = await searchParams;
  const ctx = await getContext();
  if (!ctx.ok) return null;
  if (ctx.data.tenant.status === "SUSPENDED") return <OpensSoon tenant={ctx.data.tenant} />;
  return (
    <AuthLayout ctx={ctx.data} surface="university" student>
      <ActivateFlow initialMatric={typeof sp.matric === "string" ? sp.matric : ""} />
    </AuthLayout>
  );
}
