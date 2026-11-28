import type { Metadata } from "next";
import { apiGet, getContext } from "@/lib/api/server";
import { formatDate, formatWhen } from "@/lib/format";
import type { SlipVerification } from "@/lib/types-b2";
import { Logo } from "@/components/ui/logo";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";

export const metadata: Metadata = { title: "Verify a registration slip" };

/** Public slip check (no sign-in): the code printed on a registration slip, e.g. R7K2-9X1M. */
export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code.trim().toUpperCase() : "";
  const [ctx, res] = await Promise.all([getContext(), code ? apiGet<SlipVerification>(`/public/registration/verify/${encodeURIComponent(code)}`) : null]);
  if (!ctx.ok) return null;
  const t = ctx.data.tenant;
  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="bg-brand px-4 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Logo name={t.name} logoUrl={t.logoUrl} inverse className="h-10 w-11" />
          <div className="flex flex-col">
            <p className="text-label">{t.name}</p>
            <p className="text-body-sm">Registration slip check</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-h2 text-ink">Check a registration slip</h1>
          <p className="text-body-lg text-ink-2">Enter the code printed at the bottom of the slip. You see what the university holds, so you can compare it with the paper.</p>
        </div>
        <form method="get" action="/verify" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField label="Verification code" name="code" defaultValue={code} placeholder="e.g. R7K2-9X1M" autoComplete="off" autoCapitalize="characters" className="sm:max-w-xs" inputClassName="font-mono uppercase" />
          <Button type="submit" size="lg">
            Check slip
          </Button>
        </form>
        {res && !res.ok ? (
          <Banner tone="danger" title={res.status === 404 ? "No slip with this code" : "We could not check the slip"}>
            {res.status === 404 ? res.error.message ?? "We could not find a slip with this code. Check the code on the slip." : "Check your connection and try again in a minute."}
          </Banner>
        ) : null}
        {res?.ok ? (
          <section aria-labelledby="slip" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center gap-2">
              <Icon name="check_circle" size={24} className="text-success" />
              <h2 id="slip" className="text-h4 text-ink">
                Valid slip · {res.data.slipNumber}
              </h2>
            </div>
            <dl className="grid grid-cols-[minmax(120px,auto)_1fr] gap-x-6 gap-y-2 text-body">
              {[
                ["Student", res.data.studentName],
                ["Matric no.", res.data.matricNumber],
                ["Programme", res.data.programme],
                ["Semester", res.data.semester],
                ["Courses", `${res.data.courseCount} courses · ${res.data.totalUnits} units`],
                ["Submitted", formatWhen(res.data.submittedAt)],
                ["Latest version", res.data.updatedAt ? `Version ${res.data.slipVersion}, updated ${formatDate(res.data.updatedAt.slice(0, 10))}` : `Version ${res.data.slipVersion}`],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-2">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-body-sm text-ink-2">An older printout of this slip is out of date if its version is lower than the one above.</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
