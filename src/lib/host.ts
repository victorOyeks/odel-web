export type Surface = "console" | "university";

/** `console.<base domain>` (and `console.localhost:3000` in dev) is the provider console; every other host is a university. */
export function surfaceForHost(host: string | null | undefined): Surface {
  const hostname = (host ?? "").split(":")[0].toLowerCase();
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
