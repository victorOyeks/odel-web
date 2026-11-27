// Mock of api-b1-students.md: import, students list and record, welcome emails, student accounts.
import type { StudentImportProblem, StudentStatus } from "@/lib/types-b1";
import { currentSession } from "./b1-academic";
import { DEFAULT_WELCOME, type MStudent, type Uni } from "./b1-data";
import { body, csvResponse, err, forbidden, initialsOf, invalid, json, noContent, notFound, page, parseCsv, readUpload, record, signedOut, uid, uploadTicket, type B1Ctx } from "./b1-util";

const STATUS_LABEL: Record<StudentStatus, string> = { IMPORTED: "Not activated", INVITED: "Not activated", ACTIVE: "Active", SUSPENDED: "Suspended" };
const RULES = {
  minLength: 8,
  hint: "At least 8 characters, with a letter and a number.",
  rules: [
    { key: "length", label: "At least 8 characters" },
    { key: "letter", label: "At least one letter" },
    { key: "number", label: "At least one number" },
  ],
};
const NOTICE_VERSION = "2026-11";
const CODE_TTL = 15 * 60_000;

const fullName = (s: MStudent) => [s.firstName, s.otherNames, s.surname].filter(Boolean).join(" ");
const programmeOf = (u: Uni, code: string) => u.programmes.find((p) => p.code.toUpperCase() === code.toUpperCase());
const centreOf = (u: Uni, code: string) => u.centres.find((c) => c.code.toUpperCase() === code.toUpperCase());
const progRef = (u: Uni, code: string) => ({ code, name: programmeOf(u, code)?.name ?? code });
const centreRef = (u: Uni, code: string) => {
  const c = centreOf(u, code);
  return { code, name: c?.name ?? code, shortName: c?.shortName ?? null };
};
const levelsOf = (u: Uni, code: string) => {
  const p = programmeOf(u, code);
  return p ? Array.from({ length: p.durationYears }, (_, i) => (i + 1) * 100) : [];
};
const maskEmail = (e: string) => {
  const [a, d] = e.split("@");
  return `${a[0]}•••••@${d}`;
};

function row(u: Uni, s: MStudent) {
  return {
    id: s.id,
    matricNumber: s.matricNumber,
    fullName: fullName(s),
    programme: progRef(u, s.programmeCode),
    level: s.level,
    levelLabel: `${s.level}L`,
    centre: centreRef(u, s.centreCode),
    email: s.email,
    status: s.status,
    statusLabel: STATUS_LABEL[s.status],
  };
}

function recordOf(u: Uni, s: MStudent) {
  return {
    ...row(u, s),
    surname: s.surname,
    firstName: s.firstName,
    otherNames: s.otherNames,
    phone: s.phone,
    gender: s.gender,
    dateOfBirth: s.dateOfBirth,
    entrySession: s.entrySession,
    account: {
      welcomeSentAt: s.welcomeSentAt,
      activatedAt: s.activatedAt,
      consent: s.consent,
      lastSignInAt: s.lastSignInAt,
      lockedUntil: s.lockedUntil && s.lockedUntil > Date.now() ? new Date(s.lockedUntil).toISOString() : null,
    },
    history: [...s.history].reverse(),
    createdAt: s.createdAt,
    importedFrom: s.importedFrom,
  };
}

function setStatus(s: MStudent, to: StudentStatus, reason: string, by: string | null) {
  s.history.push({ at: new Date().toISOString(), from: s.status, to, reason, by: by ? { fullName: by } : null });
  s.status = to;
}

// ---------------------------------------------------------------- import

const COLS: Record<string, string[]> = {
  matric_number: ["matric_number", "matric", "matric_no", "matricnumber"],
  surname: ["surname", "last_name"],
  first_name: ["first_name", "firstname"],
  other_names: ["other_names", "middle_name"],
  programme_code: ["programme_code", "programme", "program_code"],
  level: ["level"],
  study_centre: ["study_centre", "centre", "study_center", "center"],
  email: ["email", "email_address"],
  phone: ["phone", "phone_number"],
  gender: ["gender", "sex"],
  date_of_birth: ["date_of_birth", "dob"],
  entry_session: ["entry_session"],
};
const REQUIRED = ["matric_number", "surname", "first_name", "programme_code", "level", "study_centre"];

interface Draft {
  importId: string;
  fileName: string;
  status: "CHECKED" | "IMPORTED";
  totalRows: number;
  checkedAt: string;
  problems: StudentImportProblem[];
  ready: Record<string, string>[];
  counts: { new: number; updated: number; unchanged: number; errors: number; warnings: number };
}

