// Mock of api-b1-academic.md §8 People & roles and §9 the university's audit log.
import type { Person, StaffRoleCode, StaffScopeType } from "@/lib/types-b1";
import { roleLabel, scopesFor, STAFF_ROLES } from "@/lib/staff-roles";
import { currentSession } from "./b1-academic";
import type { MPerson, Uni } from "./b1-data";
import { body, csvResponse, err, forbidden, initialsOf, invalid, json, noContent, notFound, page, parseCsv, readUpload, record, uid, uploadTicket, type B1Ctx } from "./b1-util";

function scopeLabel(u: Uni, t: StaffScopeType, id: string | null, uniName: string): string | null {
  if (t === "UNIVERSITY") return uniName;
  if (t === "FACULTY") return u.faculties.find((f) => f.id === id)?.name ?? null;
  if (t === "DEPARTMENT") return u.departments.find((d) => d.id === id)?.name ?? null;
  if (t === "CENTRE") return u.centres.find((c) => c.id === id)?.name ?? null;
  const c = u.courses.find((x) => x.id === id);
  if (!c) return null;
  const prog = u.programmes.find((p) => p.id === c.offeredTo[0]?.programmeId);
  const dept = u.departments.find((d) => d.id === prog?.departmentId);
  return dept ? `${c.code} · ${dept.name}` : c.code;
}

function view(u: Uni, p: MPerson, uniName: string): Person {
  const roles = p.roles.map((r) => ({ ...r, roleLabel: roleLabel(r.role), scopeLabel: scopeLabel(u, r.scopeType, r.scopeId, uniName) ?? "" }));
  return {
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    initials: initialsOf(p.fullName),
    status: p.status,
    roles,
    scopeLabel: roles[0]?.scopeLabel ?? "",
    twoStepSetUp: p.twoStepSetUp,
    invitedAt: p.invitedAt,
    acceptedAt: p.acceptedAt,
    lastSignInAt: p.lastSignInAt,
    suspendedAt: p.suspendedAt,
    suspendedReason: p.suspendedReason,
  };
}

/** Current-session places a person holds (for GET /people/{id} and the suspend check). */
function placesOf(u: Uni, id: string) {
  const cur = currentSession(u);
  const st = cur ? u.staffing[cur.id] : undefined;
  if (!cur || !st) return [];
  const out: { kind: string; what: string; session: string; current: boolean }[] = [];
  for (const [cid, cs] of Object.entries(st.courses)) {
    const c = u.courses.find((x) => x.id === cid);
    if (!c) continue;
    if (cs.lecturerId === id) out.push({ kind: "LECTURER", what: `Lecturer · ${c.code} · ${c.title}`, session: cur.name, current: true });
    if (cs.examOfficerId === id) out.push({ kind: "EXAM_OFFICER", what: `Exam officer · ${c.code} · ${c.title}`, session: cur.name, current: true });
    cs.facilitators
      .filter((f) => f.userId === id)
      .forEach((f) => out.push({ kind: "FACILITATOR", what: `Facilitator · ${c.code} · ${u.centres.find((x) => x.id === f.centreId)?.name ?? ""}`, session: cur.name, current: true }));
  }
  for (const [cid, pid] of Object.entries(st.centres)) {
    if (pid === id) out.push({ kind: "CENTRE_COORDINATOR", what: `Coordinator · ${u.centres.find((x) => x.id === cid)?.name ?? ""}`, session: cur.name, current: true });
  }
  return out;
}

function checkRoles(u: Uni, roles: { role?: string; scopeType?: string; scopeId?: string | null }[] | undefined, fields: Record<string, string>) {
  if (!roles?.length) {
    fields.roles = "Give them at least one role.";
    return;
  }
  roles.forEach((r, i) => {
    const def = STAFF_ROLES.find((x) => x.role === r.role);
    if (!def) return (fields[`roles[${i}].role`] = "Choose a role.");
    if (!def.scopes.includes(r.scopeType as StaffScopeType)) return (fields[`roles[${i}].scopeType`] = `${def.label} cannot have that scope.`);
    if (r.scopeType === "UNIVERSITY") return;
    const ok =
      r.scopeType === "FACULTY"
        ? u.faculties.some((x) => x.id === r.scopeId)
        : r.scopeType === "DEPARTMENT"
          ? u.departments.some((x) => x.id === r.scopeId)
          : r.scopeType === "CENTRE"
            ? u.centres.some((x) => x.id === r.scopeId)
            : u.courses.some((x) => x.id === r.scopeId);
    if (!ok) {
      fields[`roles[${i}].scopeId`] =
        r.scopeType === "COURSE" ? "Choose a course from the catalogue." : r.scopeType === "CENTRE" ? "Choose a study centre." : r.scopeType === "FACULTY" ? "Choose a faculty." : "Choose a department.";
    }
  });
}

