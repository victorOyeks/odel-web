import { notFound } from "next/navigation";
import { getContext } from "@/lib/api/server";
import { OpensSoon } from "@/components/student/opens-soon";
import { STUDENT_SECTIONS } from "@/components/student/student-shell";

/** Student menu destinations: an honest holding page, not a broken link. */
export default async function StudentSection({ params }: PageProps<"/[section]">) {
  const { section } = await params;
  const item = STUDENT_SECTIONS.find((s) => s.href === `/${section}`) ?? (section === "notifications" ? { label: "Notifications" } : null);
  if (!item) notFound();
  const ctx = await getContext();
  if (!ctx.ok) return null;
  return <OpensSoon tenant={ctx.data.tenant} section={item.label} />;
}
