// Same-origin proxy: the browser only talks to this host; we forward /api/* to
// the Spring Boot API with the browser's host in X-Odel-Host. Redirects and
// Set-Cookie headers pass through untouched so the Google sign-in chain and
// the session cookie stay first-party.
import type { NextRequest } from "next/server";
import { API_URL, MOCK_API } from "@/lib/config";
import { browserHost } from "@/lib/host";
import { mockHandle } from "@/lib/mock/handler";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function forward(req: NextRequest): Promise<Response> {
  const host = browserHost(req.headers);
  if (MOCK_API) return mockHandle(req, host);

  const target = `${API_URL}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("x-odel-host", host);
  headers.set("x-forwarded-host", host);
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: "api_unreachable", message: "The portal cannot reach its server right now. Try again in a minute." },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "set-cookie" || HOP_BY_HOP.has(k) || k === "content-encoding") return;
    out.set(key, value);
  });
  // Set-Cookie may repeat; Headers.forEach would merge them.
  for (const c of upstream.headers.getSetCookie()) out.append("set-cookie", c);

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const HEAD = forward;
