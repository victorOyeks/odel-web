import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import type { IconName } from "@/components/ui/icon-names";
import { OfflineBanner } from "@/components/states/offline-banner";

type Item = { key: string; label: string; href: string; icon: IconName };

/** Student web side menu (D0 App Shell / Student Web). */
const SIDE: Item[] = [
  { key: "home", label: "Home", href: "/", icon: "home" },
  { key: "courses", label: "My courses", href: "/courses", icon: "menu_book" },
  { key: "classes", label: "Live classes", href: "/classes", icon: "videocam" },
  { key: "assessments", label: "Assessments", href: "/assessments", icon: "quiz" },
  { key: "exams", label: "Exams", href: "/exams", icon: "assignment" },
  { key: "results", label: "Results", href: "/results", icon: "grading" },
  { key: "payments", label: "Payments", href: "/payments", icon: "payments" },
  { key: "messages", label: "Messages", href: "/messages", icon: "forum" },
  { key: "downloads", label: "Downloads", href: "/downloads", icon: "download" },
];
const SIDE_FOOTER: Item[] = [
  { key: "help", label: "Help", href: "/help", icon: "help" },
  { key: "settings", label: "Settings", href: "/settings", icon: "settings" },
];
/** Phone bottom bar (D0 Bottom Tab Bar): Home · Courses · Classes · Exams · More. */
const TABS: Item[] = [
  { key: "home", label: "Home", href: "/", icon: "home" },
  { key: "courses", label: "Courses", href: "/courses", icon: "menu_book" },
  { key: "classes", label: "Classes", href: "/classes", icon: "videocam" },
  { key: "exams", label: "Exams", href: "/exams", icon: "assignment" },
  { key: "more", label: "More", href: "/more", icon: "more_horiz" },
];

export const STUDENT_SECTIONS = [...SIDE, ...SIDE_FOOTER, ...TABS].filter((i) => i.href !== "/");

export interface StudentShellProps {
  university: { name: string; logoUrl: string | null };
  student: { fullName: string; initials: string; subtitle: string; greeting: string; context: string };
  active: string;
  title: string;
  unread?: boolean;
  children: ReactNode;
}

/**
 * Student shell. Phones and tablets: top app bar + bottom tabs (the 01 Student
 * Mobile frames). From 1024 px: side menu + top bar (02 Student Web). No client
 * JavaScript of its own.
 */
export function StudentShell({ university, student, active, title, unread, children }: StudentShellProps) {
  const activeTab = TABS.some((t) => t.key === active) ? active : "more";
  return (
    <div className="flex min-h-dvh flex-1">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">
        Skip to content
      </a>
      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface px-4 pt-5 pb-4 lg:flex">
        <div className="flex items-center gap-2.5 pb-3">
          <Logo name={university.name} logoUrl={university.logoUrl} className="h-[39px] w-[42px]" />
          <div className="flex min-w-0 flex-col">
            <p className="text-label-lg text-brand">{university.name}</p>
            <p className="text-body-sm text-ink-2">ODeL Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-lg bg-subtle p-2.5">
          <Avatar initials={student.initials} />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-label text-ink">{student.fullName}</p>
            <p className="text-body-sm text-ink-2">{student.subtitle}</p>
          </div>
        </div>
        <div className="h-3" />
        <ul className="flex flex-col gap-1">
          {SIDE.map((i) => (
            <SideLink key={i.key} item={i} active={i.key === active} />
          ))}
        </ul>
        <div className="min-h-6 flex-1" />
        <ul className="flex flex-col gap-1">
          {SIDE_FOOTER.map((i) => (
            <SideLink key={i.key} item={i} active={i.key === active} />
          ))}
          <li>
            <Link href="/" className="flex h-10 items-center gap-3 rounded-md px-3 text-label text-ink-2 hover:bg-subtle">
              <Icon name="logout" className="text-icon-2" />
              Sign out
            </Link>
          </li>
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone/tablet top app bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-surface py-2.5 pr-2 pl-4 lg:hidden">
          <Logo name={university.name} logoUrl={university.logoUrl} className="h-[36px] w-[39px]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="truncate text-label-lg text-ink">{student.greeting}</p>
            <p className="truncate text-body-sm text-ink-2">{student.context}</p>
          </div>
          <Bell unread={unread} />
        </header>
        {/* Web top bar */}
        <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-line bg-surface px-6 lg:flex">
          <p className="min-w-0 flex-1 truncate text-h4 text-ink">{title}</p>
          <Bell unread={unread} />
          <Avatar initials={student.initials} />
        </header>
        <main id="main" className="flex flex-1 flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-6 lg:px-8 lg:py-7">
          <OfflineBanner />
          {children}
        </main>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-1 pt-1 pb-[max(8px,env(safe-area-inset-bottom))] lg:hidden">
          <ul className="mx-auto flex max-w-xl justify-between">
            {TABS.map((t) => {
              const on = t.key === activeTab;
              return (
                <li key={t.key} className="flex-1">
                  <Link
                    href={t.href}
                    aria-current={on ? "page" : undefined}
                    className="flex h-16 flex-col items-center justify-center gap-1"
                  >
                    <span className={cn("flex h-[30px] w-14 items-center justify-center rounded-full", on && "bg-brand-subtle")}>
                      <Icon name={t.icon} size={24} className={on ? "text-brand" : "text-icon-2"} />
                    </span>
                    <span className={cn("text-label-sm", on ? "text-brand" : "text-ink-2")}>{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function SideLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-label", active ? "bg-brand-subtle text-brand" : "text-ink-2 hover:bg-subtle")}
      >
        <Icon name={item.icon} className={active ? "text-brand" : "text-icon-2"} />
        {item.label}
      </Link>
    </li>
  );
}

function Bell({ unread }: { unread?: boolean }) {
  return (
    <Link href="/notifications" aria-label={unread ? "Notifications, unread" : "Notifications"} className="relative flex size-12 items-center justify-center rounded-md text-icon hover:bg-subtle lg:size-10">
      <Icon name="notifications" size={24} />
      {unread ? <span aria-hidden="true" className="absolute top-3 right-3 size-2.5 rounded-full border-2 border-surface bg-danger lg:top-1.5 lg:right-1.5" /> : null}
    </Link>
  );
}
