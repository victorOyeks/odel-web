// Types for the B1 contracts: odel-backend docs/api-b1-academic.md and docs/api-b1-students.md.

// ---------------------------------------------------------------- shared

export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface PersonRef {
  id: string;
  fullName: string;
  status?: "ACTIVE" | "INVITED" | "SUSPENDED";
}

// ---------------------------------------------------------------- 1. sessions

export interface RegistrationWindow {
  opensOn: string;
  closesOn: string;
  lateClosesOn: string | null;
}

export interface Semester {
  id: string;
  number: 1 | 2;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  registration: RegistrationWindow | null;
}

export type SessionStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export interface AcademicSession {
  id: string;
  name: string;
  status: SessionStatus;
  startsOn: string | null;
  endsOn: string | null;
  current: boolean;
  semesters: Semester[];
  semestersLabel: string;
  registrationLabel: string;
  complete: boolean;
}

export interface SessionInput {
  name: string;
  semesters: {
    number: 1 | 2;
    startsOn: string;
    endsOn: string;
    registration?: { opensOn: string; closesOn: string; lateClosesOn: string | null } | null;
  }[];
  makeActive: boolean;
}

// ---------------------------------------------------------------- 2. structure

export interface ProgrammeNode {
  id: string;
  name: string;
  code: string;
  degree: string;
  durationYears: number;
  levels: number[];
  entryLevels: number[];
  minUnitsToGraduate: number | null;
  status: "ACTIVE" | string;
  courseCount: number;
}

export interface DepartmentNode {
  id: string;
  name: string;
  code: string;
  programmeCount: number;
  programmes: ProgrammeNode[];
}

export interface FacultyNode {
  id: string;
  name: string;
  code: string;
  departmentCount: number;
  departments: DepartmentNode[];
}

export interface Structure {
  faculties: FacultyNode[];
  totals: { faculties: number; departments: number; programmes: number };
}

export interface ProgrammeDetail {
  id: string;
  name: string;
  code: string;
  degree: string;
  durationYears: number;
  durationLabel: string;
  levels: number[];
  entryLevels: number[];
  entryLevelsLabel: string;
  minUnitsToGraduate: number | null;
  status: string;
  gradingRules: string;
  department: { id: string; name: string };
  faculty: { id: string; name: string };
  byLevel: { level: number; semester: number; courses: number; units: number; lecturersAssigned: number }[];
}

export interface ImportProblem {
  row: number;
  message: string;
}

/** Structure and catalogue CSV check (W-12c, W-13c). */
export interface AcademicImport {
  id: string;
  kind: "STRUCTURE" | "CATALOGUE";
  fileName: string;
  status: "CHECKED" | "IMPORTED" | "CANCELLED";
  totalRows: number;
  readyRows: number;
  problemRows: number;
  problems: ImportProblem[];
  summary: string;
  createdAt: string;
  confirmedAt: string | null;
  imported?: Record<string, number>;
}

// ---------------------------------------------------------------- 3. catalogue

export type OfferKind = "COMPULSORY" | "ELECTIVE";

export interface Course {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: 1 | 2;
  semesterLabel: string;
  offeredTo: { programmeId: string; programmeName: string; kind: OfferKind }[];
  lecturer: PersonRef | null;
  needsLecturer: boolean;
}

export interface CoursePage extends Paged<Course> {
  catalogueTotal: number;
  programmeTotal: number;
}

export interface CourseInput {
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number;
  offeredTo: { programmeId: string; kind: OfferKind }[];
  lecturerId: string | null;
}

// ---------------------------------------------------------------- 4. centres

export interface Centre {
  id: string;
  name: string;
  code: string;
  address: string | null;
  state: string;
  phone: string | null;
  coordinator: { id: string; fullName: string } | null;
  rooms: number;
  seats: number;
  computers: number;
  students: number;
}

export interface Room {
  id: string;
  name: string;
  seats: number;
  computers: number;
}

export interface CentreDetail extends Centre {
  roomsList: Room[];
}

export interface CentreInput {
  name: string;
  code: string;
  address: string;
  state: string;
  phone: string;
}

// ---------------------------------------------------------------- 5. staffing

export interface StaffingCourse {
  course: { id: string; code: string; title: string; level: number; semester: number };
  lecturer: PersonRef | null;
  facilitators: { centreId: string; centreName: string; user: PersonRef }[];
  examOfficer: PersonRef | null;
  needsLecturer: boolean;
}

export interface StaffingCentre {
  centre: { id: string; name: string; code: string };
  coordinator: PersonRef | null;
  students: number;
  needsCoordinator: boolean;
}

