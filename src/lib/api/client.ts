"use client";

import type { ApiError } from "@/lib/types";
import { NETWORK_ERROR, toResult, type ApiResult } from "./result";

export const ACTIVITY_EVENT = "odel:activity";

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-.]/g, "\\$&")}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function ensureXsrf(): Promise<string | null> {
  let token = readCookie("XSRF-TOKEN");
  if (!token) {
    // Any GET gives us the cookie; the public context is the cheapest.
    await fetch("/api/v1/public/context", { credentials: "same-origin" }).catch(() => undefined);
    token = readCookie("XSRF-TOKEN");
  }
  return token;
}

/**
 * Browser calls to the API through the same-origin /api proxy.
 * Adds the CSRF header on writes and tells the idle timer about activity.
 */
export async function api<T = void>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") {
    const token = await ensureXsrf();
    if (token) headers["x-xsrf-token"] = token;
  }
  try {
    const res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    if (!(method === "GET" && path === "/session") && res.status !== 401) {
      window.dispatchEvent(new Event(ACTIVITY_EVENT));
    }
    return await toResult<T>(res);
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }
}

export function messageOf(e: ApiError, fallback = "Something went wrong. Try again."): string {
  return e.message || fallback;
}
