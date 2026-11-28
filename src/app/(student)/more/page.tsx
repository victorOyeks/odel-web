import type { Metadata } from "next";
import Link from "next/link";
import { requireStudent } from "@/lib/student";
import { StudentFrame } from "@/components/student/home";
import { STUDENT_MENU } from "@/components/student/student-shell";
import { Icon } from "@/components/ui/icon";

export const metadata: Metadata = { title: "More" };

/** Phone "More" tab: every menu destination the bottom bar has no room for. */
export default async function MorePage() {
  const s = await requireStudent();
  return (
    <StudentFrame tenant={s.tenant} profile={s.profile} idleSeconds={s.idleSeconds} active="more" title="More">
      <h1 className="text-h2 text-ink">More</h1>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
        {STUDENT_MENU.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="flex min-h-14 items-center gap-3 px-4 hover:bg-subtle">
              <Icon name={i.icon} className="text-brand" />
              <span className="flex-1 text-label-lg text-ink">{i.label}</span>
              <Icon name="chevron_right" className="text-icon-2" />
            </Link>
          </li>
        ))}
      </ul>
    </StudentFrame>
  );
}