export interface Staffing {
  session: { id: string; name: string } | null;
  courses: StaffingCourse[];
  centres: StaffingCentre[];
  needLecturer: number;
  needCoordinator: number;
  studentsImported: boolean;
  summary: string;
}

export interface StaffOption {
  id: string;
  fullName: string;
  email: string;
  status: "ACTIVE" | "INVITED";
  scopeLabel: string | null;
}

export interface CopyResult {
  copied: number;
  skipped: { what: string; reason: string }[];
  from: string;
  to: string;
}

// ---------------------------------------------------------------- 6. grading

export interface GradeBand {
  grade: string;
  from: number;
  to: number;
  point: number;
  remark: string;
}

export interface Standing {
  probationBelow: number;
  withdrawAfterProbationSemesters: number;
  carryOverBeforeGraduating: boolean;
  classes: { name: string; from: number }[];
}

export interface GradingRules {
  scope: "DEFAULT" | "PROGRAMME";
  programme: { id: string; name: string } | null;
  version: number;
  saved: boolean;
  effectiveSession: { id: string; name: string } | null;
  caWeight: number;
  examWeight: number;
  passMark: number;
  scale: number;
  roundTotals: boolean;
  bands: GradeBand[];
  standing: Standing;
  summary: string;
  programmesWithOwnRules: number;
  inheritedFromDefault: boolean;
  example: string;
}

export type GradingInput = Pick<GradingRules, "caWeight" | "examWeight" | "passMark" | "scale" | "roundTotals" | "bands" | "standing"> & {
  effectiveSessionId?: string | null;
};

// ---------------------------------------------------------------- 7. checklist

export type ChecklistKey = "SESSION" | "STRUCTURE" | "CATALOGUE" | "CENTRES" | "PEOPLE" | "STAFFING" | "GRADING" | "IMPORT" | "WELCOME";

export interface ChecklistB1 {
  sessionName: string | null;
  steps: {
    number: number;
    key: ChecklistKey | string;
    title: string;
    summary: string;
    status: "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "LOCKED";
    actionLabel?: string | null;
    href?: string;
    lockedReason?: string | null;
  }[];
  done: number;
  total: number;
  percent: number;
}

// ---------------------------------------------------------------- 8. people

export type StaffRoleCode =
  | "LECTURER"
  | "FACILITATOR"
  | "EXAM_OFFICER"
  | "CENTRE_COORDINATOR"
  | "HOD"
  | "DEAN"
  | "ODEL_DIRECTOR"
  | "ODEL_ADMIN"
  | "MANAGEMENT"
  | "REGISTRY"
  | "COUNSELLOR";

export type StaffScopeType = "UNIVERSITY" | "FACULTY" | "DEPARTMENT" | "COURSE" | "CENTRE";

export interface PersonRole {
  id: string;
  role: StaffRoleCode;
  roleLabel: string;
  scopeType: StaffScopeType;
  scopeId: string | null;
  scopeLabel: string;
}

export type PersonStatus = "INVITED" | "ACTIVE" | "SUSPENDED";

export interface Person {
  id: string;
  fullName: string;
  email: string;
  initials: string;
  status: PersonStatus;
  roles: PersonRole[];
  scopeLabel: string;
  twoStepSetUp: boolean;
  invitedAt: string | null;
  acceptedAt: string | null;
  lastSignInAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
}

export interface PeoplePage extends Paged<Person> {
  counts: { total: number; active: number; invited: number; suspended: number };
}

export interface PersonDetail {
  person: Person;
  staffing: { kind: string; what: string; session: string; current: boolean }[];
}

export interface RoleInput {
  role: StaffRoleCode;
  scopeType: StaffScopeType;
  scopeId: string | null;
}

export interface PeopleImport {
  id: string;
  totalRows: number;
  readyRows: number;
  problemRows: number;
  problems: ImportProblem[];
  status: "CHECKED" | "IMPORTED";
  invited?: number;
}

export interface SuspendCheck {
  warnings: string[];
  staffing: { kind: string; what: string; session: string; current: boolean }[];
}

// ---------------------------------------------------------------- 9. audit

export type AuditType = "SIGN_IN" | "ROLES" | "SETUP" | "STUDENTS" | "OTHER";

export interface UniversityAuditItem {
  id: string;
  at: string;
  type: AuditType;
  action: string;
  summary: string;
  actor: { id: string; fullName: string; role: string | null; roleLabel: string | null } | null;
  ip: string | null;
}

// ================================================================ students half

export type StudentStatus = "IMPORTED" | "INVITED" | "ACTIVE" | "SUSPENDED";

