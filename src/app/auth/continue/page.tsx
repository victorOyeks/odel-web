import { redirect } from "next/navigation";
import { getSession } from "@/lib/api/server";
import { getSurface } from "@/lib/request";
import { homePath, safeNext, signInPath } from "@/lib/host";
import { pathForStage } from "@/components/auth/routing";

/** The end of the Google sign-in chain: reads the session and routes by stage. */
export default async function ContinuePage({ searchParams }: PageProps<"/auth/continue">) {
  const sp = await searchParams;
  const surface = await getSurface();
  const next = safeNext(typeof sp.next === "string" ? sp.next : null, homePath(surface));
  const session = await getSession();
  if (!session) redirect(`${signInPath(surface)}?error=expired`);
  redirect(pathForStage(session.stage, surface, next));
}
