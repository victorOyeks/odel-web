import type { RoleCode } from "@/lib/types";
import type { IconName } from "@/components/ui/icon-names";

export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  /** Other path prefixes that belong to this item. */
  also?: string[];
}

const ROLE_ICON: Record<RoleCode, IconName> = {
  SUPER_ADMIN: "account_balance",
  PLATFORM_SUPPORT: "support_agent",
  MANAGEMENT: "bar_chart",
  ODEL_DIRECTOR: "dashboard",
  ODEL_ADMIN: "fact_check",
  CENTRE_COORDINATOR: "location_on",
  LECTURER: "menu_book",
  FACILITATOR: "groups",
  EXAM_OFFICER: "assignment",
  HOD: "account_balance",
  DEAN: "school",
  REGISTRY: "how_to_reg",
  COUNSELLOR: "support_agent",
};

export const roleIcon = (r: RoleCode): IconName => ROLE_ICON[r] ?? "person";

/** The ODeL admin's menu (D1 W-10). Only the setup checklist is built in B0. */
const ADMIN_NAV: NavItem[] = [
  { label: "Setup checklist", href: "/staff/setup", icon: "fact_check" },
  { label: "Students", href: "/staff/students", icon: "school" },
  { label: "Payments", href: "/staff/payments", icon: "payments" },
  { label: "Registration", href: "/staff/registration", icon: "how_to_reg" },
  { label: "Courses", href: "/staff/courses", icon: "menu_book" },
  { label: "Centres", href: "/staff/centres", icon: "location_on" },
  { label: "People & roles", href: "/staff/people", icon: "groups" },
  { label: "Academic setup", href: "/staff/academic-setup", icon: "account_tree" },
  { label: "Reports", href: "/staff/reports", icon: "bar_chart" },
];

/** Every other staff role gets a home page until its own screens are built. */
const HOME_NAV: NavItem[] = [{ label: "Home", href: "/staff", icon: "home" }];

export function staffNav(role: RoleCode | undefined): NavItem[] {
  return role === "ODEL_ADMIN" ? ADMIN_NAV : HOME_NAV;
}

export const STAFF_FOOTER: NavItem[] = [
  { label: "Help", href: "/staff/help", icon: "help" },
  { label: "Settings", href: "/staff/settings", icon: "settings" },
];

/** Provider console menu (D10). Universities and the audit trail are built in B0. */
export const CONSOLE_NAV: NavItem[] = [
  { label: "Universities", href: "/", icon: "account_balance", also: ["/universities"] },
  { label: "Platform health", href: "/health", icon: "monitor_heart" },
  { label: "Feature switches", href: "/features", icon: "toggle_on" },
  { label: "Support view", href: "/support", icon: "support_agent" },
  { label: "Audit trail", href: "/audit", icon: "history" },
  { label: "Releases", href: "/releases", icon: "rocket_launch" },
];

export const CONSOLE_FOOTER: NavItem[] = [
  { label: "Help", href: "/help", icon: "help" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

/** Label for a section that is not built yet, from its first path segment. */
export function sectionLabel(path: string, surface: "console" | "university"): string {
  const items = surface === "console" ? [...CONSOLE_NAV, ...CONSOLE_FOOTER] : [...ADMIN_NAV, ...STAFF_FOOTER];
  const segs = path.split("?")[0].split("/").filter(Boolean);
  const first = surface === "console" ? `/${segs[0] ?? ""}` : `/staff/${segs[1] ?? ""}`;
  return items.find((i) => i.href === first)?.label ?? "This page";
}
