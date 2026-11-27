// Helpers shared by the B1 mock handlers.
import type { Session } from "@/lib/types";
import type { AuditType, UniversityAuditItem } from "@/lib/types-b1";
import type { Uni } from "./b1-data";

export interface B1Ctx {
  req: Request;
  url: URL;
  path: string;
  method: string;
  uni: Uni;
  tenant: { name: string; googleDomain: string; portalUrl: string };
  /** Signed-in staff member (stage SIGNED_IN), with the active role. */
  staff: { id: string; fullName: string; email: string; role: string | undefined; roleLabel: string } | null;
  /** Signed-in student's id. */
  studentId: string | null;
  uploads: Map<string, { type: string; body: ArrayBuffer }>;
  /** Creates a student session, sets the cookie and returns the GET /session body. */
  signInStudent: (studentId: string, keep: boolean) => Session;
  /** Ends a student's sessions (all, or all but this browser's). */
  endStudentSessions: (studentId: string, exceptCurrent: boolean) => void;
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const noContent = () => new Response(null, { status: 204 });

export const err = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) =>
  json(status, { error, message, ...extra });

export const invalid = (fields: Record<string, string>, message?: string) =>
  err(400, "invalid", message ?? Object.values(fields)[0] ?? "Some details need fixing.", { fields });

export const forbidden = () => err(403, "forbidden", "Your role cannot do this.");
export const notFound = (what = "that") => err(404, "not_found", `We could not find ${what}.`);
export const signedOut = () => err(401, "signed_out", "You were signed out. Sign in again to continue.");

export const uid = () => crypto.randomUUID();

export const csvResponse = (name: string, rows: (string | number | null | undefined)[][]) => {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new Response(rows.map((r) => r.map(esc).join(",")).join("\n") + "\n", {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` },
  });
};

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  return (await req.json().catch(() => ({}))) as T;
}

export function page<T>(all: T[], url: URL, defSize = 25) {
  const p = Math.max(0, Number(url.searchParams.get("page") ?? 0) || 0);
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? defSize) || defSize));
  return { items: all.slice(p * size, p * size + size), page: p, size, total: all.length };
}

/** RFC 4180-ish CSV parser: quotes, doubled quotes, CRLF, a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function uploadTicket(fileName: string, contentType: string) {
  const key = `imports/mock/${uid()}-${fileName.replace(/[^a-z0-9.-]/gi, "_")}`;
  return {
    key,
    uploadUrl: `/api/v1/dev/storage/${key}?expires=${Date.now() + 600_000}&sig=mock`,
    method: "PUT",
    headers: { "Content-Type": contentType || "text/csv" },
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

export function readUpload(ctx: B1Ctx, key: string): string | null {
  const f = ctx.uploads.get(key);
  return f ? new TextDecoder().decode(f.body) : null;
}

const SIGN_IN = ["SIGN_IN", "SIGN_IN_FAILED", "SIGN_OUT", "MFA_SET_UP", "MFA_FAILED", "MFA_RESET", "ROLE_SWITCHED"];
const ROLES = ["STAFF_INVITED", "STAFF_SUSPENDED", "STAFF_REINSTATED", "ROLE_GRANTED", "ROLE_REMOVED", "INVITATION_RESENT"];

export function auditType(action: string): AuditType {
  if (SIGN_IN.includes(action) || /^(STUDENT_SIGN_IN|STUDENT_ACTIVATED|PASSWORD_)/.test(action)) return "SIGN_IN";
  if (ROLES.includes(action)) return "ROLES";
  if (/^(SESSION|FACULTY|DEPARTMENT|PROGRAMME|COURSE|CENTRE|ROOM|STAFFING|GRADING|IMPORT)_/.test(action)) return "SETUP";
  if (/^(STUDENT|STUDENTS_|WELCOME_)/.test(action)) return "STUDENTS";
  return "OTHER";
}

export function record(ctx: B1Ctx, action: string, summary: string, actor?: UniversityAuditItem["actor"]) {
  const a: UniversityAuditItem["actor"] =
    actor !== undefined
      ? actor
      : ctx.staff
        ? { id: ctx.staff.id, fullName: ctx.staff.fullName, role: ctx.staff.role ?? null, roleLabel: ctx.staff.roleLabel }
        : null;
  ctx.uni.audit.unshift({ id: uid(), at: new Date().toISOString(), type: auditType(action), action, summary, actor: a, ip: "127.0.0.1" });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const month = (d: string) => MONTHS[Number(d.slice(5, 7)) - 1];
export const dayMonth = (d: string) => `${Number(d.slice(8, 10))} ${month(d)}`;
export const dayMonthYear = (d: string) => `${dayMonth(d)} ${d.slice(0, 4)}`;
export const today = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10); // Africa/Lagos is UTC+1
export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export const initialsOf = (name: string) => {
  const parts = name.replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
};

export const n = (v: number) => v.toLocaleString("en-NG");
