// Mock of api-b1-academic.md: sessions, structure, catalogue, centres, staffing, grading, checklist.
import type { AcademicImport, AcademicSession, ChecklistB1, GradeBand, GradingRules, Standing } from "@/lib/types-b1";
import { NG_STATES } from "@/lib/staff-roles";
import { defaultRules, type MCourse, type MRules, type MSession, type Uni } from "./b1-data";
import {
  body,
  csvResponse,
  dayMonth,
  dayMonthYear,
  err,
  forbidden,
  invalid,
  isDate,
  json,
  month,
  n,
  noContent,
  notFound,
  page,
  parseCsv,
  readUpload,
  record,
  today,
  uid,
  uploadTicket,
  type B1Ctx,
} from "./b1-util";

// ---------------------------------------------------------------- read models

export function currentSession(u: Uni): MSession | null {
  const active = u.sessions.find((s) => s.status === "ACTIVE");
  if (active) return active;
  return [...u.sessions].filter((s) => s.status === "DRAFT").sort((a, b) => b.name.localeCompare(a.name))[0] ?? null;
}

const sessionStart = (s: MSession) => s.semesters.find((x) => x.number === 1)?.startsOn ?? null;
const sessionEnd = (s: MSession) => s.semesters.find((x) => x.number === 2)?.endsOn ?? s.semesters.find((x) => x.number === 1)?.endsOn ?? null;

export function sessionView(u: Uni, s: MSession): AcademicSession {
  const sems = ([1, 2] as const).map(
    (num) => s.semesters.find((x) => x.number === num) ?? { id: `${s.id}-${num}`, number: num, startsOn: null, endsOn: null, registration: null },
  );
  const label = (x: (typeof sems)[number], i: number) =>
    x.startsOn && x.endsOn ? `${i === 0 ? "1st" : "2nd"}: ${month(x.startsOn)}–${month(x.endsOn)}` : i === 0 ? "1st" : "2nd";
  const reg = sems.map((x) => x.registration).find(Boolean) ?? null;
  const registrationLabel = !reg
    ? "Not set"
    : (reg.lateClosesOn ?? reg.closesOn) < today()
      ? "Closed"
      : `${dayMonth(reg.opensOn)} – ${dayMonthYear(reg.closesOn)}`;
  const cur = currentSession(u);
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    startsOn: sessionStart(s),
    endsOn: sessionEnd(s),
    current: cur?.id === s.id,
    semesters: sems.map((x) => ({ ...x, name: x.number === 1 ? "First semester" : "Second semester" })),
    semestersLabel: sems.map(label).join(" · "),
    registrationLabel,
    complete: sems.every((x) => x.startsOn && x.endsOn) && sems.some((x) => x.registration),
  };
}

const levelsOf = (years: number) => Array.from({ length: years }, (_, i) => (i + 1) * 100);

function staffingFor(u: Uni, sessionId: string | null | undefined) {
  const sid = sessionId ?? currentSession(u)?.id;
  if (!sid) return null;
  u.staffing[sid] ??= { courses: {}, centres: {} };
  return { id: sid, s: u.staffing[sid] };
}

const personRef = (u: Uni, id: string | null | undefined) => {
  const p = id ? u.people.find((x) => x.id === id) : null;
  return p ? { id: p.id, fullName: p.fullName, status: p.status } : null;
};

function structure(u: Uni) {
  const courseCount = (pid: string) => u.courses.filter((c) => c.offeredTo.some((o) => o.programmeId === pid)).length;
  const faculties = u.faculties.map((f) => {
    const departments = u.departments
      .filter((d) => d.facultyId === f.id)
      .map((d) => {
        const programmes = u.programmes
          .filter((p) => p.departmentId === d.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            degree: p.degree,
            durationYears: p.durationYears,
            levels: levelsOf(p.durationYears),
            entryLevels: p.entryLevels,
            minUnitsToGraduate: p.minUnitsToGraduate,
            status: "ACTIVE",
            courseCount: courseCount(p.id),
          }));
        return { id: d.id, name: d.name, code: d.code, programmeCount: programmes.length, programmes };
      });
    return { id: f.id, name: f.name, code: f.code, departmentCount: departments.length, departments };
  });
  return { faculties, totals: { faculties: u.faculties.length, departments: u.departments.length, programmes: u.programmes.length } };
}

function courseView(u: Uni, c: MCourse) {
  const st = staffingFor(u, null);
  const lecturer = personRef(u, st?.s.courses[c.id]?.lecturerId);
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    units: c.units,
    level: c.level,
    semester: c.semester,
    semesterLabel: c.semester === 1 ? "First" : "Second",
    offeredTo: c.offeredTo.map((o) => ({ ...o, programmeName: u.programmes.find((p) => p.id === o.programmeId)?.name ?? "" })),
    lecturer,
    needsLecturer: !lecturer,
  };
}

function centreView(u: Uni, id: string) {
  const c = u.centres.find((x) => x.id === id)!;
  const rooms = u.rooms.filter((r) => r.centreId === id);
  const st = staffingFor(u, null);
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    address: c.address,
    state: c.state,
    phone: c.phone,
    coordinator: (() => {
      const p = personRef(u, st?.s.centres[c.id]);
      return p ? { id: p.id, fullName: p.fullName } : null;
    })(),
    rooms: rooms.length,
    seats: rooms.reduce((a, r) => a + r.seats, 0),
    computers: rooms.reduce((a, r) => a + r.computers, 0),
    students: u.students.filter((s) => s.centreCode === c.code).length,
  };
}

function rulesView(u: Uni, programmeId: string | null): GradingRules {
  const own = programmeId ? u.grading.programmes[programmeId] : undefined;
  const r: MRules = own ?? u.grading.default;
  const prog = programmeId ? u.programmes.find((p) => p.id === programmeId) : null;
  const eff = u.sessions.find((s) => s.id === r.effectiveSessionId) ?? currentSession(u);
  const ex = (() => {
    const total = 24 + 51;
    const b = r.bands.find((x) => total >= x.from && total <= x.to);
    return b ? `CA 24 + exam 51 = ${total} → ${b.grade} (${b.point} points)` : `CA 24 + exam 51 = ${total}`;
  })();
  return {
    scope: programmeId ? "PROGRAMME" : "DEFAULT",
    programme: prog ? { id: prog.id, name: prog.name } : null,
    version: r.version,
    saved: r.saved,
    effectiveSession: eff ? { id: eff.id, name: eff.name } : null,
    caWeight: r.caWeight,
    examWeight: r.examWeight,
    passMark: r.passMark,
    scale: r.scale,
    roundTotals: r.roundTotals,
    bands: r.bands,
    standing: r.standing,
    summary: `${own ? "Own rules" : "Default"} ${r.scale}-point scale (${r.caWeight}% CA / ${r.examWeight}% exam)`,
    programmesWithOwnRules: Object.keys(u.grading.programmes).length,
    inheritedFromDefault: !!programmeId && !own,
    example: ex,
  };
}

// ---------------------------------------------------------------- checklist

