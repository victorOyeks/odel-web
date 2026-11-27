import type { StaffRoleCode, StaffScopeType } from "@/lib/types-b1";

/** Roles an ODeL admin can give on People & roles (api-b1-academic §8), in the order the invite form shows them. */
export const STAFF_ROLES: { role: StaffRoleCode; label: string; scopes: StaffScopeType[] }[] = [
  { role: "LECTURER", label: "Lecturer", scopes: ["DEPARTMENT", "COURSE", "FACULTY", "UNIVERSITY"] },
  { role: "FACILITATOR", label: "Facilitator", scopes: ["DEPARTMENT", "COURSE", "FACULTY", "UNIVERSITY"] },
  { role: "EXAM_OFFICER", label: "Exam officer", scopes: ["FACULTY", "DEPARTMENT", "COURSE", "UNIVERSITY"] },
  { role: "CENTRE_COORDINATOR", label: "Centre coordinator", scopes: ["CENTRE"] },
  { role: "HOD", label: "Head of Department", scopes: ["DEPARTMENT"] },
  { role: "DEAN", label: "Dean", scopes: ["FACULTY"] },
  { role: "ODEL_DIRECTOR", label: "ODeL director", scopes: ["UNIVERSITY"] },
  { role: "ODEL_ADMIN", label: "ODeL admin", scopes: ["UNIVERSITY"] },
  { role: "MANAGEMENT", label: "Management (read-only)", scopes: ["UNIVERSITY"] },
  { role: "REGISTRY", label: "Registry", scopes: ["UNIVERSITY"] },
  { role: "COUNSELLOR", label: "Counsellor", scopes: ["UNIVERSITY"] },
];

export const roleLabel = (r: string) => STAFF_ROLES.find((x) => x.role === r)?.label.replace(" (read-only)", "") ?? r;

export const scopesFor = (r: StaffRoleCode): StaffScopeType[] => STAFF_ROLES.find((x) => x.role === r)?.scopes ?? ["UNIVERSITY"];

export const SCOPE_LABEL: Record<StaffScopeType, string> = {
  UNIVERSITY: "Whole university",
  FACULTY: "A faculty",
  DEPARTMENT: "A department",
  COURSE: "A course",
  CENTRE: "A study centre",
};

/** Nigeria's 36 states and the FCT, for the centre form. */
export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa",
  "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
];
