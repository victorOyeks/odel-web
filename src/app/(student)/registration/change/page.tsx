import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { apiGet } from "@/lib/api/server";
import { requireStudent } from "@/lib/student";
import type { RegCourses, RegMe, Registration } from "@/lib/types-b2";
import { StudentFrame } from "@/components/student/home";
import { ChangePicker } from "@/components/registration/course-picker";

export const metadata: Metadata = { title: "Ask to change courses" };

/** R-09 / R-09b Course change request. */
export default async function ChangeRequestPage() {
  const s = await requireStudent();
  const me = await apiGet<RegMe>("/registration/me");
  if (!me.ok || !me.data.registration?.canRequestChange) redirect("/registration");
  const [courses, reg] = await Promise.all([
    apiGet<RegCourses>(`/registration/me/courses?semesterId=${me.data.registration.semester.id}`),
    apiGet<Registration>(`/registration/me/registrations/${me.data.registration.id}`),
  ]);
  if (!courses.ok || !reg.ok) redirect("/registration");
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="registration" title="Course change">
      <ChangePicker data={courses.data} registration={reg.data} />
    </StudentFrame>
  );
}
