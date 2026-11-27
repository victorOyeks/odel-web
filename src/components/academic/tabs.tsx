"use client";

import { usePathname } from "next/navigation";
import { TabLinks } from "@/components/ui/nav-bits";

const TABS = [
  { key: "sessions", label: "Sessions & semesters", href: "/staff/academic-setup/sessions" },
  { key: "structure", label: "Academic structure", href: "/staff/academic-setup/structure" },
  { key: "staffing", label: "Staffing", href: "/staff/academic-setup/staffing" },
  { key: "grading", label: "Grading rules", href: "/staff/academic-setup/grading" },
];

export function AcademicTabs() {
  const path = usePathname();
  const active = TABS.find((t) => path.startsWith(t.href))?.key ?? "sessions";
  return <TabLinks tabs={TABS} active={active} label="Academic setup" />;
}