export function checklist(u: Uni): ChecklistB1 {
  const cur = currentSession(u);
  const cv = cur ? sessionView(u, cur) : null;
  const st = cur ? u.staffing[cur.id] : undefined;
  const staffPeople = u.people.filter((p) => p.roles.some((r) => !["ODEL_ADMIN", "ODEL_DIRECTOR"].includes(r.role)));
  const lecturers = u.people.filter((p) => p.roles.some((r) => r.role === "LECTURER"));
  const needLect = u.courses.filter((c) => !st?.courses[c.id]?.lecturerId).length;
  const needCoord = u.centres.filter((c) => !st?.centres[c.id]).length;
  const anyStaffing = !!st && (Object.values(st.courses).some((c) => c.lecturerId || c.facilitators.length || c.examOfficerId) || Object.values(st.centres).some(Boolean));
  const withoutCoord = u.centres.filter((c) => !st?.centres[c.id]).length;
  const notOffered = u.courses.filter((c) => !c.offeredTo.length).length;
  const progNoCourse = u.programmes.filter((p) => !u.courses.some((c) => c.offeredTo.some((o) => o.programmeId === p.id))).length;
  const reg = cv?.semesters.map((s) => s.registration).find(Boolean);
  const welcomeSent = u.students.filter((s) => s.welcomeSentAt).length;
  const notSent = u.students.filter((s) => !s.welcomeSentAt && s.status !== "ACTIVE").length;

  type S = ChecklistB1["steps"][number]["status"];
  const steps: { key: string; title: string; base: string; href: string; status: S; summary?: string }[] = [
    {
      key: "SESSION",
      title: "Session and semesters",
      base: "Session dates and semesters",
      href: "/staff/academic-setup/sessions",
      status: !cur ? "NOT_STARTED" : cv!.complete ? "DONE" : "IN_PROGRESS",
      summary: cv ? `${cv.name} · 2 semesters${reg ? ` · registration ${Number(reg.opensOn.slice(8))}–${dayMonth(reg.closesOn)}` : ""}` : undefined,
    },
    {
      key: "STRUCTURE",
      title: "Academic structure",
      base: "Faculties, departments and programmes",
      href: "/staff/academic-setup/structure",
      status: !u.faculties.length
        ? "NOT_STARTED"
        : u.faculties.some((f) => !u.departments.some((d) => d.facultyId === f.id)) || u.departments.some((d) => !u.programmes.some((p) => p.departmentId === d.id)) || !u.programmes.length
          ? "IN_PROGRESS"
          : "DONE",
      summary: u.faculties.length
        ? `${u.faculties.length} ${u.faculties.length === 1 ? "faculty" : "faculties"} · ${u.departments.length} department${u.departments.length === 1 ? "" : "s"} · ${u.programmes.length} programme${u.programmes.length === 1 ? "" : "s"}`
        : undefined,
    },
    {
      key: "CATALOGUE",
      title: "Course catalogue",
      base: "Courses for each programme",
      href: "/staff/courses",
      status: !u.courses.length ? "NOT_STARTED" : notOffered || progNoCourse ? "IN_PROGRESS" : "DONE",
      summary: u.courses.length ? `${n(u.courses.length)} course${u.courses.length === 1 ? "" : "s"}${notOffered ? ` · ${notOffered} not offered to any programme` : ""}` : undefined,
    },
    {
      key: "CENTRES",
      title: "Study centres",
      base: "Where students study and sit exams",
      href: "/staff/centres",
      status: !u.centres.length ? "NOT_STARTED" : u.centres.some((c) => !u.rooms.some((r) => r.centreId === c.id)) ? "IN_PROGRESS" : "DONE",
      summary: u.centres.length ? `${u.centres.length} centre${u.centres.length === 1 ? "" : "s"}${withoutCoord ? ` · ${withoutCoord} without a coordinator` : ""}` : undefined,
    },
    {
      key: "PEOPLE",
      title: "People and roles",
      base: "Invite lecturers, coordinators and staff",
      href: "/staff/people",
      status: !staffPeople.length ? "NOT_STARTED" : lecturers.length ? "DONE" : "IN_PROGRESS",
      summary: staffPeople.length ? `${staffPeople.length} staff invited · ${staffPeople.filter((p) => p.status === "ACTIVE").length} active` : undefined,
    },
    {
      key: "STAFFING",
      title: "Assign staff to courses and centres",
      base: "Who teaches each course and runs each centre",
      href: "/staff/academic-setup/staffing",
      status: !anyStaffing ? "NOT_STARTED" : needLect || needCoord ? "IN_PROGRESS" : "DONE",
      summary: anyStaffing
        ? [needLect ? `${needLect} course${needLect === 1 ? "" : "s"} still need a lecturer` : "", needCoord ? `${needCoord} centre${needCoord === 1 ? "" : "s"} need a coordinator` : ""].filter(Boolean).join(" · ") ||
          "Every course and centre has someone"
        : undefined,
    },
    {
      key: "GRADING",
      title: "Grading rules",
      base: "",
      href: "/staff/academic-setup/grading",
      status: u.grading.default.saved ? "DONE" : "NOT_STARTED",
      summary: `Default ${u.grading.default.scale}-point scale (${u.grading.default.caWeight}% CA / ${u.grading.default.examWeight}% exam)`,
    },
    {
      key: "IMPORT",
      title: "Import students",
      base: "From the university portal CSV",
      href: "/staff/students/import",
      status: u.students.length ? "DONE" : "NOT_STARTED",
      summary: u.students.length ? `${n(u.students.length)} students imported` : undefined,
    },
    {
      key: "WELCOME",
      title: "Send welcome messages",
      base: "Email with activation link",
      href: "/staff/students/welcome",
      status: !welcomeSent ? "NOT_STARTED" : notSent ? "IN_PROGRESS" : "DONE",
      summary: welcomeSent ? `${n(welcomeSent)} sent · ${n(notSent)} not sent` : undefined,
    },
  ];
  const done = (k: string) => steps.find((s) => s.key === k)!.status === "DONE";
  const out: ChecklistB1["steps"] = steps.map((s, i) => {
    let status = s.status;
    let lockedReason: string | null = null;
    if (s.key === "IMPORT" && status !== "DONE" && !(done("SESSION") && done("STRUCTURE") && done("CENTRES"))) {
      status = "LOCKED";
      lockedReason = "Finish steps 1, 2 and 4 first";
    }
    if (s.key === "WELCOME" && !u.students.length) {
      status = "LOCKED";
      lockedReason = "Import students first";
    }
    const actionLabel =
      status === "LOCKED" ? null : s.key === "GRADING" && status === "NOT_STARTED" ? "Review" : status === "DONE" ? "Edit" : status === "IN_PROGRESS" ? "Continue" : "Start";
    return {
      number: i + 1,
      key: s.key,
      title: s.title,
      summary: s.summary ?? s.base,
      status,
      actionLabel,
      href: s.href,
      ...(lockedReason ? { lockedReason } : {}),
    };
  });
  const d = out.filter((s) => s.status === "DONE").length;
  return { sessionName: cur?.name ?? null, steps: out, done: d, total: 9, percent: Math.round((d / 9) * 100) };
}

// ---------------------------------------------------------------- validation helpers

interface SessionBody {
  name?: string;
  semesters?: { number?: number; startsOn?: string; endsOn?: string; registration?: { opensOn?: string; closesOn?: string; lateClosesOn?: string | null } | null }[];
  makeActive?: boolean;
}

