import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { RegMe } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { LateRequestForm } from "@/components/registration/student";

export const metadata: Metadata = { title: "Ask for late registration" };

/** R-06 Late registration request (only while the window is in its late period and nothing is pending). */
export default async function LateRequestPage() {
  const s = await requireStudent();
  const me = await apiGet<RegMe>("/registration/me");
  if (!me.ok || me.data.blocked?.code !== "late_request_needed") redirect("/registration");
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="registration" title="Late registration">
      <LateRequestForm semesterId={me.data.semester?.id ?? null} lateClosesOn={me.data.window?.lateClosesOn ?? null} />
    </StudentFrame>
  );
}
