// In-memory model for the B1 mock (ODEL_MOCK_API=1). The handler in b1.ts turns it into the
// exact response shapes of api-b1-academic.md and api-b1-students.md.
import type { GradeBand, OfferKind, PersonStatus, StaffRoleCode, StaffScopeType, Standing, StudentStatus, UniversityAuditItem } from "@/lib/types-b1";

export interface MSemester {
  id: string;
  number: 1 | 2;
  startsOn: string | null;
  endsOn: string | null;
  registration: { opensOn: string; closesOn: string; lateClosesOn: string | null } | null;
}
export interface MSession {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  semesters: MSemester[];
  createdAt: number;
}
export interface MFaculty { id: string; name: string; code: string }
export interface MDepartment { id: string; facultyId: string; name: string; code: string }
export interface MProgramme {
  id: string;
  departmentId: string;
  name: string;
  code: string;
  degree: string;
  durationYears: number;
  entryLevels: number[];
  minUnitsToGraduate: number | null;
}
export interface MCourse {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: 1 | 2;
  offeredTo: { programmeId: string; kind: OfferKind }[];
}
export interface MCentre { id: string; name: string; shortName: string; code: string; address: string; state: string; phone: string | null }
export interface MRoom { id: string; centreId: string; name: string; seats: number; computers: number }
export interface MCourseStaff { lecturerId: string | null; facilitators: { centreId: string; userId: string }[]; examOfficerId: string | null }
export interface MStaffing { courses: Record<string, MCourseStaff>; centres: Record<string, string | null> }
export interface MRules {
  version: number;
  saved: boolean;
  savedAt: string | null;
  savedBy: string | null;
  effectiveSessionId: string | null;
  caWeight: number;
  examWeight: number;
  passMark: number;
  scale: number;
  roundTotals: boolean;
  bands: GradeBand[];
  standing: Standing;
}
export interface MPerson {
  id: string;
  fullName: string;
  email: string;
  status: PersonStatus;
  roles: { id: string; role: StaffRoleCode; scopeType: StaffScopeType; scopeId: string | null }[];
  twoStepSetUp: boolean;
  invitedAt: string | null;
  acceptedAt: string | null;
  lastSignInAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
}
export interface MStudent {
  id: string;
  userId: string;
  matricNumber: string;
  surname: string;
  firstName: string;
  otherNames: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  programmeCode: string;
  level: number;
  centreCode: string;
  entrySession: string | null;
  status: StudentStatus;
  beforeSuspend: StudentStatus | null;
  welcomeSentAt: string | null;
  activatedAt: string | null;
  consent: { version: string; at: string } | null;
  lastSignInAt: string | null;
  lockedUntil: number | null;
  wrongPasswords: number;
  password: string | null;
  history: { at: string; from: string | null; to: string; reason: string | null; by: { fullName: string } | null }[];
  createdAt: string;
  importedFrom: { importId: string; fileName: string } | null;
}

export interface Uni {
  sessions: MSession[];
  faculties: MFaculty[];
  departments: MDepartment[];
  programmes: MProgramme[];
  courses: MCourse[];
  centres: MCentre[];
  rooms: MRoom[];
  staffing: Record<string, MStaffing>;
  grading: { default: MRules; programmes: Record<string, MRules>; history: { programmeId: string | null; rules: MRules }[] };
  people: MPerson[];
  students: MStudent[];
  imports: Map<string, unknown>;
  importHistory: { id: string; fileName: string; importedAt: string; importedBy: { fullName: string }; totalRows: number; added: number; updated: number; unchanged: number; errors: number; warnings: number }[];
  welcome: { subject: string; body: string; custom: boolean; updatedAt: string | null; updatedBy: string | null };
  sends: { id: string; startedAt: number; remindAfterDays: number | null; toSend: string[]; failed: Record<string, string>; skippedNoEmail: string[]; skippedActive: string[]; students: number }[];
  audit: UniversityAuditItem[];
  codes: Map<string, { kind: "activation" | "reset"; studentId: string; createdAt: number; resendAt: number; wrong: number }>;
  tokens: Map<string, { kind: "activation" | "reset"; studentId: string; passwordSet: boolean; password?: string }>;
  sendsThisHour: Map<string, number[]>;
}

