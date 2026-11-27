// Types for the B0 API contract (odel-backend docs/api-b0.md).

export type TenantStatus = "SETTING_UP" | "LIVE" | "SUSPENDED";

export interface PublicTenant {
  id?: string;
  slug?: string;
  name: string;
  shortName?: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  googleDomain?: string;
  status?: TenantStatus;
}

export interface PublicContext {
  kind: "UNIVERSITY" | "PLATFORM";
  tenant: PublicTenant;
  devSignIn: boolean;
}

export type SessionStage = "MFA_SETUP" | "MFA_REQUIRED" | "CHOOSE_ROLE" | "SIGNED_IN";

export type RoleCode =
  | "SUPER_ADMIN"
  | "PLATFORM_SUPPORT"
  | "MANAGEMENT"
  | "ODEL_DIRECTOR"
  | "ODEL_ADMIN"
  | "CENTRE_COORDINATOR"
  | "LECTURER"
  | "FACILITATOR"
  | "EXAM_OFFICER"
  | "HOD"
  | "DEAN"
  | "REGISTRY"
  | "COUNSELLOR";

export type ScopeType =
  | "PLATFORM"
  | "UNIVERSITY"
  | "FACULTY"
  | "DEPARTMENT"
  | "CENTRE"
  | "COURSE"
  | "COURSE_GROUP";

export interface RoleAssignment {
  id: string;
  role: RoleCode;
  roleLabel: string;
  scopeType: ScopeType;
  scopeId: string | null;
  scopeLabel: string;
}

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  initials: string;
}

export interface Session {
  stage: SessionStage;
  user: SessionUser;
  roles: RoleAssignment[];
  activeRoleId: string | null;
  idleTimeoutSeconds: number;
  idleExpiresAt: string;
}

export interface MfaSetup {
  secret: string;
  secretGrouped: string;
  otpauthUri: string;
}

export interface MfaConfirmResult {
  backupCodes: string[];
  session: Session;
}

export interface ApiError {
  error: string;
  message?: string;
  fields?: Record<string, string>;
  attemptsLeft?: number;
}

export type ChecklistStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "LOCKED";

export interface ChecklistStep {
  number: number;
  key: string;
  title: string;
  summary: string;
  status: ChecklistStatus;
  actionLabel?: string;
  href?: string;
  lockedReason?: string;
}

export interface Checklist {
  steps: ChecklistStep[];
  done: number;
  total: number;
}

export interface Page<T> {
  items: T[];
  page?: number;
  size?: number;
  total?: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface TenantListItem {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  webAddress: string;
  status: TenantStatus;
  students: number;
  centres: number;
  createdAt: string;
  firstAdmin: { fullName: string; email: string; accepted: boolean } | null;
}

export interface AddressAvailability {
  webAddress: { available: boolean; message?: string };
  slug: { available: boolean; message?: string };
}

export interface LogoUpload {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface NewTenant {
  name: string;
  shortName: string;
  slug: string;
  webAddress: string;
  googleDomain: string;
  branding: { primaryColor: string; accentColor: string; logoKey: string | null };
  firstAdmin: { fullName: string; email: string };
}

export interface TenantDetail {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  webAddress: string;
  googleDomain: string;
  status: TenantStatus;
  createdAt: string;
  createdBy: { fullName: string } | null;
  branding: {
    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;
    readabilityPassed: boolean;
  };
  firstAdmin: {
    fullName: string;
    email: string;
    invitedAt: string | null;
    accepted: boolean;
    acceptedAt: string | null;
  } | null;
  nextSteps: { label: string; done: boolean }[];
}

export interface AuditItem {
  id: string;
  at: string;
  actor: { fullName: string; role: string } | null;
  action: string;
  summary: string;
  tenant: { id: string; name: string } | null;
  ip: string | null;
}
