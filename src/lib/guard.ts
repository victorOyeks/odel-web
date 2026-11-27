import "server-only";
import { redirect } from "next/navigation";
import { getContext, getSession } from "@/lib/api/server";
import { getPath, getSurface } from "@/lib/request";
import { signInPath, type Surface } from "@/lib/host";
import type { ApiResult } from "@/lib/api/result";
import type { PublicContext, Session } from "@/lib/types";
import { pathForStage } from "@/components/auth/routing";

/** For shell layouts: a signed-in session on the right surface, or a redirect to the right sign-in step. */
export async function requireSignedIn(): Promise<{ session: Session; ctx: PublicContext; surface: Surface }> {
  const surface = await getSurface();
  const path = await getPath();
  const [ctx, session] = await Promise.all([getContext(), getSession()]);
  if (!ctx.ok) throw new Error("context unavailable");
  if (!session) redirect(`${signInPath(surface)}?next=${encodeURIComponent(path)}`);
  if (session.stage !== "SIGNED_IN") redirect(pathForStage(session.stage, surface, path));
  return { session, ctx: ctx.data, surface };
}

/** For pages: a 401 from a data call means the session ended (idle timeout) — back to S-02. */
export async function expectSession<T>(result: ApiResult<T>): Promise<ApiResult<T>> {
  if (!result.ok && result.status === 401) {
    const surface = await getSurface();
    const path = await getPath();
    redirect(`${signInPath(surface)}?reason=idle&next=${encodeURIComponent(path)}`);
  }
  return result;
}