function checkSession(u: Uni, b: SessionBody, selfId: string | null): Response | MSession["semesters"] {
  const fields: Record<string, string> = {};
  const name = (b.name ?? "").trim();
  const m = name.match(/^(\d{4})\/(\d{4})$/);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) fields.name = "Write the session as 2026/2027.";
  const sems: MSession["semesters"] = [];
  (b.semesters ?? []).forEach((s, i) => {
    const num = s.number === 2 ? 2 : 1;
    const k = `semesters[${i}]`;
    if (s.startsOn && !isDate(s.startsOn)) fields[`${k}.startsOn`] = "Choose a date.";
    if (s.endsOn && !isDate(s.endsOn)) fields[`${k}.endsOn`] = "Choose a date.";
    if (s.startsOn && s.endsOn && s.endsOn <= s.startsOn) fields[`${k}.endsOn`] = "The semester must end after it starts.";
    const r = s.registration;
    let reg: MSession["semesters"][number]["registration"] = null;
    if (r && (r.opensOn || r.closesOn)) {
      if (!isDate(r.opensOn)) fields[`${k}.registration.opensOn`] = "Choose the day registration opens.";
      if (!isDate(r.closesOn)) fields[`${k}.registration.closesOn`] = "Choose the day registration closes.";
      if (isDate(r.opensOn) && isDate(r.closesOn) && r.closesOn < r.opensOn) fields[`${k}.registration.closesOn`] = "Registration must close on or after the day it opens.";
      if (r.lateClosesOn && isDate(r.closesOn) && r.lateClosesOn < r.closesOn) fields[`${k}.registration.lateClosesOn`] = "Late registration must close on or after the normal close.";
      if (isDate(r.closesOn) && s.endsOn && (r.lateClosesOn ?? r.closesOn) > s.endsOn) fields[`${k}.registration.closesOn`] = "Registration must close on or before the semester ends.";
      reg = { opensOn: r.opensOn!, closesOn: r.closesOn!, lateClosesOn: r.lateClosesOn || null };
    }
    sems.push({ id: uid(), number: num as 1 | 2, startsOn: s.startsOn || null, endsOn: s.endsOn || null, registration: reg });
  });
  const s1 = sems.find((s) => s.number === 1);
  const s2i = sems.findIndex((s) => s.number === 2);
  const s2 = sems[s2i];
  if (s1?.endsOn && s2?.startsOn && s2.startsOn <= s1.endsOn) fields[`semesters[${s2i}].startsOn`] = "The second semester must start after the first one ends.";
  if (Object.keys(fields).length) return invalid(fields);
  if (u.sessions.some((s) => s.name === name && s.id !== selfId)) return err(409, "name_taken", `There is already a ${name} session.`);
  const start = s1?.startsOn;
  const end = s2?.endsOn ?? s1?.endsOn;
  if (start && end) {
    for (const o of u.sessions) {
      if (o.id === selfId) continue;
      const os = sessionStart(o);
      const oe = sessionEnd(o);
      if (os && oe && start <= oe && end >= os) {
        return err(409, "overlap", `These dates overlap ${o.name} (${dayMonthYear(os)} – ${dayMonthYear(oe)}). Change the dates so sessions follow one another.`);
      }
    }
  }
  if (b.makeActive && !(sems.length === 2 && sems.every((s) => s.startsOn && s.endsOn))) {
    return err(400, "invalid", "Add both semesters' dates before making the session active.");
  }
  return sems;
}

const codeOk = (c: string) => /^[A-Za-z0-9-]{1,20}$/.test(c);

function checkBands(b: { caWeight?: number; examWeight?: number; passMark?: number; scale?: number; bands?: GradeBand[]; standing?: Standing }): Record<string, string> {
  const f: Record<string, string> = {};
  const ca = Number(b.caWeight);
  const ex = Number(b.examWeight);
  if (ca + ex !== 100) f.caWeight = `Coursework and exam add up to ${ca + ex}%. They must add up to 100%.`;
  const scale = Number(b.scale) || 5;
  const bands = [...(b.bands ?? [])].sort((x, y) => x.from - y.from);
  if (!bands.length) f.bands = "Add at least one band.";
  bands.forEach((x) => {
    if (!Number.isInteger(x.from) || !Number.isInteger(x.to) || x.from > x.to) f.bands ??= `Band ${x.grade}: "from" must be a whole number no bigger than "to".`;
    if (x.point < 0 || x.point > scale) f.bands ??= `Band ${x.grade}: points must be between 0 and ${scale}.`;
  });
  if (bands.length && bands[0].from !== 0) f.bands ??= "The bottom band must start at 0.";
  if (bands.length && bands[bands.length - 1].to !== 100) f.bands ??= "The top band must end at 100.";
  for (let i = 1; i < bands.length; i++) {
    const a = bands[i - 1];
    const c = bands[i];
    if (c.from <= a.to) f.bands ??= `Bands ${c.grade} (${c.from}–${c.to}) and ${a.grade} (${a.from}–${a.to}) overlap at ${c.from} to ${Math.min(a.to, c.to)}.`;
    else if (c.from > a.to + 1) f.bands ??= `Scores ${a.to + 1} to ${c.from - 1} are in no band.`;
    if (c.point < a.point) f.bands ??= `Band ${c.grade} has fewer points than ${a.grade}, a lower band.`;
  }
  const grades = bands.map((x) => x.grade.trim().toUpperCase());
  if (new Set(grades).size !== grades.length) f.bands ??= "Each band needs its own grade letter.";
  const pm = Number(b.passMark);
  if (!(pm >= 0 && pm <= 100)) f.passMark = "The pass mark must be between 0 and 100.";
  else {
    const pb = bands.find((x) => pm >= x.from && pm <= x.to);
    if (pb && pb.point <= 0) f.passMark = `The pass mark is ${pm} but scores of ${pm} get 0 points.`;
  }
  const st = b.standing;
  if (st) {
    if (!(st.probationBelow >= 0 && st.probationBelow <= scale)) f["standing.probationBelow"] = `Probation must be between 0 and ${scale}.00.`;
    if (!(st.withdrawAfterProbationSemesters >= 1 && st.withdrawAfterProbationSemesters <= 6)) f["standing.withdrawAfterProbationSemesters"] = "Choose 1 to 6 semesters.";
    for (let i = 1; i < st.classes.length; i++) {
      if (!(st.classes[i].from < st.classes[i - 1].from)) f["standing.classes"] = `${st.classes[i].name} must start below ${st.classes[i - 1].name}.`;
    }
  }
  return f;
}

// ---------------------------------------------------------------- CSV imports (structure, catalogue)

const STRUCT_COLS = ["faculty_name", "faculty_code", "department_name", "department_code", "programme_name", "programme_code", "degree", "duration_years", "entry_levels"];
const CAT_COLS = ["code", "title", "units", "level", "semester", "programme_code", "kind"];

type Stored = AcademicImport & { rows: Record<string, string>[] };

function normaliseCourseCode(c: string): string | null {
  const m = c.trim().match(/^([A-Za-z]{2,4})\s*(\d{3})$/);
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

function checkImport(u: Uni, kind: "STRUCTURE" | "CATALOGUE", fileName: string, text: string): Response | Stored {
  const rows = parseCsv(text);
  const cols = kind === "STRUCTURE" ? STRUCT_COLS : CAT_COLS;
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  if (header.join(",") !== cols.join(",")) return err(400, "bad_header", "The columns do not match the template: download the template and copy your rows into it.");
  if (rows.length < 2) return err(400, "empty_file", "The file has no rows under the header.");
  const data = rows.slice(1).map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? "").trim()])));
  const problems: { row: number; message: string }[] = [];
  const ready: Record<string, string>[] = [];
  if (kind === "STRUCTURE") {
    const facNames = new Map(u.faculties.map((f) => [f.code, f.name]));
    const deptFac = new Map(u.departments.map((d) => [d.code, u.faculties.find((f) => f.id === d.facultyId)?.code ?? ""]));
    const progRows = new Map<string, number>();
    data.forEach((r, i) => {
      const row = i + 2;
      const miss = cols.slice(0, 8).find((c) => !r[c]);
      if (miss) return problems.push({ row, message: `${miss.replace(/_/g, " ")} is empty: fill it in` });
      if (![r.faculty_code, r.department_code, r.programme_code].every(codeOk)) return problems.push({ row, message: "Codes may use letters, digits and hyphens only" });
      const fc = r.faculty_code.toUpperCase();
      const dc = r.department_code.toUpperCase();
      const pc = r.programme_code.toUpperCase();
      const yrs = Number(r.duration_years);
      if (!(Number.isInteger(yrs) && yrs >= 1 && yrs <= 7)) return problems.push({ row, message: `Duration "${r.duration_years}" must be 1 to 7 years` });
      const entry = (r.entry_levels || "100").split(/[;|]/).map((x) => Number(x.replace(/L$/i, "")));
      if (entry.some((l) => !levelsOf(yrs).includes(l))) return problems.push({ row, message: `Entry levels ${r.entry_levels} are not within 100L–${yrs * 100}L` });
      if (facNames.has(fc) && facNames.get(fc) !== r.faculty_name) return problems.push({ row, message: `Faculty code ${fc} is already used by ${facNames.get(fc)}` });
      if (deptFac.has(dc) && deptFac.get(dc) !== fc) return problems.push({ row, message: `Department ${dc} is already under another faculty (${deptFac.get(dc)})` });
      if (u.programmes.some((p) => p.code === pc)) return problems.push({ row, message: `Programme code ${pc} is already in the university` });
      if (progRows.has(pc)) return problems.push({ row, message: `Programme code ${pc} appears twice in the file (rows ${progRows.get(pc)} and ${row})` });
      progRows.set(pc, row);
      facNames.set(fc, r.faculty_name);
      deptFac.set(dc, fc);
      ready.push(r);
    });
  } else {
    const seen = new Map<string, Record<string, string>>();
    data.forEach((r, i) => {
      const row = i + 2;
      const code = normaliseCourseCode(r.code);
      if (!code) return problems.push({ row, message: `Course code "${r.code}" should look like CSC 201` });
      if (!r.title) return problems.push({ row, message: "Title is empty: fill it in" });
      const units = Number(r.units);
      if (!(Number.isInteger(units) && units >= 1 && units <= 12)) return problems.push({ row, message: `Units "${r.units}" must be 1 to 12` });
      const level = Number(r.level.replace(/L$/i, ""));
      if (!(level >= 100 && level <= 900 && level % 100 === 0)) return problems.push({ row, message: `Level "${r.level}" must be 100 to 900` });
      const sem = /^(1|first)$/i.test(r.semester) ? 1 : /^(2|second)$/i.test(r.semester) ? 2 : 0;
      if (!sem) return problems.push({ row, message: `Semester "${r.semester}" must be 1 or 2` });
      const prog = u.programmes.find((p) => p.code.toUpperCase() === r.programme_code.toUpperCase());
      if (!prog) return problems.push({ row, message: `Programme code "${r.programme_code}" not found: add it on the Structure screen first` });
      if (!/^(compulsory|core|elective)$/i.test(r.kind || "compulsory")) return problems.push({ row, message: `Kind "${r.kind}" must be compulsory or elective` });
      const existing = u.courses.find((c) => c.code === code);
      if (existing) return problems.push({ row, message: `${code} is already in the catalogue (${existing.title})` });
      const prev = seen.get(code);
      if (prev && (prev.title !== r.title || prev.units !== r.units || prev.level !== r.level || prev.semester !== r.semester)) {
        return problems.push({ row, message: `${code} appears in two rows with different details` });
      }
      seen.set(code, r);
      ready.push({ ...r, code, level: String(level), semester: String(sem) });
    });
  }
  const imp: Stored = {
    id: uid(),
    kind,
    fileName,
    status: "CHECKED",
    totalRows: data.length,
    readyRows: ready.length,
    problemRows: problems.length,
    problems,
    summary: problems.length ? `${problems.length} row${problems.length === 1 ? " needs" : "s need"} fixing` : "Every row is ready",
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    rows: ready,
  };
  u.imports.set(imp.id, imp);
  return imp;
}