function validate(u: Uni, fileName: string, text: string): Response | Draft {
  if (/\.xlsx?$/i.test(fileName)) return err(400, "not_csv", "Save it as CSV (File → Save as → CSV UTF-8) and upload it again.");
  const rows = parseCsv(text);
  if (!rows.length) return err(400, "empty_file", "The file has no rows under the header.");
  const norm = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const header = rows[0].map(norm);
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) idx[k] = i;
  }
  if (!Object.keys(idx).length) return err(400, "no_header", "The first row must be the column names. Download the template to see them.");
  const missing = REQUIRED.filter((k) => idx[k] === undefined);
  if (missing.length) return err(400, "missing_columns", `The file is missing ${missing.join(", ")}. Download the template to see the columns.`, { fields: Object.fromEntries(missing.map((k) => [k, `Add a ${k} column.`])) });
  if (rows.length < 2) return err(400, "empty_file", "The file has no rows under the header.");
  if (rows.length - 1 > 20000) return err(400, "too_many_rows", "The file has more than 20,000 rows. Split it into smaller files.");

  const data = rows.slice(1).map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, (r[i] ?? "").trim()])));
  const problems: StudentImportProblem[] = [];
  const ready: Record<string, string>[] = [];
  const matricRows = new Map<string, number[]>();
  const emailRows = new Map<string, number[]>();
  data.forEach((r, i) => {
    const m = (r.matric_number ?? "").toUpperCase().replace(/\s+/g, "");
    if (m) matricRows.set(m, [...(matricRows.get(m) ?? []), i + 2]);
    const e = (r.email ?? "").toLowerCase();
    if (e) emailRows.set(e, [...(emailRows.get(e) ?? []), i + 2]);
  });
  const counts = { new: 0, updated: 0, unchanged: 0, errors: 0, warnings: 0 };
  data.forEach((r, i) => {
    const rowNo = i + 2;
    const matric = (r.matric_number ?? "").toUpperCase().replace(/\s+/g, "");
    const name = [r.first_name, r.surname].filter(Boolean).join(" ") || null;
    const errors: StudentImportProblem[] = [];
    const warnings: StudentImportProblem[] = [];
    const add = (list: StudentImportProblem[], severity: "ERROR" | "WARNING", field: string, message: string) =>
      list.push({ row: rowNo, matricNumber: matric || null, name, severity, field, message });
    if (!matric) add(errors, "ERROR", "matric_number", "Matric number is missing");
    else if ((matricRows.get(matric) ?? []).length > 1) {
      const rs = matricRows.get(matric)!;
      add(errors, "ERROR", "matric_number", `Matric number appears twice in this file (rows ${rs[0].toLocaleString("en-NG")} and ${rs[1].toLocaleString("en-NG")})`);
    }
    if (!r.surname) add(errors, "ERROR", "surname", "Surname is missing");
    if (!r.first_name) add(errors, "ERROR", "first_name", "First name is missing");
    const prog = programmeOf(u, r.programme_code ?? "");
    if (!prog) {
      const guess = u.programmes.find((p) => p.code.toUpperCase().includes((r.programme_code ?? "").toUpperCase()) && r.programme_code);
      add(errors, "ERROR", "programme_code", `Programme code "${r.programme_code}" unknown.${guess ? ` Expected "${guess.code}"` : " Check it on Academic structure."}`);
    }
    const level = Number((r.level ?? "").replace(/^level\s*/i, "").replace(/L$/i, ""));
    if (!level) add(errors, "ERROR", "level", "Level is missing");
    else if (prog && !levelsOf(u, prog.code).includes(level)) add(errors, "ERROR", "level", `${prog.name} has no ${level}L`);
    const cv = (r.study_centre ?? "").toLowerCase();
    const centre = u.centres.find((c) => [c.code, c.name, c.shortName].some((x) => x.toLowerCase() === cv));
    if (!centre) {
      const guess = u.centres.find((c) => cv && (c.name.toLowerCase().includes(cv) || c.shortName.toLowerCase().includes(cv)));
      add(errors, "ERROR", "study_centre", `Study centre "${r.study_centre}" not found.${guess ? ` Did you mean "${guess.shortName}"?` : " Use the centre's code from Centres."}`);
    }
    const email = (r.email ?? "").toLowerCase();
    const existing = u.students.find((s) => s.matricNumber === matric);
    if (!email) add(warnings, "WARNING", "email", "No email: no welcome email or code until it is added");
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) add(errors, "ERROR", "email", `Email "${r.email}" is not a valid address`);
    else if ((emailRows.get(email) ?? []).length > 1) add(errors, "ERROR", "email", `Email ${email} is used twice in this file`);
    else if (u.students.some((s) => s.email?.toLowerCase() === email && s.matricNumber !== matric)) add(errors, "ERROR", "email", `Email ${email} is already used by another student`);
    else if (existing && existing.status === "ACTIVE" && existing.email?.toLowerCase() !== email) add(warnings, "WARNING", "email", "Email not changed: the student has already activated");
    const phone = (r.phone ?? "").replace(/[\s-]/g, "");
    if (phone && !/^(0\d{10}|\+234\d{10})$/.test(phone)) add(warnings, "WARNING", "phone", `Phone "${r.phone}" is not 11 digits; it is left blank`);
    if (matric && !/^[A-Z]{2,4}\/[A-Z]{2,4}\/\d{2}\/\d{3,5}$/.test(matric)) add(warnings, "WARNING", "matric_number", "Matric number is shaped unlike the others; check it");
    problems.push(...errors, ...warnings);
    if (errors.length) {
      counts.errors++;
      return;
    }
    if (warnings.length) counts.warnings++;
    if (!existing) counts.new++;
    else if (existing.surname === r.surname && existing.firstName === r.first_name && existing.programmeCode === prog!.code && existing.level === level && existing.centreCode === centre!.code) counts.unchanged++;
    else counts.updated++;
    ready.push({ ...r, matric_number: matric, programme_code: prog!.code, level: String(level), study_centre: centre!.code, email, phone: /^(0\d{10}|\+234\d{10})$/.test(phone) ? r.phone : "" });
  });
  problems.sort((a, b) => (a.severity === b.severity ? a.row - b.row : a.severity === "ERROR" ? -1 : 1));
  const d: Draft = { importId: uid(), fileName, status: "CHECKED", totalRows: data.length, checkedAt: new Date().toISOString(), problems, ready, counts };
  u.imports.set(d.importId, d);
  return d;
}

const report = (d: Draft) => ({
  importId: d.importId,
  fileName: d.fileName,
  status: d.status,
  totalRows: d.totalRows,
  ready: { count: d.ready.length, new: d.counts.new, updated: d.counts.updated, unchanged: d.counts.unchanged },
  errors: { count: d.counts.errors },
  warnings: { count: d.counts.warnings },
  problems: d.problems.slice(0, 50),
  problemsShown: Math.min(50, d.problems.length),
  checkedAt: d.checkedAt,
});

// ---------------------------------------------------------------- welcome

const FIELDS = [
  { key: "first_name", label: "First name", example: "Adeola" },
  { key: "surname", label: "Surname", example: "Okafor" },
  { key: "full_name", label: "Full name", example: "Adeola Okafor" },
  { key: "matric", label: "Matric number", example: "WU/ODL/24/0153" },
  { key: "programme", label: "Programme", example: "B.Sc. Computer Science" },
  { key: "level", label: "Level", example: "200L" },
  { key: "centre_name", label: "Study centre", example: "Akure Study Centre" },
  { key: "centre_phone", label: "Centre phone", example: "0803 555 0117" },
  { key: "session", label: "Session", example: "2026/2027" },
  { key: "activation_link", label: "Activation link", example: "https://wesley.odel.ng/activate?matric=WU%2FODL%2F24%2F0153" },
  { key: "university_name", label: "University name", example: "Wesley University" },
];

function fill(text: string, vars: Record<string, string>) {
  return text.replace(/\{([a-z_]+)\}/g, (all, k: string) => (k in vars ? vars[k] : all));
}

function checkTemplate(subject: string, bodyText: string): Record<string, string> {
  const f: Record<string, string> = {};
  const known = new Set(FIELDS.map((x) => x.key));
  const bad = [...`${subject} ${bodyText}`.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).find((k) => !known.has(k));
  if (!subject.trim()) f.subject = "Write a subject.";
  if (bad !== undefined) f.body = `Unknown field {${bad}}. Use one of the fields below.`;
  else if (!bodyText.includes("{activation_link}")) f.body = "Add {activation_link} so students can activate.";
  return f;
}

