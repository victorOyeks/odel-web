// Fixtures for mock mode (ODEL_MOCK_API=1). Shapes follow docs/api-b0.md.
import type { PublicContext, RoleAssignment, TenantDetail } from "@/lib/types";

export interface MockTenant extends TenantDetail {
  host: string; // first DNS label used in dev, e.g. "wesley" for wesley.localhost:3000
  students: number;
  centres: number;
}

const now = () => new Date().toISOString();

export function seedTenants(): MockTenant[] {
  if (process.env.ODEL_MOCK_SEED === "empty") return [];
  return [
    {
      id: "7b0f8a52-1c1e-4f0e-9f61-6b1f8c1a0001",
      host: "wesley",
      name: "Wesley University",
      shortName: "Wesley ODeL",
      slug: "wesley",
      webAddress: "odel.wesleyuni.edu.ng",
      googleDomain: "wesleyuni.edu.ng",
      status: "SETTING_UP",
      createdAt: "2026-11-20T15:02:00+01:00",
      createdBy: { fullName: "Chuka Obi" },
      branding: { primaryColor: "#1A2368", accentColor: "#C27808", logoUrl: "/mock/wesley-crest.png", readabilityPassed: true },
      firstAdmin: {
        fullName: "Ngozi Adebayo",
        email: "ngozi.adebayo@wesleyuni.edu.ng",
        invitedAt: "2026-11-20T15:02:00+01:00",
        accepted: false,
        acceptedAt: null,
      },
      nextSteps: [],
      students: 0,
      centres: 0,
    },
    {
      id: "7b0f8a52-1c1e-4f0e-9f61-6b1f8c1a0002",
      host: "crestfield",
      name: "Crestfield University",
      shortName: "Crestfield ODeL",
      slug: "crestfield",
      webAddress: "odl.crestfield.edu.ng",
      googleDomain: "crestfield.edu.ng",
      status: "SETTING_UP",
      createdAt: "2026-11-24T10:15:00+01:00",
      createdBy: { fullName: "Chuka Obi" },
      branding: { primaryColor: "#0F6E6E", accentColor: "#E07A2E", logoUrl: null, readabilityPassed: true },
      firstAdmin: {
        fullName: "Dr Yemi Adeoye",
        email: "yemi.adeoye@crestfield.edu.ng",
        invitedAt: "2026-11-24T10:15:00+01:00",
        accepted: true,
        acceptedAt: "2026-11-25T09:00:00+01:00",
      },
      nextSteps: [],
      students: 0,
      centres: 0,
    },
  ];
}

/** Hosts that always resolve in mock mode, even when the seed is empty. */
export const FIXED_HOSTS: Record<string, Partial<MockTenant>> = {
  paused: {
    id: "7b0f8a52-1c1e-4f0e-9f61-6b1f8c1a0009",
    name: "Kings Polytechnic",
    shortName: "Kings ODeL",
    slug: "paused",
    googleDomain: "kingspoly.edu.ng",
    status: "SUSPENDED",
    branding: { primaryColor: "#5B2A86", accentColor: "#D99A1E", logoUrl: null, readabilityPassed: true },
  },
};

export function platformContext(devSignIn: boolean): PublicContext {
  return {
    kind: "PLATFORM",
    tenant: { name: "ODeL Platform", primaryColor: "#1A2368", accentColor: "#C27808", logoUrl: null },
    devSignIn,
  };
}

export function nextStepsFor(t: MockTenant): { label: string; done: boolean }[] {
  const admin = t.firstAdmin?.fullName ?? "the first admin";
  return [
    { label: "Tenant created with its own data store", done: true },
    { label: "Branding applied to web, emails and slips", done: true },
    { label: `Invitation emailed to ${admin}`, done: true },
    { label: `Waiting: DNS record for ${t.webAddress}`, done: false },
    { label: `Waiting: ${admin} completes the setup checklist`, done: false },
  ];
}

export interface Persona {
  key: string;
  label: string;
  description: string;
  surface: "university" | "console" | "both";
  /** Error code the sign-in ends with instead of a session. */
  error?: string;
  firstStage?: "MFA_SETUP" | "MFA_REQUIRED";
  user?: (tenant: MockTenant | null) => { fullName: string; email: string; initials: string };
  roles?: (tenant: MockTenant | null) => RoleAssignment[];
}

const role = (
  id: string,
  r: RoleAssignment["role"],
  roleLabel: string,
  scopeType: RoleAssignment["scopeType"],
  scopeLabel: string,
): RoleAssignment => ({ id, role: r, roleLabel, scopeType, scopeId: null, scopeLabel });

