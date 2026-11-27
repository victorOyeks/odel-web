// Mock implementation of the B0 API (ODEL_MOCK_API=1). It answers the same
// paths, status codes and bodies as docs/api-b0.md so every screen can be
// viewed without the Spring Boot API. State lives in memory on globalThis.
import type {
  AuditItem,
  Checklist,
  NewTenant,
  Notification,
  PublicContext,
  Session,
  SessionStage,
  TenantListItem,
} from "@/lib/types";
import { normaliseHex, whiteTextPasses, contrast, formatRatio } from "@/lib/brand";
import { surfaceForHost, signInPath, safeNext } from "@/lib/host";
import {
  FIXED_HOSTS,
  PERSONAS,
  initials,
  nextStepsFor,
  platformContext,
  seedTenants,
  type MockTenant,
  type Persona,
} from "./data";

interface MockSession {
  id: string;
  persona: string;
  host: string; // first label of the host the session belongs to
  stage: SessionStage;
  activeRoleId: string | null;
  lastSeen: number;
  idleSeconds: number;
  wrongAttempts: number;
  backupLeft: number;
}

interface MockStore {
  tenants: MockTenant[];
  sessions: Map<string, MockSession>;
  audit: AuditItem[];
  uploads: Map<string, { type: string; body: ArrayBuffer }>;
  notifications: Notification[];
  remembered: Map<string, string>; // persona -> last active role
}

const g = globalThis as unknown as { __odelMock?: MockStore };

function store(): MockStore {
  if (!g.__odelMock) {
    const tenants = seedTenants();
    g.__odelMock = {
      tenants,
      sessions: new Map(),
      uploads: new Map(),
      remembered: new Map(),
      notifications: [
        {
          id: "n1",
          type: "WELCOME",
          title: "Welcome to the ODeL portal",
          body: "Start with the setup checklist. Each step tells you what it needs.",
          link: "/staff/setup",
          createdAt: new Date(Date.now() - 3600_000).toISOString(),
          readAt: null,
        },
      ],
      audit: tenants.map((t, i) => ({
        id: `a-seed-${i}`,
        at: t.createdAt,
        actor: { fullName: "Chuka Obi", role: "Platform admin" },
        action: "TENANT_CREATED",
        summary: `Created ${t.name}; invited ${t.firstAdmin?.fullName ?? "the first admin"}`,
        tenant: { id: t.id, name: t.name },
        ip: "102.89.34.10",
      })),
    };
  }
  return g.__odelMock;
}

// ---------------------------------------------------------------- helpers

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const noContent = (headers: HeadersInit = {}) => new Response(null, { status: 204, headers });

const redirect = (location: string, cookies: string[] = []) => {
  const h = new Headers({ location });
  cookies.forEach((c) => h.append("set-cookie", c));
  return new Response(null, { status: 302, headers: h });
};

const err = (status: number, error: string, message?: string, extra: Record<string, unknown> = {}) =>
  json(status, { error, ...(message ? { message } : {}), ...extra });

