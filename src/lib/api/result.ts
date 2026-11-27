import type { ApiError } from "@/lib/types";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: ApiError };

export const NETWORK_ERROR: ApiError = {
  error: "network",
  message: "Check your connection and try again. Your work is safe.",
};

export async function toResult<T>(res: Response): Promise<ApiResult<T>> {
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (res.ok) return { ok: true, status: res.status, data: body as T };
  const error =
    body && typeof body === "object" && "error" in body
      ? (body as ApiError)
      : { error: res.status === 404 ? "not_found" : "server", message: "Something went wrong on our side. Try again in a minute." };
  return { ok: false, status: res.status, error };
}