const IMPORT_COLS = ["full_name", "email", "role", "scope_type", "scope_code"];

export async function peopleRoute(ctx: B1Ctx): Promise<Response | null> {
  const { path, method, url, uni: u } = ctx;
  if (!(path === "/people" || path.startsWith("/people/") || path === "/audit")) return null;
  if (!ctx.staff) return err(401, "signed_out", "You were signed out. Sign in again to continue.");
  const role = ctx.staff.role;
  if (method === "GET" ? !(role === "ODEL_ADMIN" || role === "ODEL_DIRECTOR") : role !== "ODEL_ADMIN") return forbidden();
  const uniName = ctx.tenant.name;
  const domain = ctx.tenant.googleDomain.toLowerCase();
  const me = u.people.find((p) => p.email.toLowerCase() === ctx.staff!.email.toLowerCase());
  let m: RegExpMatchArray | null;

  if (method === "GET" && path === "/audit") {
    const type = url.searchParams.get("type");
    const action = url.searchParams.get("action");
    const actorId = url.searchParams.get("actorId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const lagosDay = (iso: string) => new Date(Date.parse(iso) + 3600_000).toISOString().slice(0, 10);
    const all = u.audit.filter(
      (a) =>
        (!type || a.type === type) &&
        (!action || a.action === action) &&
        (!actorId || a.actor?.id === actorId) &&
        (!from || lagosDay(a.at) >= from) &&
        (!to || lagosDay(a.at) <= to),
    );
    return json(200, page(all, url, 50));
  }

  if (method === "GET" && path === "/people") {
    const q = (url.searchParams.get("search") ?? "").toLowerCase();
    const r = url.searchParams.get("role");
    const s = url.searchParams.get("status");
    const all = u.people
      .filter((p) => (!q || p.fullName.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) && (!r || p.roles.some((x) => x.role === r)) && (!s || p.status === s))
      .sort((a, b) => a.fullName.replace(/^(Dr|Prof\.?|Mr|Mrs|Ms)\s+/, "").localeCompare(b.fullName.replace(/^(Dr|Prof\.?|Mr|Mrs|Ms)\s+/, "")))
      .map((p) => view(u, p, uniName));
    const counts = {
      total: u.people.length,
      active: u.people.filter((p) => p.status === "ACTIVE").length,
      invited: u.people.filter((p) => p.status === "INVITED").length,
      suspended: u.people.filter((p) => p.status === "SUSPENDED").length,
    };
    return json(200, { ...page(all, url), counts });
  }

  if (method === "POST" && path === "/people") {
    const b = await body<{ fullName?: string; email?: string; roles?: { role?: string; scopeType?: string; scopeId?: string | null }[] }>(ctx.req);
    const fields: Record<string, string> = {};
    if (!b.fullName?.trim()) fields.fullName = "Enter their full name.";
    const email = (b.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fields.email = "Enter their university email.";
    else if (!email.endsWith(`@${domain}`)) fields.email = `Use an @${domain} address: staff sign in with the university's Google accounts.`;
    checkRoles(u, b.roles, fields);
    if (Object.keys(fields).length) return invalid(fields);
    if (u.people.some((p) => p.email.toLowerCase() === email)) return err(409, "email_taken", `${email} already has an account here.`, { fields: { email: `${email} already has an account here.` } });
    const p: MPerson = {
      id: uid(),
      fullName: b.fullName!.trim(),
      email,
      status: "INVITED",
      roles: b.roles!.map((r) => ({ id: uid(), role: r.role as StaffRoleCode, scopeType: r.scopeType as StaffScopeType, scopeId: r.scopeType === "UNIVERSITY" ? null : r.scopeId ?? null })),
      twoStepSetUp: false,
      invitedAt: new Date().toISOString(),
      acceptedAt: null,
      lastSignInAt: null,
      suspendedAt: null,
      suspendedReason: null,
    };
    u.people.push(p);
    const v = view(u, p, uniName);
    record(ctx, "STAFF_INVITED", `Invited ${p.fullName} as ${v.roles.map((r) => `${r.roleLabel} for ${r.scopeLabel}`).join(", ")}`);
    return json(201, v);
  }

  if (method === "POST" && path === "/people/uploads") {
    const b = await body<{ fileName?: string; contentType?: string; size?: number }>(ctx.req);
    if (!/\.csv$/i.test(b.fileName ?? "")) return invalid({ file: "Upload a CSV file. In Excel use File → Save as → CSV UTF-8." });
    if ((b.size ?? 0) > 5 * 1024 * 1024) return invalid({ file: "The file must be 5 MB or smaller." });
    return json(200, uploadTicket(b.fileName!, b.contentType ?? "text/csv"));
  }
  if (method === "GET" && path === "/people/imports/template.csv") {
    return csvResponse("staff-template.csv", [IMPORT_COLS, ["Dr Funmi Bello", `f.bello@${domain}`, "LECTURER", "COURSE", "CSC 201"]]);
  }
  if (method === "POST" && path === "/people/imports") {
    const b = await body<{ key?: string; fileName?: string }>(ctx.req);
    const text = readUpload(ctx, b.key ?? "");
    if (text === null) return err(400, "file_missing", "We could not find the uploaded file. Upload it again.");
    const rows = parseCsv(text);
    const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
    if (header.join(",") !== IMPORT_COLS.join(",")) return err(400, "bad_header", "The columns do not match the template: download the template and copy your rows into it.");
    if (rows.length < 2) return err(400, "empty_file", "The file has no rows under the header.");
    const problems: { row: number; message: string }[] = [];
    const ready: { fullName: string; email: string; role: StaffRoleCode; scopeType: StaffScopeType; scopeId: string | null }[] = [];
    const emails = new Map<string, number>();
    rows.slice(1).forEach((r, i) => {
      const row = i + 2;
      const [name, emailRaw, roleRaw, stRaw, code] = r.map((c) => (c ?? "").trim());
      const email = emailRaw.toLowerCase();
      if (!name) return problems.push({ row, message: "Full name is empty" });
      if (!email.endsWith(`@${domain}`)) return problems.push({ row, message: `${email || "Email"} is not an @${domain} address` });
      if (u.people.some((p) => p.email.toLowerCase() === email)) return problems.push({ row, message: `${email} already has an account here` });
      if (emails.has(email)) return problems.push({ row, message: `${email} appears twice in the file (rows ${emails.get(email)} and ${row})` });
      const roleCode = roleRaw.toUpperCase().replace(/\s+/g, "_") as StaffRoleCode;
      if (!STAFF_ROLES.some((x) => x.role === roleCode)) return problems.push({ row, message: `Role "${roleRaw}" is not one we know` });
      const st = (stRaw || "UNIVERSITY").toUpperCase() as StaffScopeType;
      if (!scopesFor(roleCode).includes(st)) return problems.push({ row, message: `${roleLabel(roleCode)} cannot have the scope ${stRaw}` });
      let scopeId: string | null = null;
      if (st !== "UNIVERSITY") {
        const c = code.toUpperCase().replace(/\s+/g, "");
        scopeId =
          (st === "FACULTY"
            ? u.faculties.find((x) => x.code === c)?.id
            : st === "DEPARTMENT"
              ? u.departments.find((x) => x.code === c)?.id
              : st === "CENTRE"
                ? u.centres.find((x) => x.code === c)?.id
                : u.courses.find((x) => x.code.replace(/\s+/g, "") === c)?.id) ?? null;
        if (!scopeId) return problems.push({ row, message: `${st.toLowerCase()} "${code}" not found` });
      }
      emails.set(email, row);
      ready.push({ fullName: name, email, role: roleCode, scopeType: st, scopeId });
    });
    const imp = { id: uid(), totalRows: rows.length - 1, readyRows: ready.length, problemRows: problems.length, problems, status: "CHECKED" as const, ready };
    u.imports.set(imp.id, imp);
    const { ready: _r, ...out } = imp;
    void _r;
    return json(200, out);
  }
  if (method === "POST" && (m = path.match(/^\/people\/imports\/([^/]+)\/confirm$/))) {
    const imp = u.imports.get(m[1]) as { id: string; status: string; ready: { fullName: string; email: string; role: StaffRoleCode; scopeType: StaffScopeType; scopeId: string | null }[] } | undefined;
    if (!imp || !("ready" in imp)) return notFound("that import");
    if (imp.status === "IMPORTED") return err(409, "already_done", "This file has already been imported.");
    let invited = 0;
    for (const r of imp.ready) {
      if (u.people.some((p) => p.email === r.email)) continue;
      u.people.push({
        id: uid(),
        fullName: r.fullName,
        email: r.email,
        status: "INVITED",
        roles: [{ id: uid(), role: r.role, scopeType: r.scopeType, scopeId: r.scopeId }],
        twoStepSetUp: false,
        invitedAt: new Date().toISOString(),
        acceptedAt: null,
        lastSignInAt: null,
        suspendedAt: null,
        suspendedReason: null,
      });
      invited++;
    }
    imp.status = "IMPORTED";
    record(ctx, "STAFF_INVITED", `Invited ${invited} staff from a CSV file`);
    const { ready: _r, ...out } = imp as typeof imp & Record<string, unknown>;
    void _r;
    return json(200, { ...out, invited });
  }

  if ((m = path.match(/^\/people\/([^/]+)(\/[a-z-]+)?$/))) {
    const p = u.people.find((x) => x.id === m![1]);
    if (!p) return notFound("that person");
    const action = m[2] ?? "";
    const self = me?.id === p.id;
    if (method === "GET" && action === "") return json(200, { person: view(u, p, uniName), staffing: placesOf(u, p.id) });
    if (method === "GET" && action === "/suspend-check") {
      const places = placesOf(u, p.id);
      const warnings: string[] = [];
      const fac = places.filter((x) => x.kind === "FACILITATOR");
      const lect = places.filter((x) => x.kind === "LECTURER");
      const coord = places.filter((x) => x.kind === "CENTRE_COORDINATOR");
      const list = (xs: typeof places) => xs.map((x) => x.what.split(" · ").slice(1).join(" · ")).join(", ");
      if (fac.length) warnings.push(`They facilitate ${fac.length} course group${fac.length === 1 ? "" : "s"} (${list(fac)}). Reassign them so students are not left without support.`);
      if (lect.length) warnings.push(`They lecture ${lect.length} course${lect.length === 1 ? "" : "s"} (${list(lect)}). Choose another lecturer on Staffing.`);
      if (coord.length) warnings.push(`They coordinate ${list(coord)}. Choose another coordinator so students have someone to contact.`);
      return json(200, { warnings, staffing: places });
    }
    if (method === "PUT" && action === "/roles") {
      const b = await body<{ roles?: { role?: string; scopeType?: string; scopeId?: string | null }[] }>(ctx.req);
      const fields: Record<string, string> = {};
      checkRoles(u, b.roles, fields);
      if (Object.keys(fields).length) return invalid(fields);
      if (self && p.roles.some((r) => r.role === "ODEL_ADMIN") && !b.roles!.some((r) => r.role === "ODEL_ADMIN")) {
        return err(409, "own_admin_role", "You cannot remove your own ODeL admin role. Ask another ODeL admin.");
      }
      const key = (r: { role?: string; scopeType?: string; scopeId?: string | null }) => `${r.role}|${r.scopeType}|${r.scopeType === "UNIVERSITY" ? "" : r.scopeId ?? ""}`;
      const before = new Set(p.roles.map(key));
      const after = new Set(b.roles!.map(key));
      b.roles!.filter((r) => !before.has(key(r))).forEach((r) => record(ctx, "ROLE_GRANTED", `Gave ${p.fullName} the ${roleLabel(r.role!)} role`));
      p.roles.filter((r) => !after.has(key(r))).forEach((r) => record(ctx, "ROLE_REMOVED", `Removed ${roleLabel(r.role)} from ${p.fullName}`));
      p.roles = b.roles!.map((r) => ({ id: uid(), role: r.role as StaffRoleCode, scopeType: r.scopeType as StaffScopeType, scopeId: r.scopeType === "UNIVERSITY" ? null : r.scopeId ?? null }));
      return json(200, view(u, p, uniName));
    }
    if (method === "POST" && action === "/suspend") {
      const b = await body<{ reason?: string }>(ctx.req);
      const reason = (b.reason ?? "").trim();
      if (!reason || reason.length > 500) return invalid({ reason: "Write why, in up to 500 characters. It is kept in the audit log." });
      if (self) return err(409, "self", "You cannot suspend yourself. Ask another ODeL admin.");
      if (p.status === "SUSPENDED") return err(409, "already_suspended", `${p.fullName} is already suspended.`);
      p.status = "SUSPENDED";
      p.suspendedAt = new Date().toISOString();
      p.suspendedReason = reason;
      record(ctx, "STAFF_SUSPENDED", `Suspended ${p.fullName}: ${reason}`);
      return json(200, view(u, p, uniName));
    }
    if (method === "POST" && action === "/reinstate") {
      if (p.status !== "SUSPENDED") return err(409, "not_suspended", `${p.fullName} is not suspended.`);
      p.status = p.acceptedAt ? "ACTIVE" : "INVITED";
      p.suspendedAt = null;
      p.suspendedReason = null;
      record(ctx, "STAFF_REINSTATED", `Restored access for ${p.fullName}`);
      return json(200, view(u, p, uniName));
    }
    if (method === "POST" && action === "/resend-invitation") {
      if (p.status !== "INVITED") return err(409, "already_active", `${p.fullName} has already signed in.`);
      p.invitedAt = new Date().toISOString();
      record(ctx, "INVITATION_RESENT", `Resent the invitation to ${p.fullName}`);
      return noContent();
    }
    if (method === "POST" && action === "/reset-two-step") {
      if (self) return err(409, "self", "You cannot reset your own two-step sign-in here. Sign out and use a backup code instead.");
      const b = await body<{ reason?: string }>(ctx.req);
      p.twoStepSetUp = false;
      record(ctx, "MFA_RESET", `Reset two-step sign-in for ${p.fullName}${b.reason ? `: ${b.reason}` : ""}`);
      return noContent();
    }
  }
  return null;
}