export const DEFAULT_BANDS: GradeBand[] = [
  { grade: "A", from: 70, to: 100, point: 5, remark: "Excellent" },
  { grade: "B", from: 60, to: 69, point: 4, remark: "Very good" },
  { grade: "C", from: 50, to: 59, point: 3, remark: "Good" },
  { grade: "D", from: 45, to: 49, point: 2, remark: "Fair" },
  { grade: "E", from: 40, to: 44, point: 1, remark: "Pass" },
  { grade: "F", from: 0, to: 39, point: 0, remark: "Fail (carry-over)" },
];

export const DEFAULT_STANDING: Standing = {
  probationBelow: 1.0,
  withdrawAfterProbationSemesters: 2,
  carryOverBeforeGraduating: true,
  classes: [
    { name: "First class", from: 4.5 },
    { name: "Second class upper", from: 3.5 },
    { name: "Second class lower", from: 2.4 },
    { name: "Third class", from: 1.5 },
    { name: "Pass", from: 1.0 },
  ],
};

export const defaultRules = (): MRules => ({
  version: 1,
  saved: false,
  savedAt: null,
  savedBy: null,
  effectiveSessionId: null,
  caWeight: 30,
  examWeight: 70,
  passMark: 40,
  scale: 5,
  roundTotals: true,
  bands: DEFAULT_BANDS.map((b) => ({ ...b })),
  standing: structuredClone(DEFAULT_STANDING),
});

export const DEFAULT_WELCOME = {
  subject: "Welcome to {university_name} ODeL — activate your account",
  body:
    "Hello {first_name},\n\nYou have been admitted to {programme}, {level}, at {centre_name}. Your matric number is {matric}.\n\n" +
    "Activate your portal account to see your courses and join live classes. It takes about 3 minutes.\n\n{activation_link}\n\n" +
    "Questions? Call your study centre on {centre_phone} or reply to this email.",
};

export function emptyUni(): Uni {
  return {
    sessions: [],
    faculties: [],
    departments: [],
    programmes: [],
    courses: [],
    centres: [],
    rooms: [],
    staffing: {},
    grading: { default: defaultRules(), programmes: {}, history: [] },
    people: [],
    students: [],
    imports: new Map(),
    importHistory: [],
    welcome: { ...DEFAULT_WELCOME, custom: false, updatedAt: null, updatedBy: null },
    sends: [],
    audit: [],
    codes: new Map(),
    tokens: new Map(),
    sendsThisHour: new Map(),
  };
}

const iso = (d: string) => new Date(d).toISOString();

/** The ODeL admin herself, so she shows on People & roles (and cannot suspend herself). */
export function adminPerson(fullName: string, email: string): MPerson {
  return {
    id: "p-admin",
    fullName,
    email,
    status: "ACTIVE",
    roles: [{ id: "pr-admin", role: "ODEL_ADMIN", scopeType: "UNIVERSITY", scopeId: null }],
    twoStepSetUp: true,
    invitedAt: iso("2026-11-20T15:02:00+01:00"),
    acceptedAt: iso("2026-11-21T09:10:00+01:00"),
    lastSignInAt: iso("2026-11-27T08:30:00+01:00"),
    suspendedAt: null,
    suspendedReason: null,
  };
}