function admin(t: MockTenant | null) {
  return t?.firstAdmin
    ? {
        fullName: t.firstAdmin.fullName,
        email: t.firstAdmin.email,
        initials: initials(t.firstAdmin.fullName),
      }
    : { fullName: "Ngozi Adebayo", email: "ngozi.adebayo@wesleyuni.edu.ng", initials: "NA" };
}

export function initials(name: string): string {
  const parts = name.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export const PERSONAS: Persona[] = [
  {
    key: "admin-new",
    label: "First ODeL admin, first sign-in",
    description: "One role (ODeL admin). Sets up two-step sign-in (W-04, W-05), then lands on the setup checklist.",
    surface: "university",
    firstStage: "MFA_SETUP",
    user: admin,
    roles: () => [role("r-admin", "ODEL_ADMIN", "ODeL admin", "UNIVERSITY", "Directorate of Distance & E-learning")],
  },
  {
    key: "admin-returning",
    label: "ODeL admin, returning",
    description: "Asked for the 6-digit code (W-03). Any code works except 000000.",
    surface: "university",
    firstStage: "MFA_REQUIRED",
    user: admin,
    roles: () => [role("r-admin", "ODEL_ADMIN", "ODeL admin", "UNIVERSITY", "Directorate of Distance & E-learning")],
  },
  {
    key: "multi-role",
    label: "Admin with three roles",
    description: "ODeL admin, centre coordinator and facilitator. Code (W-03), then choose a role (W-06). Try the role switcher (S-03).",
    surface: "university",
    firstStage: "MFA_REQUIRED",
    user: admin,
    roles: () => [
      role("r-admin", "ODEL_ADMIN", "ODeL admin", "UNIVERSITY", "Directorate of Distance & E-learning"),
      role("r-centre", "CENTRE_COORDINATOR", "Centre coordinator", "CENTRE", "Akure Study Centre"),
      role("r-fac", "FACILITATOR", "Facilitator", "COURSE_GROUP", "CSC 201 · Group B"),
    ],
  },
  {
    key: "lecturer",
    label: "Lecturer who is also HOD and exam officer",
    description: "Matches W-06 in the designs. Other roles see a placeholder dashboard in B0.",
    surface: "university",
    firstStage: "MFA_REQUIRED",
    user: () => ({ fullName: "Dr Funmi Bello", email: "funmi.bello@wesleyuni.edu.ng", initials: "FB" }),
    roles: () => [
      role("r-lect", "LECTURER", "Lecturer", "DEPARTMENT", "CSC 201, CSC 203, CSC 305 · Computer Science"),
      role("r-hod", "HOD", "Head of Department", "DEPARTMENT", "Computer Science · 14 courses"),
      role("r-exam", "EXAM_OFFICER", "Exam officer", "FACULTY", "Faculty of Science"),
    ],
  },
  {
    key: "provider",
    label: "Chuka Obi, platform admin",
    description: "Provider console (SUPER_ADMIN). Code (W-03), then universities (SA-01).",
    surface: "console",
    firstStage: "MFA_REQUIRED",
    user: () => ({ fullName: "Chuka Obi", email: "chuka.obi@odel.dev", initials: "CO" }),
    roles: () => [role("r-super", "SUPER_ADMIN", "Platform admin", "PLATFORM", "provider")],
  },
  {
    key: "provider-new",
    label: "Platform admin, first sign-in",
    description: "Provider console with two-step setup (W-04, W-05).",
    surface: "console",
    firstStage: "MFA_SETUP",
    user: () => ({ fullName: "Chuka Obi", email: "chuka.obi@odel.dev", initials: "CO" }),
    roles: () => [role("r-super", "SUPER_ADMIN", "Platform admin", "PLATFORM", "provider")],
  },
  { key: "not_linked", label: "Google account not linked", description: "Ends on W-02.", surface: "both", error: "not_linked" },
  { key: "no_role", label: "Staff record with no role", description: "Ends on the W-02 variant (no role yet).", surface: "university", error: "no_role" },
  { key: "wrong_domain", label: "Personal Gmail account", description: "Ends on W-02 (wrong domain).", surface: "both", error: "wrong_domain" },
  { key: "suspended", label: "Suspended staff account", description: "Sign-in refused.", surface: "both", error: "suspended" },
  { key: "cancelled", label: "Cancelled on Google", description: "Back to sign-in.", surface: "both", error: "cancelled" },
  { key: "expired", label: "Took too long", description: "Sign-in expired.", surface: "both", error: "expired" },
];

export const nowIso = now;
