import { getContext } from "@/lib/api/server";
import { OpensSoon } from "@/components/student/opens-soon";

/** Student web home. B0: holding page; sign-in and activation arrive in B1. */
export default async function StudentHome() {
  const ctx = await getContext();
  if (!ctx.ok) return null;
  return <OpensSoon tenant={ctx.data.tenant} />;
}