function sendView(u: Uni, s: Uni["sends"][number]) {
  const elapsed = Date.now() - s.startedAt;
  const progress = Math.min(1, elapsed / 4000);
  const deliverable = s.toSend.filter((id) => !s.failed[id]);
  const sent = Math.floor(deliverable.length * progress);
  const failed = progress >= 1 ? Object.keys(s.failed).length : 0;
  const done = progress >= 1;
  return {
    id: s.id,
    status: done ? "DONE" : "RUNNING",
    startedAt: new Date(s.startedAt).toISOString(),
    finishedAt: done ? new Date(s.startedAt + 4000).toISOString() : null,
    remindAfterDays: s.remindAfterDays,
    reminderDueAt: s.remindAfterDays ? new Date(s.startedAt + s.remindAfterDays * 86400_000).toISOString() : null,
    totals: {
      students: s.students,
      toSend: s.toSend.length,
      sent,
      failed,
      sending: s.toSend.length - sent - failed,
      skippedNoEmail: s.skippedNoEmail.length,
      skippedTestAddress: 0,
      skippedActive: s.skippedActive.length,
    },
    progressPercent: s.toSend.length ? Math.round(((sent + failed) / s.toSend.length) * 100) : 100,
  };
}

function deliveries(u: Uni, s: Uni["sends"][number]) {
  const v = sendView(u, s);
  const done = v.status === "DONE";
  const at = v.finishedAt ?? new Date().toISOString();
  const out: { studentId: string; matricNumber: string; fullName: string; email: string | null; status: string; reason: string | null; updatedAt: string }[] = [];
  const st = (id: string) => u.students.find((x) => x.id === id)!;
  s.toSend.forEach((id, i) => {
    const x = st(id);
    const failed = s.failed[id];
    const status = failed ? (done ? "FAILED" : "SENDING") : i < v.totals.sent ? "SENT" : "SENDING";
    out.push({ studentId: id, matricNumber: x.matricNumber, fullName: fullName(x), email: x.email, status, reason: status === "FAILED" ? failed : null, updatedAt: at });
  });
  s.skippedNoEmail.forEach((id) => {
    const x = st(id);
    out.push({ studentId: id, matricNumber: x.matricNumber, fullName: fullName(x), email: null, status: "SKIPPED_NO_EMAIL", reason: "No email on record", updatedAt: at });
  });
  return out;
}

function overview(ctx: B1Ctx) {
  const u = ctx.uni;
  const notAct = u.students.filter((s) => s.status === "IMPORTED" || s.status === "INVITED");
  const sample = u.students[0];
  const vars = varsFor(ctx, sample);
  const last = u.sends[u.sends.length - 1];
  return {
    template: { subject: u.welcome.subject, body: u.welcome.body, custom: u.welcome.custom, updatedAt: u.welcome.updatedAt, updatedBy: u.welcome.updatedBy },
    fields: FIELDS,
    preview: { studentName: sample ? fullName(sample) : "Adeola Okafor", subject: fill(u.welcome.subject, vars), body: fill(u.welcome.body, vars) },
    audience: {
      notActivated: notAct.length,
      withEmail: notAct.filter((s) => s.email).length,
      noEmail: notAct.filter((s) => !s.email).length,
      alreadyActive: u.students.filter((s) => s.status === "ACTIVE").length,
    },
    lastSend: last ? sendView(u, last) : null,
  };
}

function varsFor(ctx: B1Ctx, s: MStudent | undefined): Record<string, string> {
  const u = ctx.uni;
  if (!s) return Object.fromEntries(FIELDS.map((f) => [f.key, f.example]));
  const c = centreOf(u, s.centreCode);
  return {
    first_name: s.firstName,
    surname: s.surname,
    full_name: fullName(s),
    matric: s.matricNumber,
    programme: programmeOf(u, s.programmeCode)?.name ?? s.programmeCode,
    level: `${s.level}L`,
    centre_name: c?.name ?? "",
    centre_phone: c?.phone ?? "",
    session: currentSession(u)?.name ?? "",
    activation_link: `${ctx.tenant.portalUrl}/activate?matric=${encodeURIComponent(s.matricNumber)}`,
    university_name: ctx.tenant.name,
  };
}

// ---------------------------------------------------------------- student auth helpers

function findLogin(u: Uni, login: string | undefined) {
  const l = (login ?? "").trim();
  if (!l) return null;
  if (l.includes("@")) return u.students.find((s) => s.email?.toLowerCase() === l.toLowerCase()) ?? null;
  const m = l.toUpperCase().replace(/\s+/g, "");
  return u.students.find((s) => s.matricNumber === m) ?? null;
}

const centreBody = (u: Uni, s: MStudent) => {
  const c = centreOf(u, s.centreCode);
  return c ? { name: c.name, phone: c.phone } : null;
};

function sendCode(u: Uni, s: MStudent, kind: "activation" | "reset", reuse: boolean) {
  const now = Date.now();
  const live = [...u.codes.entries()].find(([, c]) => c.studentId === s.id && c.kind === kind && now - c.createdAt < CODE_TTL);
  if (live && (reuse || now < live[1].resendAt)) {
    return { id: live[0], codeSent: false, resendIn: Math.max(0, Math.ceil((live[1].resendAt - now) / 1000)) };
  }
  const hour = (u.sendsThisHour.get(s.id) ?? []).filter((t) => now - t < 3600_000);
  if (hour.length >= 5) return { tooMany: Math.ceil((hour[0] + 3600_000 - now) / 1000) };
  hour.push(now);
  u.sendsThisHour.set(s.id, hour);
  if (live) u.codes.delete(live[0]);
  const id = uid();
  u.codes.set(id, { kind, studentId: s.id, createdAt: now, resendAt: now + 60_000, wrong: 0 });
  return { id, codeSent: true, resendIn: 60 };
}

function codeBody(u: Uni, s: MStudent, kind: "activation" | "reset", r: { id: string; codeSent: boolean; resendIn: number }) {
  return {
    [kind === "activation" ? "activationId" : "resetId"]: r.id,
    maskedEmail: maskEmail(s.email!),
    codeSent: r.codeSent,
    expiresInSeconds: Math.round(CODE_TTL / 1000),
    resendInSeconds: r.resendIn,
    sendsLeftThisHour: 5 - (u.sendsThisHour.get(s.id) ?? []).filter((t) => Date.now() - t < 3600_000).length,
    student: { firstName: s.firstName },
    centre: centreBody(u, s),
  };
}

