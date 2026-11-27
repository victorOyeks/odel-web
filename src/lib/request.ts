import "server-only";
import { headers } from "next/headers";
import { browserHost, surfaceForHost, type Surface } from "@/lib/host";

export async function getSurface(): Promise<Surface> {
  const h = await headers();
  return surfaceForHost(browserHost(h));
}

/** The browser-facing path of this request (set by src/proxy.ts). */
export async function getPath(): Promise<string> {
  const h = await headers();
  return h.get("x-odel-path") ?? "/";
}
