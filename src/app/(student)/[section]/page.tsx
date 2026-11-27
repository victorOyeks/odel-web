import { notFound } from "next/navigation";
import { apiGet, getContext, getSession } from "@/lib/api/server";
import type { StudentProfile } from "@/lib/types-b1";
import { OpensSoon } from "@/components/student/opens-soon";
import { STUDENT_SECTIONS } from "@/components/student/student-shell";
import { StudentSectionLater } from "@/components/student/home";

/** Student menu destinations: an honest holding page, not a broken link (inside the shell once signed in). */
export default async function StudentSection({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = STUDENT_SECTIONS.find((s) => s.href === `/${section}`) ?? (section === "notifications" ? { label: "Notifications", key: "notifications" } : null);
  if (!item) notFound();
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) return null;
  if (session?.stage === "SIGNED_IN" && session.roles.some((r) => r.role === "STUDENT")) {
    const profile = await apiGet<StudentProfile>("/student-profile");
    if (profile.ok) return <StudentSectionLater tenant={ctx.data.tenant} profile={profile.data} idleSeconds={session.idleTimeoutSeconds} section={item.label} active={"key" in item ? item.key : section} />;
  }
  return <OpensSoon tenant={ctx.data.tenant} section={item.label} />;
}