function passwordProblem(p: string, c: string): Record<string, string> | null {
  if (p.length < 8) return { password: "Use at least 8 characters." };
  if (p.length > 128) return { password: "Use 128 characters or fewer." };
  if (!/[A-Za-z]/.test(p)) return { password: "Add at least one letter." };
  if (!/\d/.test(p)) return { password: "Add at least one number." };
  if (p !== c) return { confirmPassword: "The two passwords do not match." };
  return null;
}

function suspendedMsg(ctx: B1Ctx) {
  return err(403, "suspended", `Your account is suspended. Please contact the ODeL office at ${ctx.tenant.name} to restore access. Your work is safe.`);
}

async function studentAuth(ctx: B1Ctx): Promise<Response | null> {
  const { path, method, uni: u } = ctx;
  let m: RegExpMatchArray | null;
  if (method === "GET" && path === "/auth/student/password-rules") return json(200, RULES);
  if (method === "GET" && path === "/auth/student/privacy-notice") {
    return json(200, {
      version: NOTICE_VERSION,
      title: "How we use your information",
      intro: `${ctx.tenant.name} protects your data under the Nigeria Data Protection Act 2023.`,
      points: ["Your records are used to run your programme.", "Reminders and codes come by email and in the app.", "Staff see only what they need to support you.", "We never sell your data. Ask for a copy any time."],
    });
  }
  if (method === "POST" && (m = path.match(/^\/auth\/student\/(activation|password-reset)\/start$/))) {
    const kind = m[1] === "activation" ? "activation" : "reset";
    const b = await body<{ login?: string; codeAlreadySent?: boolean }>(ctx.req);
    const s = findLogin(u, b.login);
    if (!s) {
      return kind === "activation"
        ? err(404, "matric_not_found", "We could not find this number. Check it on your admission letter, or contact your study centre.")
        : err(404, "not_found", "We could not find that matric number or email. Check it, or activate your account first.");
    }
    if (s.status === "SUSPENDED") return suspendedMsg(ctx);
    if (kind === "activation" && s.status === "ACTIVE") return err(409, "already_active", "This account is already active. Sign in with your password, or reset it if you have forgotten it.");
    if (kind === "reset" && s.status !== "ACTIVE") return err(409, "not_activated", "This account is not active yet. Activate it first.");
    const c = centreBody(u, s);
    if (!s.email) return err(422, "no_email", `We have no email address for you, so we cannot send a code. The ODeL office at ${c?.name ?? "your study centre"} can add it.`, { centre: c });
    const r = sendCode(u, s, kind, !!b.codeAlreadySent);
    if ("tooMany" in r) return err(429, "too_many_codes", `You have asked for 5 codes in the last hour. Try again in ${Math.ceil(r.tooMany! / 60)} minutes, or contact your study centre.`, { retryInSeconds: r.tooMany });
    if (r.codeSent) record(ctx, kind === "activation" ? "ACTIVATION_CODE_SENT" : "PASSWORD_RESET_CODE_SENT", `Sent a ${kind === "activation" ? "activation" : "password reset"} code to ${s.matricNumber}`, null);
    return json(200, codeBody(u, s, kind, r));
  }
  if (method === "POST" && (m = path.match(/^\/auth\/student\/(activation|password-reset)\/resend$/))) {
    const kind = m[1] === "activation" ? "activation" : "reset";
    const b = await body<{ activationId?: string; resetId?: string }>(ctx.req);
    const c = u.codes.get((kind === "activation" ? b.activationId : b.resetId) ?? "");
    if (!c || Date.now() - c.createdAt > 30 * 60_000) return err(410, "expired", kind === "activation" ? "This took too long. Enter your matric number again." : "This took too long. Start again.");
    if (Date.now() < c.resendAt) return err(429, "resend_too_soon", "Wait a moment before asking for another code.", { retryInSeconds: Math.ceil((c.resendAt - Date.now()) / 1000) });
    const s = u.students.find((x) => x.id === c.studentId)!;
    c.createdAt = 0; // force a fresh code
    const r = sendCode(u, s, kind, false);
    if ("tooMany" in r) return err(429, "too_many_codes", `You have asked for 5 codes in the last hour. Try again in ${Math.ceil(r.tooMany! / 60)} minutes, or contact your study centre.`, { retryInSeconds: r.tooMany });
    return json(200, codeBody(u, s, kind, r));
  }
  if (method === "POST" && (m = path.match(/^\/auth\/student\/(activation|password-reset)\/verify$/))) {
    const kind = m[1] === "activation" ? "activation" : "reset";
    const b = await body<{ activationId?: string; resetId?: string; code?: string }>(ctx.req);
    const id = (kind === "activation" ? b.activationId : b.resetId) ?? "";
    const c = u.codes.get(id);
    if (!c) return err(410, "expired", kind === "activation" ? "This took too long. Enter your matric number again." : "This took too long. Start again.");
    const s = u.students.find((x) => x.id === c.studentId)!;
    const code = String(b.code ?? "");
    // Mock codes: any 6 digits except 000000; 999999 has always expired.
    if (code === "999999" || Date.now() - c.createdAt > CODE_TTL) return err(410, "code_expired", "That code has expired. Send a new one.");
    if (!/^\d{6}$/.test(code) || code === "000000") {
      c.wrong++;
      if (c.wrong >= 3) {
        const r = sendCode(u, s, kind, false);
        if ("tooMany" in r) return err(410, "code_expired", "That code has expired. Send a new one.");
        u.codes.delete(id);
        const nc = u.codes.get(r.id)!;
        u.codes.delete(r.id);
        u.codes.set(id, nc); // keep the same id so the screen keeps working
        return err(400, "new_code_sent", "That code was wrong three times, so we sent you a new one.", { maskedEmail: maskEmail(s.email!), resendInSeconds: 60 });
      }
      const left = 3 - c.wrong;
      return err(400, "wrong_code", `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left before we send a new one.`, { attemptsLeft: left });
    }
    u.codes.delete(id);
    const token = uid();
    u.tokens.set(token, { kind, studentId: s.id, passwordSet: false });
    return json(200, {
      [kind === "activation" ? "activationToken" : "resetToken"]: token,
      expiresInSeconds: 1800,
      student: { firstName: s.firstName, fullName: fullName(s), matricNumber: s.matricNumber },
    });
  }
  if (method === "POST" && (path === "/auth/student/activation/password" || path === "/auth/student/password-reset/complete")) {
    const reset = path.endsWith("complete");
    const b = await body<{ activationToken?: string; resetToken?: string; password?: string; confirmPassword?: string }>(ctx.req);
    const t = u.tokens.get((reset ? b.resetToken : b.activationToken) ?? "");
    if (!t) return err(410, "expired", reset ? "This took too long. Start again." : "This took too long. Enter your matric number again.");
    const p = passwordProblem(b.password ?? "", b.confirmPassword ?? "");
    if (p) return err(400, "weak_password", Object.values(p)[0], { fields: p });
    const s = u.students.find((x) => x.id === t.studentId)!;
    if (!reset) {
      t.passwordSet = true;
      t.password = b.password;
      return noContent();
    }
    s.password = b.password!;
    s.lockedUntil = null;
    s.wrongPasswords = 0;
    s.lastSignInAt = new Date().toISOString();
    u.tokens.delete(b.resetToken!);
    record(ctx, "PASSWORD_RESET", `${fullName(s)} reset their password`, { id: s.userId, fullName: fullName(s), role: "STUDENT", roleLabel: "Student" });
    ctx.endStudentSessions(s.id, false);
    return json(200, ctx.signInStudent(s.id, false));
  }
  if (method === "POST" && path === "/auth/student/activation/complete") {
    const b = await body<{ activationToken?: string; acceptPrivacyNotice?: boolean; privacyNoticeVersion?: string }>(ctx.req);
    const t = u.tokens.get(b.activationToken ?? "");
    if (!t) return err(410, "expired", "This took too long. Enter your matric number again.");
    if (!t.passwordSet) return err(409, "password_missing", "Create your password first.");
    if (!b.acceptPrivacyNotice) return err(400, "consent_required", "Tick the box to accept the privacy notice.", { fields: { acceptPrivacyNotice: "Tick the box to accept the privacy notice." } });
    const s = u.students.find((x) => x.id === t.studentId)!;
    const now = new Date().toISOString();
    s.password = t.password!;
    s.activatedAt = now;
    s.consent = { version: b.privacyNoticeVersion ?? NOTICE_VERSION, at: now };
    s.lastSignInAt = now;
    setStatus(s, "ACTIVE", "Activated the account", fullName(s));
    u.tokens.delete(b.activationToken!);
    record(ctx, "STUDENT_ACTIVATED", `${fullName(s)} (${s.matricNumber}) activated their account and accepted the privacy notice`, { id: s.userId, fullName: fullName(s), role: "STUDENT", roleLabel: "Student" });
    return json(200, ctx.signInStudent(s.id, false));
  }
  if (method === "POST" && path === "/auth/student/sign-in") {
    const b = await body<{ login?: string; password?: string; keepSignedIn?: boolean }>(ctx.req);
    const s = findLogin(u, b.login);
    if (!s) return err(404, "not_found", "We could not find that matric number or email. Check it, or activate your account first.");
    if (s.status === "SUSPENDED") return suspendedMsg(ctx);
    if (s.status !== "ACTIVE") return err(409, "not_activated", "You have not activated your account yet. Choose First time here? Activate your account.");
    if (s.lockedUntil && s.lockedUntil > Date.now()) {
      const left = Math.ceil((s.lockedUntil - Date.now()) / 1000);
      return err(423, "locked", "Too many attempts. Sign-in is paused for 15 minutes. You can reset your password now instead.", { retryAt: new Date(s.lockedUntil).toISOString(), retryInSeconds: left });
    }
    const actor = { id: s.userId, fullName: fullName(s), role: "STUDENT", roleLabel: "Student" };
    if (b.password !== s.password) {
      s.wrongPasswords++;
      record(ctx, "SIGN_IN_FAILED", `Wrong password for ${s.matricNumber}`, actor);
      if (s.wrongPasswords >= 5) {
        s.wrongPasswords = 0;
        s.lockedUntil = Date.now() + 15 * 60_000;
        record(ctx, "ACCOUNT_LOCKED", `Sign-in paused for 15 minutes for ${s.matricNumber}`, actor);
        return err(423, "locked", "Too many attempts. Sign-in is paused for 15 minutes. You can reset your password now instead.", { retryAt: new Date(s.lockedUntil).toISOString(), retryInSeconds: 900 });
      }
      const left = 5 - s.wrongPasswords;
      return err(401, "wrong_password", `Wrong password. ${left} ${left === 1 ? "try" : "tries"} left before sign-in pauses for 15 minutes.`, { attemptsLeft: left });
    }
    s.wrongPasswords = 0;
    s.lastSignInAt = new Date().toISOString();
    record(ctx, "SIGN_IN", `${fullName(s)} signed in with their password`, actor);
    return json(200, ctx.signInStudent(s.id, !!b.keepSignedIn));
  }
  if (path === "/student-profile") {
    const s = u.students.find((x) => x.id === ctx.studentId);
    if (!s) return ctx.staff ? forbidden() : signedOut();
    if (method === "PATCH") {
      const b = await body<{ phone?: string }>(ctx.req);
      const phone = (b.phone ?? "").replace(/[\s-]/g, "");
      if (phone && !/^(0\d{10}|\+234\d{10})$/.test(phone)) return invalid({ phone: "Write a Nigerian number like 0803 123 4567." });
      s.phone = b.phone?.trim() || null;
    }
    return json(200, {
      id: s.id,
      matricNumber: s.matricNumber,
      fullName: fullName(s),
      firstName: s.firstName,
      initials: initialsOf(fullName(s)),
      programme: { code: s.programmeCode, name: programmeOf(u, s.programmeCode)?.name ?? s.programmeCode },
      level: s.level,
      levelLabel: `${s.level}L`,
      centre: { code: s.centreCode, name: centreOf(u, s.centreCode)?.name ?? s.centreCode },
      email: s.email,
      phone: s.phone,
      status: s.status,
      consent: s.consent,
    });
  }
  return null;
}

