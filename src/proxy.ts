// Decides the surface by host. The console host serves the provider console,
// whose pages live under /console internally; university hosts serve the
// student web at / and the staff web at /staff.
import { NextResponse, type NextRequest } from "next/server";
import { browserHost, surfaceForHost } from "@/lib/host";

// Paths that are the same on every host.
const SHARED = [/^\/auth\/continue/, /^\/offline/, /^\/dev\//, /^\/pwa-icon/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/];

export function proxy(req: NextRequest) {
  const host = browserHost(req.headers);
  const surface = surfaceForHost(host);
  const { pathname } = req.nextUrl;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-odel-surface", surface);
  requestHeaders.set("x-odel-path", pathname + req.nextUrl.search);

  if (surface === "console") {
    if (!SHARED.some((re) => re.test(pathname)) && !pathname.startsWith("/console")) {
      const url = req.nextUrl.clone();
      url.pathname = `/console${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  } else if (pathname === "/console" || pathname.startsWith("/console/")) {
    // The provider console is not reachable from a university's address.
    const url = req.nextUrl.clone();
    url.pathname = "/_not-found";
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|mock/|fonts/|icons/).*)"],
};
