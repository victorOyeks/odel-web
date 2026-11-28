export type Surface = "console" | "university";

/** Extra console host for an environment whose console is not `console.<base>` (e.g. odel-console-dev.oyeksglobal.com). Set at build time. */
const CONSOLE_HOST = (process.env.NEXT_PUBLIC_ODEL_CONSOLE_HOST ?? "").toLowerCase();

/** `console.<base domain>` (and `console.localhost:3000` in dev), or NEXT_PUBLIC_ODEL_CONSOLE_HOST, is the provider console; every other host is a university. */
export function surfaceForHost(host: string | null | undefined): Surface {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
  if (CONSOLE_HOST && hostname === CONSOLE_HOST) return "console";
  return hostname.split(".")[0] === "console" ? "console" : "university";
}

/** The browser's host, as sent through any reverse proxy in front of Next.js. */
export function browserHost(h: Headers): string {
  return h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || "localhost:3000";
}

export function signInPath(surface: Surface): string {
  return surface === "console" ? "/sign-in" : "/staff/sign-in";
}

export function homePath(surface: Surface): string {
  return surface === "console" ? "/" : "/staff";
}

/** Only same-host absolute paths are allowed as a `next`/`returnTo` target. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * The `next` to put on a sign-in redirect: always a public path of this host. On the console the internal
 * `/console` prefix never leaks, and staff-web or sign-in paths (not pages of the console) become `/`.
 */
export function publicNext(path: string, surface: Surface): string {
  if (surface !== "console") return /^\/(staff\/)?sign-in(\/|\?|$)/.test(path) ? (path.startsWith("/staff") ? "/staff" : "/") : path;
  const p = path.replace(/^\/console(?=\/|\?|$)/, "") || "/";
  if (/^\/(staff(\/|\?|$)|sign-in(\/|\?|$))/.test(p)) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}