const publicImport = (i: Stored): AcademicImport => {
  const { rows: _rows, ...rest } = i;
  void _rows;
  return rest;
};

function confirmImport(ctx: B1Ctx, i: Stored): Record<string, number> {
  const u = ctx.uni;
  const out = { faculties: 0, departments: 0, programmes: 0, courses: 0 };
  if (i.kind === "STRUCTURE") {
    for (const r of i.rows) {
      let f = u.faculties.find((x) => x.code === r.faculty_code.toUpperCase());
      if (!f) {
        f = { id: uid(), name: r.faculty_name, code: r.faculty_code.toUpperCase() };
        u.faculties.push(f);
        out.faculties++;
      }
      let d = u.departments.find((x) => x.code === r.department_code.toUpperCase());
      if (!d) {
        d = { id: uid(), facultyId: f.id, name: r.department_name, code: r.department_code.toUpperCase() };
        u.departments.push(d);
        out.departments++;
      }
      u.programmes.push({
        id: uid(),
        departmentId: d.id,
        name: r.programme_name,
        code: r.programme_code.toUpperCase(),
        degree: r.degree,
        durationYears: Number(r.duration_years),
        entryLevels: (r.entry_levels || "100").split(/[;|]/).map((x) => Number(x.replace(/L$/i, ""))),
        minUnitsToGraduate: null,
      });
      out.programmes++;
    }
    record(ctx, "IMPORT_STRUCTURE", `Imported ${i.fileName}: ${out.faculties} faculties, ${out.departments} departments, ${out.programmes} programmes`);
    const { courses: _c, ...rest } = out;
    void _c;
    return rest;
  }
  for (const r of i.rows) {
    const prog = u.programmes.find((p) => p.code.toUpperCase() === r.programme_code.toUpperCase())!;
    const kind = /elective/i.test(r.kind) ? "ELECTIVE" : "COMPULSORY";
    const c = u.courses.find((x) => x.code === r.code);
    if (c) c.offeredTo.push({ programmeId: prog.id, kind });
    else {
      u.courses.push({ id: uid(), code: r.code, title: r.title, units: Number(r.units), level: Number(r.level), semester: Number(r.semester) as 1 | 2, offeredTo: [{ programmeId: prog.id, kind }] });
      out.courses++;
    }
  }
  record(ctx, "IMPORT_CATALOGUE", `Imported ${i.fileName}: ${out.courses} courses`);
  return { courses: out.courses };
}

// ---------------------------------------------------------------- staffing helpers

function checkPick(u: Uni, userId: string | null | undefined, role: string, label: string, field: string, fields: Record<string, string>) {
  if (!userId) return;
  const p = u.people.find((x) => x.id === userId);
  if (!p) fields[field] = "Choose someone from People & roles.";
  else if (p.status === "SUSPENDED") fields[field] = `${p.fullName} is suspended.`;
  else if (!p.roles.some((r) => r.role === role)) fields[field] = `${p.fullName} does not have the ${label} role. Give it on People & roles first.`;
}

function staffingCourseRow(u: Uni, sid: string, c: MCourse) {
  const s = u.staffing[sid]?.courses[c.id];
  const lecturer = personRef(u, s?.lecturerId);
  return {
    course: { id: c.id, code: c.code, title: c.title, level: c.level, semester: c.semester },
    lecturer,
    facilitators: (s?.facilitators ?? []).map((f) => ({
      centreId: f.centreId,
      centreName: u.centres.find((x) => x.id === f.centreId)?.name ?? "",
      user: personRef(u, f.userId)!,
    })),
    examOfficer: personRef(u, s?.examOfficerId),
    needsLecturer: !lecturer,
  };
}

function staffingCentreRow(u: Uni, sid: string, id: string) {
  const c = u.centres.find((x) => x.id === id)!;
  const coord = personRef(u, u.staffing[sid]?.centres[id]);
  return { centre: { id: c.id, name: c.name, code: c.code }, coordinator: coord, students: u.students.filter((s) => s.centreCode === c.code).length, needsCoordinator: !coord };
}

// ---------------------------------------------------------------- the router