/** Wesley in the middle of setting up 2026/2027 (matches the D1 frames). */
export function demoUni(admin: { fullName: string; email: string }): Uni {
  const u = emptyUni();
  const created = Date.parse("2026-11-21T10:00:00+01:00");
  u.sessions = [
    {
      id: "s-2526",
      name: "2025/2026",
      status: "ARCHIVED",
      createdAt: created - 300 * 86400_000,
      semesters: [
        { id: "sem-2526-1", number: 1, startsOn: "2025-10-06", endsOn: "2026-02-27", registration: { opensOn: "2025-10-06", closesOn: "2025-10-24", lateClosesOn: null } },
        { id: "sem-2526-2", number: 2, startsOn: "2026-03-16", endsOn: "2026-07-31", registration: null },
      ],
    },
    {
      id: "s-2627",
      name: "2026/2027",
      status: "DRAFT",
      createdAt: created,
      semesters: [
        { id: "sem-2627-1", number: 1, startsOn: "2026-10-05", endsOn: "2027-02-26", registration: { opensOn: "2027-02-02", closesOn: "2027-02-16", lateClosesOn: null } },
        { id: "sem-2627-2", number: 2, startsOn: "2027-03-15", endsOn: "2027-07-30", registration: null },
      ],
    },
  ];
  u.faculties = [
    { id: "f-sci", name: "Faculty of Science", code: "SCI" },
    { id: "f-mgt", name: "Faculty of Management Sciences", code: "MGT" },
  ];
  u.departments = [
    { id: "d-csc", facultyId: "f-sci", name: "Computer Science", code: "CSC" },
    { id: "d-ift", facultyId: "f-sci", name: "Information Technology", code: "IFT" },
    { id: "d-acc", facultyId: "f-mgt", name: "Accounting", code: "ACC" },
  ];
  u.programmes = [
    { id: "pg-csc", departmentId: "d-csc", name: "B.Sc. Computer Science", code: "BSC-CSC-ODL", degree: "B.Sc.", durationYears: 4, entryLevels: [100, 200], minUnitsToGraduate: 120 },
    { id: "pg-ift", departmentId: "d-ift", name: "B.Sc. Information Technology", code: "BSC-IFT-ODL", degree: "B.Sc.", durationYears: 4, entryLevels: [100], minUnitsToGraduate: 120 },
    { id: "pg-acc", departmentId: "d-acc", name: "B.Sc. Accounting", code: "BSC-ACC-ODL", degree: "B.Sc.", durationYears: 4, entryLevels: [100], minUnitsToGraduate: null },
  ];
  const c = (id: string, code: string, title: string, units: number, level: number, semester: 1 | 2, prog: string[], kind: OfferKind = "COMPULSORY"): MCourse => ({
    id,
    code,
    title,
    units,
    level,
    semester,
    offeredTo: prog.map((programmeId) => ({ programmeId, kind })),
  });
  u.courses = [
    c("c-csc201", "CSC 201", "Data Structures and Algorithms", 3, 200, 1, ["pg-csc"]),
    c("c-csc203", "CSC 203", "Computer Architecture", 3, 200, 1, ["pg-csc", "pg-ift"]),
    c("c-csc205", "CSC 205", "Discrete Mathematics", 2, 200, 1, ["pg-csc"]),
    c("c-csc207", "CSC 207", "Operating Systems I", 3, 200, 1, ["pg-csc"]),
    c("c-gst201", "GST 201", "Entrepreneurship Studies", 2, 200, 1, ["pg-csc", "pg-ift", "pg-acc"]),
    c("c-ift101", "IFT 101", "Introduction to Computing", 3, 100, 1, ["pg-ift"]),
    c("c-csc202", "CSC 202", "Web Technologies", 2, 200, 2, ["pg-csc"], "ELECTIVE"),
    c("c-acc101", "ACC 101", "Principles of Accounting", 3, 100, 1, ["pg-acc"]),
  ];
  u.centres = [
    { id: "ce-akr", name: "Akure Study Centre", shortName: "Akure", code: "AKR", address: "Oba Adesida Road, Akure", state: "Ondo", phone: "0803 555 0117" },
    { id: "ce-ond", name: "Ondo (main campus)", shortName: "Ondo", code: "OND", address: "Wesley University, Ondo", state: "Ondo", phone: "0803 555 0120" },
    { id: "ce-lag", name: "Lagos (Ikeja) Study Centre", shortName: "Lagos (Ikeja)", code: "LAG", address: "12 Allen Avenue, Ikeja, Lagos", state: "Lagos", phone: "0803 555 0142" },
    { id: "ce-ibd", name: "Ibadan Study Centre", shortName: "Ibadan", code: "IBD", address: "Ring Road, Ibadan", state: "Oyo", phone: null },
    { id: "ce-abj", name: "Abuja Study Centre", shortName: "Abuja", code: "ABJ", address: "Wuse 2, Abuja", state: "FCT", phone: "0803 555 0190" },
  ];
  u.rooms = [
    { id: "r-akr1", centreId: "ce-akr", name: "CBT Lab 1", seats: 60, computers: 60 },
    { id: "r-ond1", centreId: "ce-ond", name: "CBT Hall", seats: 120, computers: 120 },
    { id: "r-lag1", centreId: "ce-lag", name: "CBT Lab 1", seats: 40, computers: 40 },
    { id: "r-lag2", centreId: "ce-lag", name: "Tutorial Room A", seats: 60, computers: 0 },
    { id: "r-ibd1", centreId: "ce-ibd", name: "Lecture Room 1", seats: 50, computers: 0 },
    { id: "r-abj1", centreId: "ce-abj", name: "Room 1", seats: 30, computers: 30 },
  ];
  const p = (id: string, fullName: string, email: string, status: PersonStatus, roles: MPerson["roles"], extra: Partial<MPerson> = {}): MPerson => ({
    id,
    fullName,
    email,
    status,
    roles,
    twoStepSetUp: status === "ACTIVE",
    invitedAt: iso("2026-11-22T10:00:00+01:00"),
    acceptedAt: status === "INVITED" ? null : iso("2026-11-23T09:00:00+01:00"),
    lastSignInAt: status === "INVITED" ? null : iso("2026-11-26T14:00:00+01:00"),
    suspendedAt: null,
    suspendedReason: null,
    ...extra,
  });
  u.people = [
    adminPerson(admin.fullName, admin.email),
    p("p-bello", "Dr Funmi Bello", "f.bello@wesleyuni.edu.ng", "ACTIVE", [{ id: "pr-1", role: "LECTURER", scopeType: "DEPARTMENT", scopeId: "d-csc" }]),
    p("p-adeyemi", "Prof. Kehinde Adeyemi", "k.adeyemi@wesleyuni.edu.ng", "ACTIVE", [
      { id: "pr-2", role: "LECTURER", scopeType: "DEPARTMENT", scopeId: "d-csc" },
      { id: "pr-3", role: "HOD", scopeType: "DEPARTMENT", scopeId: "d-csc" },
    ]),
    p("p-lawal", "Dr Musa Lawal", "m.lawal@wesleyuni.edu.ng", "ACTIVE", [{ id: "pr-4", role: "LECTURER", scopeType: "DEPARTMENT", scopeId: "d-csc" }]),
    p("p-ade", "Mrs Bisi Ade", "b.ade@wesleyuni.edu.ng", "ACTIVE", [{ id: "pr-5", role: "CENTRE_COORDINATOR", scopeType: "CENTRE", scopeId: "ce-akr" }]),
    p("p-tobi", "Mr Tobi Lawal", "t.lawal@wesleyuni.edu.ng", "INVITED", [
      { id: "pr-6", role: "LECTURER", scopeType: "DEPARTMENT", scopeId: "d-csc" },
      { id: "pr-7", role: "FACILITATOR", scopeType: "DEPARTMENT", scopeId: "d-csc" },
    ]),
    p("p-ojo", "Kayode Ojo", "k.ojo@wesleyuni.edu.ng", "ACTIVE", [{ id: "pr-8", role: "EXAM_OFFICER", scopeType: "FACULTY", scopeId: "f-sci" }]),
    p("p-dele", "Mr Dele Ojo", "d.ojo@wesleyuni.edu.ng", "ACTIVE", [{ id: "pr-9", role: "FACILITATOR", scopeType: "UNIVERSITY", scopeId: null }]),
    p("p-ola", "Mr Femi Ola", "f.ola@wesleyuni.edu.ng", "ACTIVE", [{ id: "pr-10", role: "CENTRE_COORDINATOR", scopeType: "CENTRE", scopeId: "ce-ond" }]),
    p("p-afolabi", "Mr Segun Afolabi", "s.afolabi@wesleyuni.edu.ng", "SUSPENDED", [{ id: "pr-11", role: "FACILITATOR", scopeType: "CENTRE", scopeId: "ce-lag" }], {
      suspendedAt: iso("2026-11-25T11:00:00+01:00"),
      suspendedReason: "On leave until January",
    }),
  ];
  u.staffing = {
    "s-2526": {
      courses: {
        "c-csc201": { lecturerId: "p-bello", facilitators: [{ centreId: "ce-akr", userId: "p-dele" }], examOfficerId: "p-ojo" },
        "c-csc205": { lecturerId: "p-adeyemi", facilitators: [], examOfficerId: "p-ojo" },
        "c-csc207": { lecturerId: "p-lawal", facilitators: [{ centreId: "ce-lag", userId: "p-afolabi" }], examOfficerId: null },
      },
      centres: { "ce-akr": "p-ade", "ce-ond": "p-ola" },
    },
    "s-2627": {
      courses: {
        "c-csc201": { lecturerId: "p-bello", facilitators: [{ centreId: "ce-akr", userId: "p-dele" }], examOfficerId: "p-ojo" },
        "c-csc203": { lecturerId: "p-lawal", facilitators: [{ centreId: "ce-lag", userId: "p-afolabi" }], examOfficerId: "p-ojo" },
      },
      centres: { "ce-akr": "p-ade" },
    },
  };
  const s = (
    n: number,
    matric: string,
    surname: string,
    firstName: string,
    programmeCode: string,
    level: number,
    centreCode: string,
    status: StudentStatus,
    email: string | null,
    extra: Partial<MStudent> = {},
  ): MStudent => {
    const at = iso("2026-11-24T10:12:00+01:00");
    return {
      id: `st-${n}`,
      userId: `su-${n}`,
      matricNumber: matric,
      surname,
      firstName,
      otherNames: null,
      email,
      phone: "0803 412 4417",
      gender: null,
      dateOfBirth: null,
      programmeCode,
      level,
      centreCode,
      entrySession: "2024/2025",
      status,
      beforeSuspend: null,
      welcomeSentAt: status === "IMPORTED" ? null : iso("2026-11-24T10:42:00+01:00"),
      activatedAt: status === "ACTIVE" ? iso("2026-11-25T08:15:00+01:00") : null,
      consent: status === "ACTIVE" ? { version: "2026-11", at: iso("2026-11-25T08:15:00+01:00") } : null,
      lastSignInAt: status === "ACTIVE" ? iso("2026-11-26T19:20:00+01:00") : null,
      lockedUntil: null,
      wrongPasswords: 0,
      password: status === "ACTIVE" || status === "SUSPENDED" ? "Password1" : null,
      history: [{ at, from: null, to: "IMPORTED", reason: "Imported from portal_export_200L.csv", by: { fullName: admin.fullName } }],
      createdAt: at,
      importedFrom: { importId: "imp-seed", fileName: "portal_export_200L.csv" },
      ...extra,
    };
  };
  u.students = [
    s(1, "WU/ODL/24/0153", "Okafor", "Adeola", "BSC-CSC-ODL", 200, "AKR", "INVITED", "adeola.okafor@gmail.com"),
    s(2, "WU/ODL/24/0166", "Ajayi", "Tunde", "BSC-CSC-ODL", 200, "AKR", "ACTIVE", "tunde.ajayi@gmail.com"),
    s(3, "WU/ODL/24/0201", "Okeke", "Chidinma", "BSC-CSC-ODL", 200, "OND", "ACTIVE", "chidinma.okeke@yahoo.com"),
    s(4, "WU/ODL/24/0215", "Bello", "Halima", "BSC-CSC-ODL", 200, "LAG", "ACTIVE", "halima.bello@gmail.com"),
    s(5, "WU/ODL/25/0042", "Ibrahim", "Musa", "BSC-IFT-ODL", 100, "ABJ", "IMPORTED", null),
    s(6, "WU/ODL/25/0107", "Eze", "Grace", "BSC-IFT-ODL", 100, "AKR", "ACTIVE", "grace.eze@gmail.com"),
    s(7, "WU/ODL/23/0311", "Akin", "Sade", "BSC-CSC-ODL", 300, "IBD", "SUSPENDED", "sade.akin@gmail.com", { beforeSuspend: "ACTIVE", activatedAt: iso("2026-11-25T08:15:00+01:00") }),
    s(8, "WU/ODL/25/0118", "Nwosu", "Emeka", "BSC-ACC-ODL", 100, "LAG", "IMPORTED", "emeka.nwosu@gmail.com"),
    s(9, "WU/ODL/25/0121", "Adewale", "Bayo", "BSC-ACC-ODL", 100, "OND", "IMPORTED", "bayo.adewale@bounce.test"),
  ];
  u.importHistory = [
    {
      id: "imp-seed",
      fileName: "portal_export_200L.csv",
      importedAt: iso("2026-11-24T10:12:00+01:00"),
      importedBy: { fullName: admin.fullName },
      totalRows: 11,
      added: 9,
      updated: 0,
      unchanged: 0,
      errors: 2,
      warnings: 1,
    },
  ];
  return u;
}