function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  (req.headers.get("cookie") ?? "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

const cookie = (name: string, value: string, opts: { httpOnly?: boolean; maxAge?: number } = {}) =>
  `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${opts.httpOnly ? "; HttpOnly" : ""}${
    opts.maxAge !== undefined ? `; Max-Age=${opts.maxAge}` : ""
  }`;

const hostLabel = (host: string) => host.split(":")[0].split(".")[0].toLowerCase();

function tenantForHost(host: string): MockTenant | null {
  const label = hostLabel(host);
  const found = store().tenants.find((t) => t.host === label);
  if (found) return found;
  const fixed = FIXED_HOSTS[label];
  if (fixed) {
    return {
      host: label,
      webAddress: `${label}.localhost`,
      createdAt: new Date().toISOString(),
      createdBy: null,
      firstAdmin: null,
      nextSteps: [],
      students: 0,
      centres: 0,
      ...fixed,
    } as MockTenant;
  }
  return null;
}

function context(host: string): PublicContext | null {
  if (surfaceForHost(host) === "console") return platformContext(true);
  const t = tenantForHost(host);
  if (!t) return null;
  return {
    kind: "UNIVERSITY",
    tenant: {
      id: t.id,
      slug: t.slug,
      name: t.name,
      shortName: t.shortName,
      primaryColor: t.branding.primaryColor,
      accentColor: t.branding.accentColor,
      logoUrl: t.branding.logoUrl,
      googleDomain: t.googleDomain,
      status: t.status,
    },
    devSignIn: true,
  };
}

function personaOf(s: MockSession): Persona {
  return PERSONAS.find((p) => p.key === s.persona) ?? PERSONAS[0];
}

function sessionBody(s: MockSession): Session {
  const p = personaOf(s);
  const t = tenantForHost(s.host);
  const user = p.user!(t);
  return {
    stage: s.stage,
    user: { id: `u-${p.key}`, ...user },
    roles: p.roles!(t),
    activeRoleId: s.activeRoleId,
    idleTimeoutSeconds: s.idleSeconds,
    idleExpiresAt: new Date(s.lastSeen + s.idleSeconds * 1000).toISOString(),
  };
}

function audit(s: MockSession | null, action: string, summary: string, tenant: MockTenant | null = null) {
  const actor = s ? sessionBody(s).user.fullName : null;
  const role = s ? sessionBody(s).roles.find((r) => r.id === s.activeRoleId)?.roleLabel ?? "" : "";
  store().audit.unshift({
    id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    actor: actor ? { fullName: actor, role } : null,
    action,
    summary,
    tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
    ip: "127.0.0.1",
  });
}

const ALL_CODES = ["4827-1930", "5561-0284", "9013-7745", "2280-6619", "7734-1802", "6159-3307", "8842-5560", "3096-4471"];

function afterMfa(s: MockSession): void {
  const p = personaOf(s);
  const roles = p.roles!(tenantForHost(s.host));
  const remembered = store().remembered.get(p.key);
  if (roles.length === 1) {
    s.activeRoleId = roles[0].id;
    s.stage = "SIGNED_IN";
  } else if (remembered && roles.some((r) => r.id === remembered)) {
    s.activeRoleId = remembered;
    s.stage = "SIGNED_IN";
  } else {
    s.stage = "CHOOSE_ROLE";
  }
}

// ---------------------------------------------------------------- handler

export async function mockHandle(req: Request, host: string): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const method = req.method.toUpperCase();
  const jar = cookies(req);
  const st = store();
  const surface = surfaceForHost(host);
  const setCookies: string[] = [];

  // CSRF: readable cookie, echoed in a header on every non-GET request.
  let xsrf = jar["XSRF-TOKEN"];
  if (!xsrf) {
    xsrf = crypto.randomUUID();
    setCookies.push(`XSRF-TOKEN=${xsrf}; Path=/; SameSite=Lax`);
  }
  const withCookies = (res: Response) => {
    setCookies.forEach((c) => res.headers.append("set-cookie", c));
    return res;
  };
  const isBrowserNav = path.startsWith("/auth/google") || path.startsWith("/dev/");
  if (method !== "GET" && method !== "HEAD" && !path.startsWith("/dev/storage/")) {
    if (!jar["XSRF-TOKEN"] || req.headers.get("x-xsrf-token") !== jar["XSRF-TOKEN"]) {
      return withCookies(err(403, "csrf", "Your page is out of date. Refresh and try again."));
    }
  }

  // Session lookup with idle expiry.
  let session: MockSession | null = null;
  const sid = jar["ODEL_SESSION"];
  if (sid) {
    const s = st.sessions.get(sid);
    if (s && s.host === hostLabel(host)) {
      if (Date.now() - s.lastSeen > s.idleSeconds * 1000) {
        st.sessions.delete(sid);
        audit(s, "SIGN_OUT", `${sessionBody(s).user.fullName} was signed out after 30 minutes without activity`);
      } else {
        session = s;
      }
    }
  }
  // Any call except GET /session resets the idle clock.
  if (session && !(method === "GET" && path === "/session")) session.lastSeen = Date.now();

  const signedOut = () => withCookies(err(401, "signed_out", "You were signed out. Sign in again to continue."));
  const requireSignedIn = () => (!session || session.stage !== "SIGNED_IN" ? signedOut() : null);
  const activeRole = () => (session ? sessionBody(session).roles.find((r) => r.id === session!.activeRoleId) : undefined);
  const forbidden = () => withCookies(err(403, "forbidden", "Your role cannot do this."));

  const res = await route();
  return isBrowserNav ? res : withCookies(res);

  async function route(): Promise<Response> {
    // ---- public
    if (method === "GET" && path === "/public/context") {
      const ctx = context(host);
      return ctx ? json(200, ctx) : err(404, "unknown_host", "This web address is not set up on ODeL.");
    }

    // ---- staff sign-in (browser navigation)
    if (method === "GET" && path === "/auth/google/start") {
      const returnTo = safeNext(url.searchParams.get("returnTo"), surface === "console" ? "/" : "/staff");
      if (surface === "university" && tenantForHost(host)?.status === "SUSPENDED") {
        return redirect(`${signInPath(surface)}?error=university_suspended`);
      }
      return redirect(`/dev/mock-google?returnTo=${encodeURIComponent(returnTo)}`);
    }
    if (method === "GET" && path === "/dev/mock-sign-in") {
      const persona = PERSONAS.find((p) => p.key === url.searchParams.get("persona"));
      const returnTo = safeNext(url.searchParams.get("returnTo"), surface === "console" ? "/" : "/staff");
      if (!persona) return redirect(`${signInPath(surface)}?error=cancelled`);
      if (persona.error) {
        const email = persona.error === "wrong_domain" ? "f.bello@gmail.com" : "f.bello@wesleyuni.edu.ng";
        audit(null, "SIGN_IN_FAILED", `Sign-in refused for ${email} (${persona.error})`, tenantForHost(host));
        // Only wrong_domain names the account; not_linked never puts the email in the URL.
        const q = persona.error === "wrong_domain" ? `&email=${encodeURIComponent(email)}` : "";
        return redirect(`${signInPath(surface)}?error=${persona.error}${q}`);
      }
      const trusted = jar["ODEL_TRUST"] === persona.key;
      const s: MockSession = {
        id: crypto.randomUUID(),
        persona: persona.key,
        host: hostLabel(host),
        stage: persona.firstStage === "MFA_REQUIRED" && trusted ? "MFA_REQUIRED" : persona.firstStage ?? "MFA_REQUIRED",
        activeRoleId: null,
        lastSeen: Date.now(),
        idleSeconds: Number(url.searchParams.get("idle")) || 1800,
        wrongAttempts: 0,
        backupLeft: 8,
      };
      if (s.stage === "MFA_REQUIRED" && trusted) afterMfa(s);
      st.sessions.set(s.id, s);
      audit(s, "SIGN_IN", `${sessionBody(s).user.fullName} signed in with Google`, tenantForHost(host));
      return redirect(`/auth/continue?next=${encodeURIComponent(returnTo)}`, [
        cookie("ODEL_SESSION", s.id, { httpOnly: true }),
      ]);
    }
    if (method === "GET" && (path === "/auth/google/callback" || path === "/auth/handoff")) {
      return redirect(`${signInPath(surface)}?error=expired`);
    }

    // ---- session
    if (method === "GET" && path === "/session") {
      return session ? json(200, sessionBody(session)) : signedOut();
    }
    if (method === "POST" && path === "/session/keepalive") {
      return session ? noContent() : signedOut();
    }
    if (method === "POST" && path === "/auth/sign-out") {
      if (session) {
        audit(session, "SIGN_OUT", `${sessionBody(session).user.fullName} signed out`, tenantForHost(host));
        st.sessions.delete(session.id);
      }
      return noContent({ "set-cookie": cookie("ODEL_SESSION", "", { httpOnly: true, maxAge: 0 }) });
    }

    // ---- two-step sign-in
    if (method === "POST" && path === "/auth/mfa/setup") {
      if (!session || session.stage !== "MFA_SETUP") return signedOut();
      const t = tenantForHost(host);
      const issuer = encodeURIComponent(t?.shortName ?? "ODeL Platform");
      const email = encodeURIComponent(sessionBody(session).user.email);
      return json(200, {
        secret: "JBSWY3DPEHPK3PXP",
        secretGrouped: "JBSW Y3DP EHPK 3PXP",
        otpauthUri: `otpauth://totp/${issuer}:${email}?secret=JBSWY3DPEHPK3PXP&issuer=${issuer}&digits=6&period=30`,
      });
    }
    if (method === "POST" && ["/auth/mfa/setup/confirm", "/auth/mfa/verify", "/auth/mfa/backup"].includes(path)) {
      const want: SessionStage = path === "/auth/mfa/setup/confirm" ? "MFA_SETUP" : "MFA_REQUIRED";
      if (!session || session.stage !== want) return signedOut();
      const body = (await req.json().catch(() => ({}))) as { code?: string; trustDevice?: boolean };
      const code = String(body.code ?? "").trim();
      const ok =
        path === "/auth/mfa/backup"
          ? /^\d{4}-?\d{4}$/.test(code) && code.replace("-", "") !== "00000000"
          : /^\d{6}$/.test(code) && code !== "000000";
      if (!ok) {
        session.wrongAttempts += 1;
        audit(session, "MFA_FAILED", `${sessionBody(session).user.fullName} entered a wrong code`, tenantForHost(host));
        if (session.wrongAttempts >= 3) {
          st.sessions.delete(session.id);
          return err(401, "too_many_attempts", "Too many wrong codes. Sign in again.");
        }
        return err(400, "wrong_code", "That code did not work.", { attemptsLeft: 3 - session.wrongAttempts });
      }
      session.wrongAttempts = 0;
      afterMfa(session);
      const extra: string[] = [];
      if (body.trustDevice) extra.push(cookie("ODEL_TRUST", session.persona, { httpOnly: true, maxAge: 30 * 86400 }));
      extra.forEach((c) => setCookies.push(c));
      if (path === "/auth/mfa/setup/confirm") {
        audit(session, "MFA_SET_UP", `${sessionBody(session).user.fullName} turned on two-step sign-in`, tenantForHost(host));
        return json(200, { backupCodes: ALL_CODES, session: sessionBody(session) });
      }
      if (path === "/auth/mfa/backup") {
        session.backupLeft -= 1;
        return json(200, { ...sessionBody(session), backupCodesLeft: session.backupLeft });
      }
      return json(200, sessionBody(session));
    }

    if (method === "POST" && path === "/me/active-role") {
      if (!session || (session.stage !== "CHOOSE_ROLE" && session.stage !== "SIGNED_IN")) return signedOut();
      const { roleAssignmentId } = (await req.json().catch(() => ({}))) as { roleAssignmentId?: string };
      const roles = sessionBody(session).roles;
      const r = roles.find((x) => x.id === roleAssignmentId);
      if (!r) return err(400, "invalid", "Choose one of your roles.", { fields: { roleAssignmentId: "Choose one of your roles." } });
      const switching = session.stage === "SIGNED_IN";
      session.activeRoleId = r.id;
      session.stage = "SIGNED_IN";
      st.remembered.set(session.persona, r.id);
      if (switching) audit(session, "ROLE_SWITCHED", `${sessionBody(session).user.fullName} switched to ${r.roleLabel}`, tenantForHost(host));
      return json(200, sessionBody(session));
    }

    // ---- setup checklist
    if (method === "GET" && path === "/setup/checklist") {
      const denied = requireSignedIn();
      if (denied) return denied;
      if (activeRole()?.role !== "ODEL_ADMIN") return forbidden();
      const step = (n: number, key: string, title: string, summary: string, href: string, locked = false) => ({
        number: n,
        key,
        title,
        summary,
        status: locked ? "LOCKED" : "NOT_STARTED",
        actionLabel: "Start",
        href,
        ...(locked ? { lockedReason: "Finish steps 1–7 first" } : {}),
      });
      const body: Checklist = {
        steps: [
          step(1, "SESSION", "Session and semesters", "Session dates and semesters", "/staff/academic-setup/sessions"),
          step(2, "STRUCTURE", "Academic structure", "Faculties, departments and programmes", "/staff/academic-setup/structure"),
          step(3, "CATALOGUE", "Course catalogue", "Courses for each programme", "/staff/courses"),
          step(4, "CENTRES", "Study centres", "Where students study and sit exams", "/staff/centres"),
          step(5, "PEOPLE", "People and roles", "Invite lecturers, coordinators and staff", "/staff/people"),
          step(6, "STAFFING", "Assign staff to courses and centres", "Who teaches each course and runs each centre", "/staff/people/assignments"),
          step(7, "GRADING", "Grading rules", "Default 5-point scale (30% CA / 70% exam)", "/staff/academic-setup/grading"),
          step(8, "IMPORT", "Import students", "From the university portal CSV", "/staff/students/import", true),
          step(9, "WELCOME", "Send welcome messages", "Email with activation link", "/staff/students/welcome", true),
        ] as Checklist["steps"],
        done: 0,
        total: 9,
      };
      return json(200, body);
    }

    // ---- notifications
    if (path.startsWith("/notifications")) {
      const denied = requireSignedIn();
      if (denied) return denied;
      if (method === "GET" && path === "/notifications") {
        return json(200, { items: st.notifications, page: 0, size: 20, total: st.notifications.length });
      }
      if (method === "GET" && path === "/notifications/unread-count") {
        return json(200, { count: st.notifications.filter((n) => !n.readAt).length });
      }
      if (method === "POST" && path === "/notifications/read-all") {
        st.notifications.forEach((n) => (n.readAt ??= new Date().toISOString()));
        return noContent();
      }
      const m = path.match(/^\/notifications\/([^/]+)\/read$/);
      if (method === "POST" && m) {
        const n = st.notifications.find((x) => x.id === m[1]);
        if (!n) return err(404, "not_found");
        n.readAt ??= new Date().toISOString();
        return noContent();
      }
    }
    if (path === "/push-tokens") return noContent();

    // ---- provider console
    if (path.startsWith("/platform/")) {
      const denied = requireSignedIn();
      if (denied) return denied;
      if (surface !== "console" || activeRole()?.role !== "SUPER_ADMIN") return forbidden();
      return platform();
    }

    // ---- uploads (stand-in for the storage bucket)
    const stored = path.match(/^\/dev\/storage\/(.+)$/);
    if (stored && method === "PUT") {
      const up = stored;
      st.uploads.set(up[1], { type: req.headers.get("content-type") ?? "image/png", body: await req.arrayBuffer() });
      return new Response(null, { status: 200 });
    }
    const logo = stored;
    if (logo && method === "GET") {
      const f = st.uploads.get(logo[1]);
      return f ? new Response(f.body, { headers: { "content-type": f.type } }) : err(404, "not_found");
    }

    return err(404, "not_found", "Nothing here.");
  }

  async function platform(): Promise<Response> {
    if (method === "GET" && path === "/platform/tenants") {
      const items: TenantListItem[] = st.tenants.map((t) => ({
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        slug: t.slug,
        webAddress: t.webAddress,
        status: t.status,
        students: t.students,
        centres: t.centres,
        createdAt: t.createdAt,
        firstAdmin: t.firstAdmin
          ? { fullName: t.firstAdmin.fullName, email: t.firstAdmin.email, accepted: t.firstAdmin.accepted }
          : null,
      }));
      return json(200, { items, page: 0, size: 50, total: items.length });
    }
    if (method === "GET" && path === "/platform/tenants/address-available") {
      const web = (url.searchParams.get("webAddress") ?? "").toLowerCase();
      const slug = (url.searchParams.get("slug") ?? "").toLowerCase();
      const webOwner = st.tenants.find((t) => (t.webAddress ?? "").toLowerCase() === web);
      const slugOwner = st.tenants.find((t) => t.slug === slug || t.host === slug);
      return json(200, {
        webAddress: webOwner
          ? { available: false, message: `${web} is already used by ${webOwner.name}` }
          : { available: true },
        slug: slugOwner ? { available: false, message: `${slug} is already used by ${slugOwner.name}` } : { available: true },
      });
    }
    if (method === "POST" && path === "/platform/logo-uploads") {
      const b = (await req.json().catch(() => ({}))) as { fileName?: string; contentType?: string; size?: number };
      if (!["image/svg+xml", "image/png"].includes(b.contentType ?? "")) {
        return err(400, "invalid", "Use an SVG or PNG file.", { fields: { file: "Use an SVG or PNG file." } });
      }
      if ((b.size ?? 0) > 2 * 1024 * 1024) {
        return err(400, "invalid", "The logo must be 2 MB or smaller.", { fields: { file: "The logo must be 2 MB or smaller." } });
      }
      const key = `logos/${crypto.randomUUID()}-${(b.fileName ?? "logo").replace(/[^a-z0-9.-]/gi, "_")}`;
      return json(200, {
        key,
        uploadUrl: `/api/v1/dev/storage/${key}?expires=${Date.now() + 600_000}&sig=mock`,
        method: "PUT",
        headers: { "Content-Type": b.contentType },
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      });
    }
    if (method === "GET" && path === "/platform/logo-uploads/preview") {
      const key = url.searchParams.get("key") ?? "";
      return st.uploads.has(key) ? json(200, { url: `/api/v1/dev/storage/${key}?sig=mock` }) : err(404, "not_found");
    }
    if (method === "POST" && path === "/platform/tenants") {
      const b = (await req.json().catch(() => ({}))) as Partial<NewTenant>;
      const fields: Record<string, string> = {};
      const need = (v: string | undefined, f: string, msg: string) => {
        if (!v || !v.trim()) fields[f] = msg;
      };
      need(b.name, "name", "Enter the university’s full name");
      need(b.shortName, "shortName", "Enter a short name");
      need(b.webAddress, "webAddress", "Enter the web address");
      need(b.googleDomain, "googleDomain", "Enter the staff Google domain");
      need(b.firstAdmin?.fullName, "firstAdmin.fullName", "Enter the first admin’s name");
      need(b.firstAdmin?.email, "firstAdmin.email", "Enter the first admin’s email");
      if (b.slug && !/^[a-z][a-z0-9-]{1,30}$/.test(b.slug)) fields.slug = "Use 2–31 lowercase letters, numbers or dashes, starting with a letter";
      if (!b.slug) fields.slug = "Enter a short address";
      if (b.firstAdmin?.email && b.googleDomain && !b.firstAdmin.email.toLowerCase().endsWith(`@${b.googleDomain.toLowerCase()}`)) {
        fields["firstAdmin.email"] = `Use an @${b.googleDomain} address`;
      }
      if (Object.keys(fields).length) return err(400, "invalid", "Check the highlighted fields.", { fields });
      const primary = normaliseHex(b.branding?.primaryColor ?? "") ?? "";
      if (!primary || !whiteTextPasses(primary)) {
        return err(422, "contrast", "The main colour fails the readability check.", {
          fields: {
            primaryColor: `White text on ${primary || b.branding?.primaryColor} is ${formatRatio(contrast("#FFFFFF", primary || "#FFFFFF"))}; it needs 4.5 : 1`,
          },
        });
      }
      if (st.tenants.some((t) => (t.webAddress ?? "").toLowerCase() === b.webAddress!.toLowerCase())) return err(409, "web_address_taken", "That web address is taken.");
      if (st.tenants.some((t) => t.slug === b.slug)) return err(409, "slug_taken", "That short address is taken.");
      const t: MockTenant = {
        id: crypto.randomUUID(),
        host: b.slug!,
        portalUrl: `http://${b.slug}.localhost:3000`,
        platformUrl: `http://${b.slug}.localhost:3000`,
        customDomain: null,
        name: b.name!,
        shortName: b.shortName!,
        slug: b.slug!,
        webAddress: b.webAddress!.toLowerCase(),
        googleDomain: b.googleDomain!.toLowerCase(),
        status: "SETTING_UP",
        createdAt: new Date().toISOString(),
        createdBy: { fullName: session ? sessionBody(session).user.fullName : "Chuka Obi" },
        branding: {
          primaryColor: primary,
          accentColor: normaliseHex(b.branding?.accentColor ?? "") ?? "#C27808",
          logoUrl: b.branding?.logoKey ? `/api/v1/dev/storage/${b.branding.logoKey}?sig=mock` : null,
          readabilityPassed: true,
        },
        firstAdmin: {
          fullName: b.firstAdmin!.fullName,
          email: b.firstAdmin!.email,
          invitedAt: new Date().toISOString(),
          accepted: false,
          acceptedAt: null,
        },
        nextSteps: [],
        students: 0,
        centres: 0,
      };
      st.tenants.push(t);
      audit(session, "TENANT_CREATED", `Created ${t.name}; invited ${t.firstAdmin!.fullName}`, t);
      return json(201, { ...detail(t) });
    }
    const one = path.match(/^\/platform\/tenants\/([^/]+)(\/resend-invitation)?$/);
    if (one) {
      const t = st.tenants.find((x) => x.id === one[1]);
      if (!t) return err(404, "not_found", "We could not find that university.");
      if (method === "GET" && !one[2]) return json(200, detail(t));
      if (method === "POST" && one[2]) {
        if (t.firstAdmin) t.firstAdmin.invitedAt = new Date().toISOString();
        audit(session, "INVITATION_RESENT", `Resent the invitation to ${t.firstAdmin?.fullName}`, t);
        return noContent();
      }
    }
    if (method === "GET" && path === "/platform/audit") {
      const tenantId = url.searchParams.get("tenantId");
      const page = Number(url.searchParams.get("page") ?? 0);
      const size = 20;
      const all = st.audit.filter((a) => !tenantId || a.tenant?.id === tenantId);
      return json(200, { items: all.slice(page * size, page * size + size), page, size, total: all.length });
    }
    return err(404, "not_found");
  }
}

function detail(t: MockTenant) {
  const { host: _host, students: _s, centres: _c, ...rest } = t;
  void _host;
  void _s;
  void _c;
  return { ...rest, nextSteps: nextStepsFor(t) };
}

export { PERSONAS, initials };