export async function academicRoute(ctx: B1Ctx): Promise<Response | null> {
  const { path, method, url, uni: u } = ctx;
  if (!path.startsWith("/academic/") && !path.startsWith("/setup/")) return null;
  if (!ctx.staff) return err(401, "signed_out", "You were signed out. Sign in again to continue.");
  const role = ctx.staff.role;
  const openRead = method === "GET" && ["/academic/sessions", "/academic/structure", "/academic/courses", "/academic/centres"].includes(path);
  const canRead = role === "ODEL_ADMIN" || role === "ODEL_DIRECTOR" || openRead;
  if (method === "GET" ? !canRead : role !== "ODEL_ADMIN") return forbidden();
  let m: RegExpMatchArray | null;

  // ---- checklist
  if (method === "GET" && path === "/setup/checklist") {
    if (role !== "ODEL_ADMIN") return forbidden();
    return json(200, checklist(u));
  }

  // ---- sessions
  if (path === "/academic/sessions") {
    if (method === "GET") {
      const items = [...u.sessions].sort((a, b) => b.name.localeCompare(a.name)).map((s) => sessionView(u, s));
      return json(200, { items });
    }
    if (method === "POST") {
      const b = await body<SessionBody>(ctx.req);
      const sems = checkSession(u, b, null);
      if (sems instanceof Response) return sems;
      const s: MSession = { id: uid(), name: b.name!.trim(), status: "DRAFT", semesters: sems, createdAt: Date.now() };
      u.sessions.push(s);
      if (b.makeActive) activate(u, s);
      record(ctx, "SESSION_CREATED", `Created session ${s.name}${b.makeActive ? " and made it active" : ""}`);
      return json(201, sessionView(u, s));
    }
  }
  if ((m = path.match(/^\/academic\/sessions\/([^/]+)(\/activate)?$/))) {
    const s = u.sessions.find((x) => x.id === m![1]);
    if (!s) return notFound("that session");
    if (method === "PUT" && !m[2]) {
      const b = await body<SessionBody>(ctx.req);
      const sems = checkSession(u, b, s.id);
      if (sems instanceof Response) return sems;
      s.name = b.name!.trim();
      s.semesters = sems;
      if (b.makeActive) activate(u, s);
      record(ctx, "SESSION_UPDATED", `Changed session ${s.name}${b.makeActive ? " and made it active" : ""}`);
      return json(200, sessionView(u, s));
    }
    if (method === "POST" && m[2]) {
      if (!(s.semesters.length === 2 && s.semesters.every((x) => x.startsOn && x.endsOn))) {
        return err(400, "invalid", "Add both semesters' dates before making the session active.");
      }
      activate(u, s);
      record(ctx, "SESSION_ACTIVATED", `Made ${s.name} the active session`);
      return json(200, sessionView(u, s));
    }
    if (method === "DELETE" && !m[2]) {
      const st = u.staffing[s.id];
      const used = st && (Object.keys(st.courses).length || Object.values(st.centres).some(Boolean));
      if (s.status !== "DRAFT" || used) return err(409, "in_use", "This session already has staff assigned; it cannot be deleted.");
      u.sessions = u.sessions.filter((x) => x !== s);
      record(ctx, "SESSION_DELETED", `Deleted draft session ${s.name}`);
      return noContent();
    }
  }

  // ---- structure
  if (method === "GET" && path === "/academic/structure") return json(200, structure(u));
  if (path === "/academic/faculties" || (m = path.match(/^\/academic\/faculties\/([^/]+)$/))) {
    const id = path === "/academic/faculties" ? null : m![1];
    const f = id ? u.faculties.find((x) => x.id === id) : null;
    if (id && !f) return notFound("that faculty");
    const b = await body<{ name?: string; code?: string }>(ctx.req);
    const fields: Record<string, string> = {};
    if (!b.name?.trim()) fields.name = "Enter the faculty's name.";
    if (!b.code?.trim() || !codeOk(b.code)) fields.code = "Use letters, digits and hyphens, like SCI.";
    if (Object.keys(fields).length) return invalid(fields);
    const code = b.code!.trim().toUpperCase();
    const clash = u.faculties.find((x) => x.code === code && x.id !== id);
    if (clash) return err(409, "code_taken", `${code} is already used by ${clash.name}.`, { fields: { code: `${code} is already used by ${clash.name}.` } });
    if (u.faculties.some((x) => x.name.toLowerCase() === b.name!.trim().toLowerCase() && x.id !== id)) return err(409, "name_taken", `There is already a ${b.name!.trim()}.`, { fields: { name: `There is already a ${b.name!.trim()}.` } });
    if (method === "POST" && !id) {
      const nf = { id: uid(), name: b.name!.trim(), code };
      u.faculties.push(nf);
      record(ctx, "FACULTY_CREATED", `Added ${nf.name} (${code})`);
      return json(201, { ...nf, departmentCount: 0, departments: [] });
    }
    if (method === "PUT" && f) {
      Object.assign(f, { name: b.name!.trim(), code });
      record(ctx, "FACULTY_UPDATED", `Renamed faculty ${f.code} to ${f.name}`);
      return json(200, structure(u).faculties.find((x) => x.id === f.id));
    }
  }
  if (path === "/academic/departments" || (m = path.match(/^\/academic\/departments\/([^/]+)$/))) {
    const id = path === "/academic/departments" ? null : m![1];
    const d = id ? u.departments.find((x) => x.id === id) : null;
    if (id && !d) return notFound("that department");
    const b = await body<{ facultyId?: string; name?: string; code?: string }>(ctx.req);
    const fields: Record<string, string> = {};
    if (!u.faculties.some((f) => f.id === b.facultyId)) fields.facultyId = "Choose a faculty.";
    if (!b.name?.trim()) fields.name = "Enter the department's name.";
    if (!b.code?.trim() || !codeOk(b.code)) fields.code = "Use letters, digits and hyphens, like CSC.";
    if (Object.keys(fields).length) return invalid(fields);
    const code = b.code!.trim().toUpperCase();
    const clash = u.departments.find((x) => x.code === code && x.id !== id);
    if (clash) return err(409, "code_taken", `${code} is already used by ${clash.name}.`, { fields: { code: `${code} is already used by ${clash.name}.` } });
    if (u.departments.some((x) => x.facultyId === b.facultyId && x.name.toLowerCase() === b.name!.trim().toLowerCase() && x.id !== id)) {
      return err(409, "name_taken", `This faculty already has ${b.name!.trim()}.`, { fields: { name: `This faculty already has ${b.name!.trim()}.` } });
    }
    const v = { facultyId: b.facultyId!, name: b.name!.trim(), code };
    if (method === "POST" && !id) {
      const nd = { id: uid(), ...v };
      u.departments.push(nd);
      record(ctx, "DEPARTMENT_CREATED", `Added ${nd.name} (${code})`);
      return json(201, { id: nd.id, name: nd.name, code, programmeCount: 0, programmes: [] });
    }
    if (method === "PUT" && d) {
      Object.assign(d, v);
      record(ctx, "DEPARTMENT_UPDATED", `Changed department ${d.name}`);
      return json(200, { id: d.id, name: d.name, code });
    }
  }
  if (path === "/academic/programmes" || (m = path.match(/^\/academic\/programmes\/([^/]+)$/))) {
    const id = path === "/academic/programmes" ? null : m![1];
    const p = id ? u.programmes.find((x) => x.id === id) : null;
    if (id && !p) return notFound("that programme");
    if (method === "GET" && p) {
      const d = u.departments.find((x) => x.id === p.departmentId)!;
      const f = u.faculties.find((x) => x.id === d.facultyId)!;
      const st = staffingFor(u, null);
      const courses = u.courses.filter((c) => c.offeredTo.some((o) => o.programmeId === p.id));
      const groups = new Map<string, typeof courses>();
      courses.forEach((c) => groups.set(`${c.level}-${c.semester}`, [...(groups.get(`${c.level}-${c.semester}`) ?? []), c]));
      const byLevel = [...groups.entries()]
        .map(([k, cs]) => ({
          level: Number(k.split("-")[0]),
          semester: Number(k.split("-")[1]),
          courses: cs.length,
          units: cs.reduce((a, c) => a + c.units, 0),
          lecturersAssigned: cs.filter((c) => st?.s.courses[c.id]?.lecturerId).length,
        }))
        .sort((a, b) => a.level - b.level || a.semester - b.semester);
      const rules = rulesView(u, p.id);
      return json(200, {
        id: p.id,
        name: p.name,
        code: p.code,
        degree: p.degree,
        durationYears: p.durationYears,
        durationLabel: `${p.durationYears} year${p.durationYears === 1 ? "" : "s"} · ${p.durationYears * 2} semesters`,
        levels: levelsOf(p.durationYears),
        entryLevels: p.entryLevels,
        entryLevelsLabel: p.entryLevels.map((l) => `${l}L`).join(", "),
        minUnitsToGraduate: p.minUnitsToGraduate,
        status: "ACTIVE",
        gradingRules: rules.inheritedFromDefault ? `Default ${rules.scale}-point scale` : "Own rules",
        department: { id: d.id, name: d.name },
        faculty: { id: f.id, name: f.name },
        byLevel,
      });
    }
    if (method === "POST" || method === "PUT") {
      const b = await body<{ departmentId?: string; name?: string; code?: string; degree?: string; durationYears?: number; entryLevels?: number[]; minUnitsToGraduate?: number | null }>(ctx.req);
      const fields: Record<string, string> = {};
      if (!u.departments.some((d) => d.id === b.departmentId)) fields.departmentId = "Choose a department.";
      if (!b.name?.trim()) fields.name = "Enter the programme's name.";
      if (!b.code?.trim() || !codeOk(b.code)) fields.code = "Use letters, digits and hyphens, like BSC-CSC.";
      if (!b.degree?.trim()) fields.degree = "Enter the degree, like B.Sc.";
      const yrs = Number(b.durationYears);
      if (!(Number.isInteger(yrs) && yrs >= 1 && yrs <= 7)) fields.durationYears = "Duration must be 1 to 7 years.";
      const entry = b.entryLevels?.length ? b.entryLevels : [100];
      if (!fields.durationYears && entry.some((l) => !levelsOf(yrs).includes(l))) fields.entryLevels = `Entry levels must be within 100L–${yrs * 100}L.`;
      if (b.minUnitsToGraduate !== null && b.minUnitsToGraduate !== undefined && !(b.minUnitsToGraduate > 0)) fields.minUnitsToGraduate = "Enter a number of units, or leave it empty.";
      if (Object.keys(fields).length) return invalid(fields);
      const code = b.code!.trim().toUpperCase();
      const clash = u.programmes.find((x) => x.code === code && x.id !== id);
      if (clash) return err(409, "code_taken", `${code} is already used by ${clash.name}.`, { fields: { code: `${code} is already used by ${clash.name}.` } });
      const v = { departmentId: b.departmentId!, name: b.name!.trim(), code, degree: b.degree!.trim(), durationYears: yrs, entryLevels: entry, minUnitsToGraduate: b.minUnitsToGraduate ?? null };
      if (method === "POST" && !id) {
        const np = { id: uid(), ...v };
        u.programmes.push(np);
        record(ctx, "PROGRAMME_CREATED", `Added ${np.name} (${code})`);
        return json(201, structure(u).faculties.flatMap((f) => f.departments.flatMap((d) => d.programmes)).find((x) => x.id === np.id));
      }
      if (method === "PUT" && p) {
        Object.assign(p, v);
        record(ctx, "PROGRAMME_UPDATED", `Changed ${p.name}`);
        return json(200, structure(u).faculties.flatMap((f) => f.departments.flatMap((d) => d.programmes)).find((x) => x.id === p.id));
      }
    }
  }

  // ---- uploads and imports
  if (method === "POST" && path === "/academic/uploads") {
    const b = await body<{ fileName?: string; contentType?: string; size?: number }>(ctx.req);
    if (!/\.csv$/i.test(b.fileName ?? "")) return invalid({ file: "Upload a CSV file. In Excel use File → Save as → CSV UTF-8." });
    if ((b.size ?? 0) > 5 * 1024 * 1024) return invalid({ file: "The file must be 5 MB or smaller." });
    return json(200, uploadTicket(b.fileName!, b.contentType ?? "text/csv"));
  }
  if (method === "POST" && (path === "/academic/structure/imports" || path === "/academic/courses/imports")) {
    const b = await body<{ key?: string; fileName?: string }>(ctx.req);
    const text = readUpload(ctx, b.key ?? "");
    if (text === null) return err(400, "file_missing", "We could not find the uploaded file. Upload it again.");
    const r = checkImport(u, path.includes("structure") ? "STRUCTURE" : "CATALOGUE", b.fileName ?? "file.csv", text);
    return r instanceof Response ? r : json(200, publicImport(r));
  }
  if (method === "GET" && (m = path.match(/^\/academic\/imports\/templates\/(structure|catalogue)\.csv$/))) {
    return m[1] === "structure"
      ? csvResponse("structure-template.csv", [STRUCT_COLS, ["Faculty of Science", "SCI", "Computer Science", "CSC", "B.Sc. Computer Science", "BSC-CSC", "B.Sc.", 4, "100;200"]])
      : csvResponse("catalogue-template.csv", [CAT_COLS, ["CSC 201", "Data Structures", 3, 200, 1, "BSC-CSC", "compulsory"]]);
  }
  if ((m = path.match(/^\/academic\/imports\/([^/]+)(\/confirm|\/cancel|\/problems\.csv)?$/))) {
    const i = u.imports.get(m[1]) as Stored | undefined;
    if (!i || !("kind" in i)) return notFound("that import");
    if (method === "GET" && !m[2]) return json(200, publicImport(i));
    if (method === "GET" && m[2] === "/problems.csv") return csvResponse("problem-rows.csv", [["row", "problem"], ...i.problems.map((p) => [p.row, p.message])]);
    if (method === "POST" && m[2] === "/cancel") {
      i.status = "CANCELLED";
      return noContent();
    }
    if (method === "POST" && m[2] === "/confirm") {
      if (i.status === "IMPORTED") return err(409, "already_done", "This file has already been imported.");
      i.imported = confirmImport(ctx, i);
      i.status = "IMPORTED";
      i.confirmedAt = new Date().toISOString();
      return json(200, publicImport(i));
    }
  }

  // ---- catalogue
  if (path === "/academic/courses" && method === "GET") {
    const q = (url.searchParams.get("search") ?? "").toLowerCase().replace(/\s+/g, "");
    const pid = url.searchParams.get("programmeId");
    const level = Number(url.searchParams.get("level")) || null;
    const sem = Number(url.searchParams.get("semester")) || null;
    const lect = url.searchParams.get("lecturer") ?? "any";
    const all = u.courses
      .map((c) => courseView(u, c))
      .filter(
        (c) =>
          (!q || c.code.toLowerCase().replace(/\s+/g, "").includes(q) || c.title.toLowerCase().includes(q)) &&
          (!pid || c.offeredTo.some((o) => o.programmeId === pid)) &&
          (!level || c.level === level) &&
          (!sem || c.semester === sem) &&
          (lect === "any" || (lect === "none" ? !c.lecturer : c.lecturer?.id === lect)),
      )
      .sort((a, b) => a.code.localeCompare(b.code));
    return json(200, { ...page(all, url), catalogueTotal: u.courses.length, programmeTotal: u.programmes.length });
  }
  if (path === "/academic/courses" || (m = path.match(/^\/academic\/courses\/([^/]+)$/))) {
    const id = path === "/academic/courses" ? null : m![1];
    const c = id ? u.courses.find((x) => x.id === id) : null;
    if (id && !c) return notFound("that course");
    if (method === "GET" && c) return json(200, courseView(u, c));
    if (method === "POST" || method === "PUT") {
      const b = await body<{ code?: string; title?: string; units?: number; level?: number; semester?: number; offeredTo?: { programmeId: string; kind: string }[]; lecturerId?: string | null }>(ctx.req);
      const fields: Record<string, string> = {};
      const code = normaliseCourseCode(b.code ?? "");
      if (!code) fields.code = "Write the code like CSC 201.";
      if (!b.title?.trim()) fields.title = "Enter the course title.";
      const units = Number(b.units);
      if (!(Number.isInteger(units) && units >= 1 && units <= 12)) fields.units = "Units must be 1 to 12.";
      const level = Number(b.level);
      if (!(level >= 100 && level <= 900 && level % 100 === 0)) fields.level = "Choose a level.";
      if (b.semester !== 1 && b.semester !== 2) fields.semester = "Choose a semester.";
      const offered = (b.offeredTo ?? []).filter((o) => o.programmeId);
      for (const o of offered) {
        const p = u.programmes.find((x) => x.id === o.programmeId);
        if (!p) fields.offeredTo = "Choose programmes from Academic structure.";
        else if (!fields.level && !levelsOf(p.durationYears).includes(level)) fields.level = `${p.name} has no ${level}L.`;
      }
      checkPick(u, b.lecturerId, "LECTURER", "Lecturer", "lecturerId", fields);
      if (Object.keys(fields).length) return invalid(fields);
      const clash = u.courses.find((x) => x.code === code && x.id !== id);
      if (clash) return err(409, "code_taken", `${code} is already in the catalogue (${clash.title}).`, { fields: { code: `${code} is already in the catalogue (${clash.title}).` } });
      const v = { code: code!, title: b.title!.trim(), units, level, semester: b.semester as 1 | 2, offeredTo: offered.map((o) => ({ programmeId: o.programmeId, kind: o.kind === "ELECTIVE" ? ("ELECTIVE" as const) : ("COMPULSORY" as const) })) };
      let course = c;
      if (method === "POST" && !id) {
        course = { id: uid(), ...v };
        u.courses.push(course);
        record(ctx, "COURSE_CREATED", `Added ${code} · ${v.title}`);
      } else if (c) {
        Object.assign(c, v);
        record(ctx, "COURSE_UPDATED", `Changed ${code} · ${v.title}`);
      }
      if (b.lecturerId !== undefined) {
        const st = staffingFor(u, null);
        if (st) {
          st.s.courses[course!.id] ??= { lecturerId: null, facilitators: [], examOfficerId: null };
          st.s.courses[course!.id].lecturerId = b.lecturerId;
        }
      }
      return json(method === "POST" ? 201 : 200, courseView(u, course!));
    }
  }

  // ---- centres and rooms
  if (path === "/academic/centres" && method === "GET") return json(200, { items: u.centres.map((c) => centreView(u, c.id)) });
  if (path === "/academic/centres" || (m = path.match(/^\/academic\/centres\/([^/]+)$/))) {
    const id = path === "/academic/centres" ? null : m![1];
    const c = id ? u.centres.find((x) => x.id === id) : null;
    if (id && !c) return notFound("that centre");
    if (method === "GET" && c) return json(200, { ...centreView(u, c.id), roomsList: u.rooms.filter((r) => r.centreId === c.id).map(({ centreId: _x, ...r }) => (void _x, r)) });
    if (method === "POST" || method === "PUT") {
      const b = await body<{ name?: string; code?: string; address?: string; state?: string; phone?: string }>(ctx.req);
      const fields: Record<string, string> = {};
      if (!b.name?.trim()) fields.name = "Enter the centre's name.";
      if (!/^[A-Za-z0-9]{2,6}$/.test(b.code ?? "")) fields.code = "Use 2 to 6 letters or digits, like AKR.";
      if (!NG_STATES.includes(b.state ?? "")) fields.state = "Choose a state.";
      const phone = (b.phone ?? "").replace(/\s+/g, "");
      if (phone && !/^(0\d{10}|\+234\d{10})$/.test(phone)) fields.phone = "Write a Nigerian number like 0803 123 4567.";
      if (Object.keys(fields).length) return invalid(fields);
      const code = b.code!.toUpperCase();
      const clash = u.centres.find((x) => x.code === code && x.id !== id);
      if (clash) return err(409, "code_taken", `${code} is already used by ${clash.name}.`, { fields: { code: `${code} is already used by ${clash.name}.` } });
      const v = { name: b.name!.trim(), code, address: (b.address ?? "").trim(), state: b.state!, phone: b.phone?.trim() || null };
      if (method === "POST" && !id) {
        const nc = { id: uid(), shortName: v.name.replace(/ Study Centre$/i, ""), ...v };
        u.centres.push(nc);
        record(ctx, "CENTRE_CREATED", `Added ${nc.name} (${code})`);
        return json(201, centreView(u, nc.id));
      }
      if (c) {
        Object.assign(c, v);
        record(ctx, "CENTRE_UPDATED", `Changed ${c.name}`);
        return json(200, centreView(u, c.id));
      }
    }
  }
  if ((m = path.match(/^\/academic\/centres\/([^/]+)\/rooms$/)) || (m = path.match(/^\/academic\/rooms\/([^/]+)$/))) {
    const isNew = path.endsWith("/rooms");
    const room = isNew ? null : u.rooms.find((r) => r.id === m![1]);
    const centreId = isNew ? m[1] : room?.centreId;
    if (!centreId || !u.centres.some((c) => c.id === centreId)) return notFound(isNew ? "that centre" : "that room");
    if (method === "DELETE" && room) {
      u.rooms = u.rooms.filter((r) => r !== room);
      record(ctx, "ROOM_DELETED", `Removed ${room.name}`);
      return noContent();
    }
    if ((method === "POST" && isNew) || (method === "PUT" && room)) {
      const b = await body<{ name?: string; seats?: number; computers?: number }>(ctx.req);
      const fields: Record<string, string> = {};
      const seats = Number(b.seats);
      const comps = Number(b.computers ?? 0);
      if (!b.name?.trim()) fields.name = "Enter the room's name.";
      if (!(Number.isInteger(seats) && seats >= 1 && seats <= 2000)) fields.seats = "Seats must be 1 to 2,000.";
      if (!(Number.isInteger(comps) && comps >= 0)) fields.computers = "Enter 0 or more computers.";
      else if (!fields.seats && comps > seats) fields.computers = "A room cannot have more computers than seats.";
      if (!fields.name && u.rooms.some((r) => r.centreId === centreId && r.name.toLowerCase() === b.name!.trim().toLowerCase() && r.id !== room?.id)) {
        fields.name = "This centre already has a room with that name.";
      }
      if (Object.keys(fields).length) return invalid(fields);
      const v = { name: b.name!.trim(), seats, computers: comps };
      if (room) {
        Object.assign(room, v);
        record(ctx, "ROOM_UPDATED", `Changed ${room.name}`);
        return json(200, { id: room.id, ...v });
      }
      const nr = { id: uid(), centreId, ...v };
      u.rooms.push(nr);
      record(ctx, "ROOM_CREATED", `Added ${nr.name} to ${u.centres.find((c) => c.id === centreId)!.name}`);
      return json(201, { id: nr.id, ...v });
    }
  }

  // ---- staffing
  if (method === "GET" && path === "/academic/staffing") {
    const st = staffingFor(u, url.searchParams.get("sessionId"));
    if (!st) return json(200, { session: null, courses: [], centres: [], needLecturer: 0, needCoordinator: 0, studentsImported: false, summary: "Create a session first" });
    const sess = u.sessions.find((s) => s.id === st.id)!;
    const courses = [...u.courses].sort((a, b) => a.code.localeCompare(b.code)).map((c) => staffingCourseRow(u, st.id, c));
    const centres = u.centres.map((c) => staffingCentreRow(u, st.id, c.id));
    const needLecturer = courses.filter((c) => c.needsLecturer).length;
    return json(200, {
      session: { id: sess.id, name: sess.name },
      courses,
      centres,
      needLecturer,
      needCoordinator: centres.filter((c) => c.needsCoordinator).length,
      studentsImported: u.students.length > 0,
      summary: needLecturer ? `${needLecturer} course${needLecturer === 1 ? "" : "s"} still need a lecturer` : `All ${courses.length} courses have a lecturer`,
    });
  }
  if (method === "PUT" && (m = path.match(/^\/academic\/staffing\/courses\/([^/]+)$/))) {
    const c = u.courses.find((x) => x.id === m![1]);
    if (!c) return notFound("that course");
    const b = await body<{ sessionId?: string | null; lecturerId?: string | null; facilitators?: { centreId: string; userId: string }[]; examOfficerId?: string | null }>(ctx.req);
    const st = staffingFor(u, b.sessionId);
    if (!st) return err(409, "no_session", "Create a session first.");
    const fields: Record<string, string> = {};
    checkPick(u, b.lecturerId, "LECTURER", "Lecturer", "lecturerId", fields);
    checkPick(u, b.examOfficerId, "EXAM_OFFICER", "Exam officer", "examOfficerId", fields);
    const facs = (b.facilitators ?? []).filter((f) => f.userId);
    const seen = new Set<string>();
    facs.forEach((f, i) => {
      if (seen.has(f.centreId)) fields[`facilitators[${i}].userId`] = "One facilitator per centre.";
      seen.add(f.centreId);
      if (!u.centres.some((x) => x.id === f.centreId)) fields[`facilitators[${i}].centreId`] = "Choose a centre.";
      checkPick(u, f.userId, "FACILITATOR", "Facilitator", `facilitators[${i}].userId`, fields);
    });
    if (Object.keys(fields).length) return invalid(fields);
    st.s.courses[c.id] = { lecturerId: b.lecturerId ?? null, facilitators: facs, examOfficerId: b.examOfficerId ?? null };
    record(ctx, "STAFFING_UPDATED", `Updated who teaches ${c.code}`);
    return json(200, staffingCourseRow(u, st.id, c));
  }
  if (method === "PUT" && (m = path.match(/^\/academic\/staffing\/centres\/([^/]+)$/))) {
    const c = u.centres.find((x) => x.id === m![1]);
    if (!c) return notFound("that centre");
    const b = await body<{ sessionId?: string | null; coordinatorId?: string | null }>(ctx.req);
    const st = staffingFor(u, b.sessionId);
    if (!st) return err(409, "no_session", "Create a session first.");
    const fields: Record<string, string> = {};
    checkPick(u, b.coordinatorId, "CENTRE_COORDINATOR", "Centre coordinator", "coordinatorId", fields);
    if (Object.keys(fields).length) return invalid(fields);
    st.s.centres[c.id] = b.coordinatorId ?? null;
    record(ctx, "STAFFING_UPDATED", `Updated the coordinator of ${c.name}`);
    return json(200, staffingCentreRow(u, st.id, c.id));
  }
  if (method === "POST" && path === "/academic/staffing/copy") {
    const b = await body<{ toSessionId?: string | null; fromSessionId?: string | null }>(ctx.req);
    const to = staffingFor(u, b.toSessionId);
    const toS = to ? u.sessions.find((s) => s.id === to.id)! : null;
    const sorted = [...u.sessions].sort((a, z) => a.name.localeCompare(z.name));
    const from = b.fromSessionId ? u.sessions.find((s) => s.id === b.fromSessionId) : toS ? sorted[sorted.indexOf(toS) - 1] : undefined;
    if (!to || !toS || !from) return err(409, "no_previous_session", "There is no earlier session to copy from.");
    const src = u.staffing[from.id] ?? { courses: {}, centres: {} };
    let copied = 0;
    const skipped: { what: string; reason: string }[] = [];
    const ok = (id: string | null, what: string) => {
      const p = u.people.find((x) => x.id === id);
      if (p?.status === "SUSPENDED") {
        skipped.push({ what, reason: `${p.fullName} is suspended` });
        return false;
      }
      return !!p;
    };
    for (const [cid, cs] of Object.entries(src.courses)) {
      const course = u.courses.find((c) => c.id === cid);
      if (!course) continue;
      const dst = (to.s.courses[cid] ??= { lecturerId: null, facilitators: [], examOfficerId: null });
      if (!dst.lecturerId && cs.lecturerId && ok(cs.lecturerId, `${course.code} · lecturer`)) {
        dst.lecturerId = cs.lecturerId;
        copied++;
      }
      if (!dst.examOfficerId && cs.examOfficerId && ok(cs.examOfficerId, `${course.code} · exam officer`)) {
        dst.examOfficerId = cs.examOfficerId;
        copied++;
      }
      for (const f of cs.facilitators) {
        const cn = u.centres.find((c) => c.id === f.centreId)?.shortName ?? "";
        if (!dst.facilitators.some((x) => x.centreId === f.centreId) && ok(f.userId, `${course.code} · facilitator for ${cn}`)) {
          dst.facilitators.push({ ...f });
          copied++;
        }
      }
    }
    for (const [cid, uidv] of Object.entries(src.centres)) {
      const centre = u.centres.find((c) => c.id === cid);
      if (centre && uidv && !to.s.centres[cid] && ok(uidv, `${centre.name} · coordinator`)) {
        to.s.centres[cid] = uidv;
        copied++;
      }
    }
    record(ctx, "STAFFING_COPIED", `Copied ${copied} staffing places from ${from.name} to ${toS.name}`);
    return json(200, { copied, skipped, from: from.name, to: toS.name });
  }
  if (method === "GET" && path === "/academic/staff-options") {
    const r = url.searchParams.get("role") ?? "";
    const dep = url.searchParams.get("departmentId");
    const items = u.people
      .filter((p) => p.status !== "SUSPENDED" && p.roles.some((x) => x.role === r))
      .map((p) => {
        const ro = p.roles.find((x) => x.role === r)!;
        const scopeLabel = ro.scopeType === "DEPARTMENT" ? u.departments.find((d) => d.id === ro.scopeId)?.name ?? null : ro.scopeType === "CENTRE" ? u.centres.find((c) => c.id === ro.scopeId)?.name ?? null : null;
        return { id: p.id, fullName: p.fullName, email: p.email, status: p.status, scopeLabel, first: dep && ro.scopeId === dep ? 0 : 1 };
      })
      .sort((a, b) => a.first - b.first || a.fullName.localeCompare(b.fullName))
      .map(({ first: _f, ...x }) => (void _f, x));
    return json(200, { items });
  }

  // ---- grading
  if (method === "GET" && path === "/academic/grading") {
    const pid = url.searchParams.get("programmeId");
    if (pid && !u.programmes.some((p) => p.id === pid)) return notFound("that programme");
    return json(200, rulesView(u, pid || null));
  }
  if (method === "GET" && path === "/academic/grading/history") {
    const pid = url.searchParams.get("programmeId") || null;
    const items = u.grading.history
      .filter((h) => h.programmeId === pid)
      .map((h) => ({
        version: h.rules.version,
        effectiveSession: (() => {
          const s = u.sessions.find((x) => x.id === h.rules.effectiveSessionId);
          return s ? { id: s.id, name: s.name } : null;
        })(),
        savedAt: h.rules.savedAt,
        savedBy: { fullName: h.rules.savedBy ?? "" },
        caWeight: h.rules.caWeight,
        examWeight: h.rules.examWeight,
        passMark: h.rules.passMark,
        summary: `${h.rules.scale}-point scale (${h.rules.caWeight}% CA / ${h.rules.examWeight}% exam)`,
      }))
      .reverse();
    return json(200, { items });
  }
  if (path === "/academic/grading" || (m = path.match(/^\/academic\/grading\/programmes\/([^/]+)$/))) {
    const pid = path === "/academic/grading" ? null : m![1];
    if (pid && !u.programmes.some((p) => p.id === pid)) return notFound("that programme");
    if (method === "DELETE" && pid) {
      delete u.grading.programmes[pid];
      record(ctx, "GRADING_RESET", `${u.programmes.find((p) => p.id === pid)!.name} follows the default grading rules again`);
      return noContent();
    }
    if (method === "PUT") {
      const b = await body<Partial<MRules> & { effectiveSessionId?: string | null }>(ctx.req);
      const f = checkBands(b);
      if (Object.keys(f).length) return invalid(f);
      const prev = pid ? u.grading.programmes[pid] ?? u.grading.default : u.grading.default;
      const next: MRules = {
        ...defaultRules(),
        version: pid ? (u.grading.programmes[pid]?.version ?? 0) + 1 : prev.version + (prev.saved ? 1 : 0),
        saved: true,
        savedAt: new Date().toISOString(),
        savedBy: ctx.staff.fullName,
        effectiveSessionId: b.effectiveSessionId ?? currentSession(u)?.id ?? null,
        caWeight: Number(b.caWeight),
        examWeight: Number(b.examWeight),
        passMark: Number(b.passMark),
        scale: Number(b.scale) || 5,
        roundTotals: !!b.roundTotals,
        bands: (b.bands ?? []).map((x) => ({ ...x, grade: x.grade.trim().toUpperCase() })).sort((x, y) => y.from - x.from),
        standing: b.standing ?? prev.standing,
      };
      if (pid) u.grading.programmes[pid] = next;
      else u.grading.default = next;
      u.grading.history.push({ programmeId: pid, rules: next });
      record(ctx, "GRADING_SAVED", `Saved ${pid ? `${u.programmes.find((p) => p.id === pid)!.name}'s own` : "the default"} grading rules (version ${next.version})`);
      return json(200, rulesView(u, pid));
    }
  }

  return null;
}

function activate(u: Uni, s: MSession) {
  u.sessions.forEach((x) => {
    if (x.status === "ACTIVE" && x.id !== s.id) x.status = "ARCHIVED";
  });
  s.status = "ACTIVE";
}

export { structure as structureOf };
