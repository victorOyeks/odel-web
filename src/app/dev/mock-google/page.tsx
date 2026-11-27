import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MOCK_API } from "@/lib/config";
import { getContext } from "@/lib/api/server";
import { getSurface } from "@/lib/request";
import { homePath, safeNext } from "@/lib/host";
import { PERSONAS } from "@/lib/mock/data";
import { AuthLayout, AuthLead, AuthTitle } from "@/components/auth/auth-layout";

export const metadata: Metadata = { title: "Mock Google sign-in", robots: { index: false } };

/** Mock mode only: stands in for Google (like the API's dev stub) and lets you pick who signs in. */
export default async function MockGoogle({ searchParams }: PageProps<"/dev/mock-google">) {
  if (!MOCK_API) notFound();
  const sp = await searchParams;
  const surface = await getSurface();
  const ctx = await getContext();
  if (!ctx.ok) return null;
  const returnTo = safeNext(typeof sp.returnTo === "string" ? sp.returnTo : null, homePath(surface));
  const list = PERSONAS.filter((p) => p.surface === "both" || p.surface === surface);
  const link = (key: string, idle?: number) =>
    `/api/v1/dev/mock-sign-in?persona=${key}&returnTo=${encodeURIComponent(returnTo)}${idle ? `&idle=${idle}` : ""}`;
  return (
    <AuthLayout ctx={ctx.data} surface={surface}>
      <AuthTitle>Mock Google sign-in</AuthTitle>
      <AuthLead>Mock mode. Choose who signs in. Codes: any 6 digits except 000000.</AuthLead>
      <ul className="flex flex-col gap-3">
        {list.map((p) => (
          <li key={p.key} className="rounded-lg border border-line bg-surface">
            <a href={link(p.key)} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-subtle">
              <span className="text-label text-ink">{p.label}</span>
              <span className="text-body-sm text-ink-2">{p.description}</span>
            </a>
            {!p.error ? (
              <a href={link(p.key, 135)} className="block border-t border-line px-4 py-2 text-body-sm text-brand hover:bg-subtle">
                Same, with a 2-minute idle timeout (to see S-01)
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </AuthLayout>
  );
}