// ---------------------------------------------------------------- the router

export async function studentsRoute(ctx: B1Ctx): Promise<Response | null> {
  const { path, method, url, uni: u } = ctx;
  if (path.startsWith("/auth/student/") || path === "/student-profile") return studentAuth(ctx);
  if (!(path === "/students" || path.startsWith("/students/") || path.startsWith("/imports/"))) return null;
  if (!ctx.staff) return signedOut();
  const role = ctx.staff.role;
  if (method === "GET" ? !(role === "ODEL_ADMIN" || role === "ODEL_DIRECTOR") : role !== "ODEL_ADMIN") return forbidden();
  const actor = ctx.staff.fullName;
  let m: RegExpMatchArray | null;

  // ---- import
  if (method === "GET" && path === "/imports/students/template.csv") {
    return csvResponse("students-template.csv", [
      ["matric_number", "surname", "first_name", "other_names", "programme_code", "level", "study_centre", "email", "phone", "gender", "date_of_birth", "entry_session"],
      ["WU/ODL/24/0153", "Okafor", "Adeola", "", "BSC-CSC-ODL", "200", "AKR", "adeola.okafor@gmail.com", "0803 412 4417", "F", "2002-04-17", "2024/2025"],
    ]);
  }
  if (method === "POST" && path === "/imports/students/uploads") {
    const b = await body<{ fileName?: string; contentType?: string; size?: number }>(ctx.req);
    if (/\.xlsx?$/i.test(b.fileName ?? "")) return invalid({ file: "Save it as CSV (File → Save as → CSV UTF-8) and upload it again." });
    if (!/\.csv$/i.test(b.fileName ?? "")) return invalid({ file: "Upload a CSV file." });
    if ((b.size ?? 0) > 10 * 1024 * 1024) return invalid({ file: "The file must be 10 MB or smaller." });
    return json(200, uploadTicket(b.fileName!, b.contentType ?? "text/csv"));
  }
  if (method === "POST" && path === "/imports/students/validate") {
    const b = await body<{ key?: string; fileName?: string }>(ctx.req);
    const text = readUpload(ctx, b.key ?? "");
    if (text === null) return err(400, "file_missing", "We could not find the uploaded file. Upload it again.");
    const d = validate(u, b.fileName ?? "file.csv", text);
    return d instanceof Response ? d : json(200, report(d));
  }
  if (method === "GET" && path === "/imports/students") {
    return json(200, page(u.importHistory, url, 20));
  }
  if ((m = path.match(/^\/imports\/students\/([^/]+)(\/problems|\/problems\.csv|\/confirm)?$/))) {
    const d = u.imports.get(m[1]) as Draft | undefined;
    if (!d || !("importId" in d)) {
      if (m[2] === "/problems.csv" && u.importHistory.some((h) => h.id === m![1])) return csvResponse("problem-rows.csv", [["row", "problem", "type"]]);
      return notFound("that import");
    }
    if (method === "GET" && !m[2]) return json(200, report(d));
    if (method === "GET" && m[2] === "/problems") {
      const sev = url.searchParams.get("severity");
      return json(200, page(d.problems.filter((p) => !sev || p.severity === sev), url, 50));
    }
    if (method === "GET" && m[2] === "/problems.csv") {
      return csvResponse("problem-rows.csv", [["row", "matric_number", "name", "problem", "type"], ...d.problems.map((p) => [p.row, p.matricNumber, p.name, p.message, p.severity === "ERROR" ? "error" : "warning"])]);
    }
    if (method === "POST" && m[2] === "/confirm") {
      if (d.status === "IMPORTED") return err(409, "already_imported", "This file has already been imported.");
      if (Date.now() - Date.parse(d.checkedAt) > 24 * 3600_000) return err(410, "expired", "Check the file again.");
      const now = new Date().toISOString();
      let added = 0;
      let updated = 0;
      let unchanged = 0;
      for (const r of d.ready) {
        const ex = u.students.find((s) => s.matricNumber === r.matric_number);
        const v = {
          surname: r.surname,
          firstName: r.first_name,
          otherNames: r.other_names || null,
          programmeCode: r.programme_code,
          level: Number(r.level),
          centreCode: r.study_centre,
        };
        if (ex) {
          const same = ex.surname === v.surname && ex.firstName === v.firstName && ex.programmeCode === v.programmeCode && ex.level === v.level && ex.centreCode === v.centreCode;
          Object.assign(ex, v);
          if (r.phone) ex.phone = r.phone;
          if (ex.status !== "ACTIVE" && r.email) ex.email = r.email;
          if (same) unchanged++;
          else updated++;
          continue;
        }
        const n = u.students.length + 1;
        u.students.push({
          id: uid(),
          userId: uid(),
          matricNumber: r.matric_number,
          ...v,
          email: r.email || null,
          phone: r.phone || null,
          gender: /^(m|f)$/i.test(r.gender ?? "") ? r.gender.toUpperCase() : null,
          dateOfBirth: null,
          entrySession: r.entry_session || currentSession(u)?.name || null,
          status: "IMPORTED",
          beforeSuspend: null,
          welcomeSentAt: null,
          activatedAt: null,
          consent: null,
          lastSignInAt: null,
          lockedUntil: null,
          wrongPasswords: 0,
          password: null,
          history: [{ at: now, from: null, to: "IMPORTED", reason: `Imported from ${d.fileName}`, by: { fullName: actor } }],
          createdAt: now,
          importedFrom: { importId: d.importId, fileName: d.fileName },
        });
        void n;
        added++;
      }
      d.status = "IMPORTED";
      u.importHistory.unshift({ id: d.importId, fileName: d.fileName, importedAt: now, importedBy: { fullName: actor }, totalRows: d.totalRows, added, updated, unchanged, errors: d.counts.errors, warnings: d.counts.warnings });
      record(ctx, "STUDENTS_IMPORTED", `Imported ${d.fileName}: ${added} added, ${updated} updated, ${d.counts.errors} rows skipped`);
      return json(200, { importId: d.importId, status: "IMPORTED", added, updated, unchanged, skipped: d.counts.errors, warnings: d.counts.warnings, importedAt: now, importedBy: { id: ctx.staff.id, fullName: actor } });
    }
  }

  // ---- welcome
  if (path === "/students/welcome" && method === "GET") return json(200, overview(ctx));
  if (path === "/students/welcome/template") {
    if (method === "DELETE") {
      u.welcome = { ...DEFAULT_WELCOME, custom: false, updatedAt: new Date().toISOString(), updatedBy: actor };
      record(ctx, "WELCOME_TEMPLATE_UPDATED", "Put the welcome email back to the default wording");
      return json(200, overview(ctx));
    }
    if (method === "PUT") {
      const b = await body<{ subject?: string; body?: string }>(ctx.req);
      const f = checkTemplate(b.subject ?? "", b.body ?? "");
      if (Object.keys(f).length) return invalid(f);
      u.welcome = { subject: b.subject!, body: b.body!, custom: true, updatedAt: new Date().toISOString(), updatedBy: actor };
      record(ctx, "WELCOME_TEMPLATE_UPDATED", "Changed the welcome email");
      return json(200, overview(ctx));
    }
  }
  if (method === "POST" && path === "/students/welcome/test") {
    const b = await body<{ subject?: string; body?: string }>(ctx.req);
    if (b.subject !== undefined || b.body !== undefined) {
      const f = checkTemplate(b.subject ?? u.welcome.subject, b.body ?? u.welcome.body);
      if (Object.keys(f).length) return invalid(f);
    }
    record(ctx, "WELCOME_TEST_SENT", `Sent a test welcome email to ${ctx.staff.email}`);
    return json(200, { sentTo: ctx.staff.email });
  }
  if (path === "/students/welcome/sends") {
    if (method === "GET") return json(200, page([...u.sends].reverse().map((s) => sendView(u, s)), url, 20));
    if (method === "POST") {
      const running = u.sends.find((s) => sendView(u, s).status === "RUNNING");
      if (running) return err(409, "send_running", "A send is already running. Wait for it to finish.");
      const b = await body<{ remindAfterDays?: number | null }>(ctx.req);
      const notAct = u.students.filter((s) => s.status === "IMPORTED" || s.status === "INVITED");
      const toSend = notAct.filter((s) => s.email);
      const send = {
        id: uid(),
        startedAt: Date.now(),
        remindAfterDays: b.remindAfterDays ?? null,
        toSend: toSend.map((s) => s.id),
        failed: Object.fromEntries(toSend.filter((s) => s.email!.endsWith("bounce.test")).map((s) => [s.id, "Mailbox does not exist"])),
        skippedNoEmail: notAct.filter((s) => !s.email).map((s) => s.id),
        skippedActive: u.students.filter((s) => s.status === "ACTIVE").map((s) => s.id),
        students: u.students.length,
      };
      u.sends.push(send);
      const now = new Date().toISOString();
      toSend.forEach((s) => {
        if (send.failed[s.id]) return;
        s.welcomeSentAt = now;
        if (s.status === "IMPORTED") setStatus(s, "INVITED", "Welcome email sent", actor);
      });
      record(ctx, "WELCOME_SENT", `Sent the welcome email to ${toSend.length} students (${send.skippedNoEmail.length} have no email, ${send.skippedActive.length} already active)`);
      return json(202, sendView(u, send));
    }
  }
  if ((m = path.match(/^\/students\/welcome\/sends\/([^/]+)(\/deliveries|\/failed\.csv)?$/))) {
    const s = u.sends.find((x) => x.id === m![1]);
    if (!s) return notFound("that send");
    if (!m[2]) return json(200, sendView(u, s));
    const all = deliveries(u, s);
    if (m[2] === "/deliveries") {
      const st = url.searchParams.get("status");
      return json(200, page(all.filter((d) => !st || d.status === st || (st === "SKIPPED" && d.status.startsWith("SKIPPED"))), url, 50));
    }
    return csvResponse("welcome-failed.csv", [
      ["matric_number", "name", "email", "status", "reason"],
      ...all.filter((d) => d.status === "FAILED" || d.status.startsWith("SKIPPED")).map((d) => [d.matricNumber, d.fullName, d.email, d.status, d.reason]),
    ]);
  }

  // ---- students
  if (method === "GET" && path === "/students/filters") {
    return json(200, {
      programmes: u.programmes.map((p) => ({ code: p.code, name: p.name, levels: levelsOf(u, p.code) })),
      centres: u.centres.map((c) => ({ code: c.code, name: c.name, shortName: c.shortName })),
      statuses: [
        { key: "NOT_ACTIVATED", label: "Not activated" },
        { key: "ACTIVE", label: "Active" },
        { key: "SUSPENDED", label: "Suspended" },
      ],
    });
  }
  if (method === "GET" && path === "/students") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase().replace(/\s+/g, "");
    const prog = url.searchParams.get("programme");
    const level = Number(url.searchParams.get("level")) || null;
    const centre = url.searchParams.get("centre");
    const status = url.searchParams.get("status");
    const all = u.students
      .filter(
        (s) =>
          (!q || `${fullName(s)}|${s.matricNumber}|${s.email ?? ""}`.toLowerCase().replace(/\s+/g, "").includes(q)) &&
          (!prog || s.programmeCode.toUpperCase() === prog.toUpperCase()) &&
          (!level || s.level === level) &&
          (!centre || s.centreCode.toUpperCase() === centre.toUpperCase()) &&
          (!status || (status === "NOT_ACTIVATED" ? s.status === "IMPORTED" || s.status === "INVITED" : s.status === status)),
      )
      .sort((a, b) => a.surname.localeCompare(b.surname))
      .map((s) => row(u, s));
    return json(200, page(all, url, 20));
  }
  if (method === "POST" && path === "/students") {
    const b = await body<Record<string, unknown>>(ctx.req);
    const str = (k: string) => String(b[k] ?? "").trim();
    const fields: Record<string, string> = {};
    if (!str("surname")) fields.surname = "Enter the surname.";
    if (!str("firstName")) fields.firstName = "Enter the first name.";
    const matric = str("matricNumber").toUpperCase().replace(/\s+/g, "");
    if (!matric) fields.matricNumber = "Enter the matric number.";
    const prog = programmeOf(u, str("programmeCode"));
    if (!prog) fields.programmeCode = "Choose a programme.";
    const level = Number(b.level);
    if (prog && !levelsOf(u, prog.code).includes(level)) fields.level = "Choose a level the programme offers.";
    if (!centreOf(u, str("centreCode"))) fields.centreCode = "Choose a study centre.";
    const email = str("email").toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = "Enter a valid email, like name@example.com.";
    if (b.sendWelcome && !email) fields.email = "Add an email to send the welcome email, or add the student without sending.";
    const phone = str("phone").replace(/[\s-]/g, "");
    if (phone && !/^(0\d{10}|\+234\d{10})$/.test(phone)) fields.phone = "Write a Nigerian number like 0806 555 0191.";
    if (Object.keys(fields).length) return invalid(fields);
    if (u.students.some((s) => s.matricNumber === matric)) return err(409, "matric_taken", `${matric} is already on the platform. Search for it on Students.`, { fields: { matricNumber: `${matric} is already on the platform.` } });
    if (email && u.students.some((s) => s.email?.toLowerCase() === email)) return err(409, "email_taken", `${email} is already used by another student.`, { fields: { email: `${email} is already used by another student.` } });
    const now = new Date().toISOString();
    const s: MStudent = {
      id: uid(),
      userId: uid(),
      matricNumber: matric,
      surname: str("surname"),
      firstName: str("firstName"),
      otherNames: str("otherNames") || null,
      email: email || null,
      phone: str("phone") || null,
      gender: null,
      dateOfBirth: null,
      programmeCode: prog!.code,
      level,
      centreCode: centreOf(u, str("centreCode"))!.code,
      entrySession: currentSession(u)?.name ?? null,
      status: "IMPORTED",
      beforeSuspend: null,
      welcomeSentAt: null,
      activatedAt: null,
      consent: null,
      lastSignInAt: null,
      lockedUntil: null,
      wrongPasswords: 0,
      password: null,
      history: [{ at: now, from: null, to: "IMPORTED", reason: "Added by the ODeL office", by: { fullName: actor } }],
      createdAt: now,
      importedFrom: null,
    };
    u.students.push(s);
    if (b.sendWelcome) {
      s.welcomeSentAt = now;
      setStatus(s, "INVITED", "Welcome email sent", actor);
    }
    record(ctx, "STUDENT_ADDED", `Added ${fullName(s)} (${matric})${b.sendWelcome ? " and sent the welcome email" : ""}`);
    return json(201, recordOf(u, s));
  }
  if ((m = path.match(/^\/students\/([^/]+)(\/[a-z-]+)?$/))) {
    const s = u.students.find((x) => x.id === m![1]);
    if (!s) return notFound("that student");
    const action = m[2] ?? "";
    if (method === "GET" && !action) return json(200, recordOf(u, s));
    if (method === "PATCH" && !action) {
      const b = await body<Record<string, unknown>>(ctx.req);
      const fields: Record<string, string> = {};
      const has = (k: string) => b[k] !== undefined;
      const str = (k: string) => String(b[k] ?? "").trim();
      if (has("surname") && !str("surname")) fields.surname = "Enter the surname.";
      if (has("firstName") && !str("firstName")) fields.firstName = "Enter the first name.";
      if (has("matricNumber") && !str("matricNumber")) fields.matricNumber = "Enter the matric number.";
      if (has("email") && str("email") && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str("email"))) fields.email = "Enter a valid email, like name@example.com.";
      if (has("phone") && str("phone") && !/^(0\d{10}|\+234\d{10})$/.test(str("phone").replace(/[\s-]/g, ""))) fields.phone = "Write a Nigerian number like 0803 412 4417.";
      const prog = has("programmeCode") ? programmeOf(u, str("programmeCode")) : programmeOf(u, s.programmeCode);
      if (has("programmeCode") && !prog) fields.programmeCode = "Choose a programme.";
      if ((has("level") || has("programmeCode")) && prog && !levelsOf(u, prog.code).includes(Number(b.level ?? s.level))) fields.level = "Choose a level the programme offers.";
      if (has("centreCode") && !centreOf(u, str("centreCode"))) fields.centreCode = "Choose a study centre.";
      if (Object.keys(fields).length) return invalid(fields);
      const matric = has("matricNumber") ? str("matricNumber").toUpperCase().replace(/\s+/g, "") : s.matricNumber;
      if (u.students.some((x) => x !== s && x.matricNumber === matric)) return err(409, "matric_taken", `${matric} is already used by another student.`, { fields: { matricNumber: `${matric} is already used by another student.` } });
      const email = has("email") ? str("email").toLowerCase() : s.email;
      if (email && u.students.some((x) => x !== s && x.email?.toLowerCase() === email)) return err(409, "email_taken", `${email} is already used by another student.`, { fields: { email: `${email} is already used by another student.` } });
      const centreBefore = s.centreCode;
      Object.assign(s, {
        surname: has("surname") ? str("surname") : s.surname,
        firstName: has("firstName") ? str("firstName") : s.firstName,
        otherNames: has("otherNames") ? str("otherNames") || null : s.otherNames,
        matricNumber: matric,
        email: email || null,
        phone: has("phone") ? str("phone") || null : s.phone,
        programmeCode: prog?.code ?? s.programmeCode,
        level: Number(b.level ?? s.level),
        centreCode: has("centreCode") ? centreOf(u, str("centreCode"))!.code : s.centreCode,
      });
      if (centreBefore !== s.centreCode) record(ctx, "STUDENT_CENTRE_CHANGED", `Moved ${fullName(s)} from ${centreBefore} to ${s.centreCode}`);
      record(ctx, "STUDENT_UPDATED", `Changed ${fullName(s)}'s record`);
      return json(200, recordOf(u, s));
    }
    if (method === "POST" && action === "/resend-activation") {
      if (s.status === "ACTIVE") return err(409, "already_active", `${fullName(s)} has already activated.`);
      if (!s.email) return err(422, "no_email", "There is no email on this record. Add one, then send the welcome email.");
      s.welcomeSentAt = new Date().toISOString();
      if (s.status === "IMPORTED") setStatus(s, "INVITED", "Welcome email sent", actor);
      record(ctx, "ACTIVATION_RESENT", `Sent the welcome email again to ${fullName(s)}`);
      return noContent();
    }
    if (method === "POST" && action === "/password-reset") {
      if (s.status !== "ACTIVE") return err(409, "not_activated", `${fullName(s)} has not activated yet. Send the welcome email instead.`);
      if (!s.email) return err(422, "no_email", "There is no email on this record. Add one first.");
      sendCode(u, s, "reset", false);
      record(ctx, "PASSWORD_RESET_SENT", `Emailed a password reset code to ${fullName(s)}`);
      return noContent();
    }
    if (method === "POST" && action === "/suspend") {
      const b = await body<{ reason?: string }>(ctx.req);
      const reason = (b.reason ?? "").trim();
      if (!reason || reason.length > 500) return invalid({ reason: "Write why, in up to 500 characters. It is kept in the record." });
      if (s.status === "SUSPENDED") return err(409, "already_suspended", `${fullName(s)} is already suspended.`);
      s.beforeSuspend = s.status;
      setStatus(s, "SUSPENDED", reason, actor);
      ctx.endStudentSessions(s.id, false);
      record(ctx, "STUDENT_SUSPENDED", `Suspended ${fullName(s)}: ${reason}`);
      return json(200, recordOf(u, s));
    }
    if (method === "POST" && action === "/reinstate") {
      if (s.status !== "SUSPENDED") return err(409, "not_suspended", `${fullName(s)} is not suspended.`);
      setStatus(s, s.beforeSuspend ?? (s.activatedAt ? "ACTIVE" : "INVITED"), "Access restored", actor);
      record(ctx, "STUDENT_REINSTATED", `Restored access for ${fullName(s)}`);
      return json(200, recordOf(u, s));
    }
  }
  return null;
}

export function studentSessionUser(u: Uni, id: string) {
  const s = u.students.find((x) => x.id === id);
  if (!s) return null;
  return {
    user: { id: s.userId, fullName: fullName(s), email: s.email ?? "", initials: initialsOf(fullName(s)) },
    scopeLabel: `${programmeOf(u, s.programmeCode)?.name ?? s.programmeCode} · ${s.level}L`,
    suspended: s.status === "SUSPENDED",
  };
}