export interface ProgrammeRef {
  code: string;
  name: string;
}

export interface CentreRef {
  code: string;
  name: string;
  shortName?: string | null;
}

export interface StudentRow {
  id: string;
  matricNumber: string;
  fullName: string;
  programme: ProgrammeRef;
  level: number;
  levelLabel: string;
  centre: CentreRef;
  email: string | null;
  status: StudentStatus;
  statusLabel: string;
}

export interface StudentFilters {
  programmes: { code: string; name: string; levels: number[] }[];
  centres: { code: string; name: string; shortName: string | null }[];
  statuses: { key: string; label: string }[];
}

export interface StudentRecord {
  id: string;
  matricNumber: string;
  surname: string;
  firstName: string;
  otherNames: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  programme: ProgrammeRef;
  level: number;
  levelLabel: string;
  centre: CentreRef;
  entrySession: string | null;
  status: StudentStatus;
  statusLabel: string;
  account: {
    welcomeSentAt: string | null;
    activatedAt: string | null;
    consent: { version: string; at: string } | null;
    lastSignInAt: string | null;
    lockedUntil: string | null;
  };
  history: { at: string; from: string | null; to: string; reason: string | null; by: { fullName: string } | null }[];
  createdAt: string;
  importedFrom: { importId: string; fileName: string } | null;
}

export interface NewStudent {
  surname: string;
  firstName: string;
  otherNames: string;
  matricNumber: string;
  programmeCode: string;
  level: number;
  centreCode: string;
  email: string;
  phone: string;
  sendWelcome: boolean;
}

export interface StudentImportProblem {
  row: number;
  matricNumber: string | null;
  name: string | null;
  severity: "ERROR" | "WARNING";
  field: string | null;
  message: string;
}

export interface StudentImportReport {
  importId: string;
  fileName: string;
  status: "CHECKED" | "IMPORTED";
  totalRows: number;
  ready: { count: number; new: number; updated: number; unchanged: number };
  errors: { count: number };
  warnings: { count: number };
  problems: StudentImportProblem[];
  problemsShown: number;
  checkedAt: string;
}

export interface StudentImportResult {
  importId: string;
  status: "IMPORTED";
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  warnings: number;
  importedAt: string;
  importedBy: { id: string; fullName: string };
}

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  importedAt: string;
  importedBy: { fullName: string };
  totalRows: number;
  added: number;
  updated: number;
  unchanged: number;
  errors: number;
  warnings: number;
}

export interface WelcomeSend {
  id: string;
  status: "RUNNING" | "DONE" | string;
  startedAt: string;
  finishedAt: string | null;
  remindAfterDays: number | null;
  reminderDueAt: string | null;
  totals: {
    students: number;
    toSend: number;
    sent: number;
    failed: number;
    sending: number;
    skippedNoEmail: number;
    skippedTestAddress: number;
    skippedActive: number;
  };
  progressPercent: number;
}

export interface WelcomeOverview {
  template: { subject: string; body: string; custom: boolean; updatedAt: string | null; updatedBy: string | null };
  fields: { key: string; label: string; example: string }[];
  preview: { studentName: string; subject: string; body: string };
  audience: { notActivated: number; withEmail: number; noEmail: number; alreadyActive: number };
  lastSend: WelcomeSend | null;
}

export interface Delivery {
  studentId: string;
  matricNumber: string;
  fullName: string;
  email: string | null;
  status: "SENT" | "FAILED" | "SKIPPED_NO_EMAIL" | "SKIPPED_TEST_ADDRESS" | "SENDING";
  reason: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------- student accounts

export interface PasswordRules {
  minLength: number;
  hint: string;
  rules: { key: string; label: string }[];
}

export interface PrivacyNotice {
  version: string;
  title: string;
  intro: string;
  points: string[];
}

export interface CodeSent {
  activationId?: string;
  resetId?: string;
  maskedEmail: string;
  codeSent: boolean;
  expiresInSeconds: number;
  resendInSeconds: number;
  sendsLeftThisHour: number;
  student: { firstName: string };
  centre: { name: string; phone: string | null } | null;
}

export interface CodeVerified {
  activationToken?: string;
  resetToken?: string;
  expiresInSeconds: number;
  student: { firstName: string; fullName: string; matricNumber: string };
}

export interface StudentProfile {
  id: string;
  matricNumber: string;
  fullName: string;
  firstName: string;
  initials: string;
  programme: ProgrammeRef;
  level: number;
  levelLabel: string;
  centre: CentreRef;
  email: string | null;
  phone: string | null;
  status: StudentStatus;
  consent: { version: string; at: string } | null;
}
