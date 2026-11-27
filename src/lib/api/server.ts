import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { API_URL, MOCK_API } from "@/lib/config";
import { browserHost } from "@/lib/host";
import { mockHandle } from "@/lib/mock/handler";
import type { PublicContext, Session } from "@/lib/types";
import { NETWORK_ERROR, toResult, type ApiResult } from "./result";

/**
 * GET from the API during server rendering, forwarding the browser's cookies
 * and host. Server rendering only reads; every write goes through the
 * /api proxy from the browser so Set-Cookie reaches it.
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const h = await headers();
  const host = browserHost(h);
  const reqHeaders = new Headers({
    accept: "application/json",
    "x-odel-host": host,
  });
  const cookie = h.get("cookie");
  if (cookie) reqHeaders.set("cookie", cookie);
  const url = `/api/v1${path}`;
  try {
    const res = MOCK_API
      ? await mockHandle(new Request(`http://${host}${url}`, { headers: reqHeaders }), host)
      : await fetch(`${API_URL}${url}`, { headers: reqHeaders, cache: "no-store", redirect: "manual" });
    return await toResult<T>(res);
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
}

/** Branding for this host. Cached for the request so layout and pages share one call. */
export const getContext = cache(() => apiGet<PublicContext>("/public/context"));

/** The signed-in person, or null. Does not reset the idle clock. */
export const getSession = cache(async (): Promise<Session | null> => {
  const r = await apiGet<Session>("/session");
  return r.ok ? r.data : null;
});
