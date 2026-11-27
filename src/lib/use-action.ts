"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import type { ApiError } from "@/lib/types";
import type { UploadTicket } from "@/lib/types-b1";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Writes from staff forms: tracks which action is busy, the message for the form and the per-field messages
 * (`fields` from a 400). A 401 means the session ended: back to sign-in with the S-02 message.
 */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const reset = useCallback(() => {
    setError(null);
    setFields({});
  }, []);

  const run = useCallback(async <T = void>(key: string, method: Method, path: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError; status: number }> => {
    setBusy(key);
    setError(null);
    setFields({});
    const r = await api<T>(method, path, body);
    setBusy(null);
    if (r.ok) return { ok: true, data: r.data };
    if (r.status === 401) {
      const here = window.location.pathname + window.location.search;
      hardNavigate(`${here.startsWith("/staff") ? "/staff/sign-in" : "/sign-in"}?reason=idle&next=${encodeURIComponent(here)}`);
    }
    setError(r.error);
    setFields(r.error.fields ?? {});
    return { ok: false, error: r.error, status: r.status };
  }, []);

  return { busy, error, fields, run, reset, setError, setFields };
}

/** Browser → the presigned link. Returns the storage key, or a message that says what to do. */
export async function uploadFile(ticketPath: string, file: File): Promise<{ ok: true; key: string } | { ok: false; message: string; field?: string }> {
  const t = await api<UploadTicket>("POST", ticketPath, { fileName: file.name, contentType: file.type || "text/csv", size: file.size });
  if (!t.ok) return { ok: false, message: t.error.fields?.file ?? t.error.message ?? "We could not start the upload. Try again." };
  try {
    // uploadUrl is opaque: relative in dev (through our /api proxy), absolute R2 in production.
    const put = await fetch(t.data.uploadUrl, { method: t.data.method ?? "PUT", headers: t.data.headers, body: file });
    if (!put.ok) throw new Error(String(put.status));
  } catch {
    return { ok: false, message: "The upload did not finish. Check your connection and try again." };
  }
  return { ok: true, key: t.data.key };
}

export const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-NG");
export const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;
