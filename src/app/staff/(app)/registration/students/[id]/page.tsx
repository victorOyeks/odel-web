import type { Metadata } from "next";
import Link from "next/link";
import { apiGet } from "@/lib/api/server";
import { expectSession } from "@/lib/guard";
import { formatDate, formatWhen } from "@/lib/format";
import type { RegStudent } from "@/lib/types-b2";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, LoadFailed } from "@/components/staff/load-state";
import { DownloadLink } from "@/components/staff-b2/bits";
import { REQUEST_TONE } from "@/lib/b2-labels";

export const metadata: Metadata = { title: "Student registration" };

const progName = (p: RegStudent["student"]["programme"]) => (typeof p === "string" ? p : p?.name ?? "");

/** A-07b One student's registration: courses as on the slip, slip number and history, requests, carry-overs, Download slip. */
export default async function StudentRegistrationPage({ params }: PageProps<"/staff/registration/students/[id]">) {
  const { id } = await params;
  const res = await apiGet<RegStudent>(`/registration/students/${encodeURIComponent(id)}`).then(expectSession);
  if (!res.ok) return <LoadFailed result={res} what="this student's registration" />;
  const { student: st, registration: reg, requests, carryOvers } = res.data;
  return (
    <>
      <Link href="/staff/registration" className="inline-flex min-h-12 w-fit items-center font-semibold text-brand hover:underline md:min-h-0">
        ← Registrations
      </Link>
      <PageHeader
        title={st.fullName}
        subtitle={[st.matricNumber, `${progName(st.programme)}${st.levelLabel ? ` · ${st.levelLabel}` : ""}`, st.centre?.name].filter(Boolean).join(" · ")}
        actions={
          <Link href={`/staff/payments/students/${st.id}`} className="inline-flex min-h-12 items-center font-semibold text-brand hover:underline md:min-h-10">
            Payment record
          </Link>
        }
      />
      {reg ? (
        <Card
          title={`${reg.semester.label} · ${reg.courseCount} courses · ${reg.totalUnits} units`}
          actions={<DownloadLink href={`/api/v1/registration/registrations/${reg.id}/slip.pdf`}>Download slip</DownloadLink>}
        >
          <p className="text-body text-ink-2">
            Slip <span className="font-mono">{reg.slipNumber}</span> (version {reg.slipVersion}) · code <span className="font-mono">{reg.verificationCode}</span> · submitted {formatWhen(reg.submittedAt)}
            {reg.late ? " · late registration" : ""}
          </p>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {reg.courses.map((c) => (
              <li key={c.courseId} className="flex items-center gap-3 px-3 py-2.5 text-body">
                <span className="w-[68px] shrink-0 font-mono text-body-sm text-ink-2">{c.code}</span>
                <span className="min-w-0 flex-1 text-ink">{c.title}</span>
                <span className="hidden text-body-sm text-ink-2 sm:inline">{c.kindLabel ?? c.kind}</span>
                <span className="text-ink">{c.units} u</span>
              </li>
            ))}
          </ul>
          {reg.history?.length ? (
            <>
              <h3 className="text-overline text-ink-3 uppercase">History</h3>
              <ol className="flex flex-col gap-2 text-body">
                {reg.history.map((h, i) => (
                  <li key={i} className="flex flex-col">
                    <span className="text-ink">{h.summary}</span>
                    <span className="text-body-sm text-ink-2">
                      {formatWhen(h.at)}
                      {h.by ? ` · ${h.by}` : ""} · slip version {h.slipVersion}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </Card>
      ) : (
        <Card title="Not registered this semester">
          <p className="text-body text-ink-2">The student has not submitted a registration. Check their fee on the payment record.</p>
        </Card>
      )}
      <Card title="Requests">
        {requests.length ? (
          <ul className="flex flex-col gap-2">
            {requests.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-3 text-body">
                <span className="min-w-0 flex-1 text-ink">
                  {q.kind === "LATE" ? "Late registration" : `Course change · ${q.change?.summary ?? ""}`}
                  <span className="block text-body-sm text-ink-2">
                    {formatWhen(q.createdAt)}
                    {q.decision ? ` · ${q.status.toLowerCase()} by ${q.decision.by}` : ""}
                    {q.registerBy ? ` · register by ${formatDate(q.registerBy)}` : ""}
                  </span>
                </span>
                <Badge tone={REQUEST_TONE[q.status]}>{q.statusLabel}</Badge>
                {q.status === "PENDING" ? (
                  <Link href={`/staff/registration/requests?id=${q.id}`} className="font-semibold text-brand hover:underline">
                    Decide
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-2">No late or change requests.</p>
        )}
      </Card>
      <Card title="Carry-overs">
        {carryOvers.length ? (
          <ul className="flex flex-col gap-1 text-body">
            {carryOvers.map((c) => (
              <li key={c.id} className="text-ink">
                <span className="font-mono">{c.code}</span> {c.title} · {c.units} units · from {c.fromSession} · {c.status === "OPEN" ? "open" : "cleared"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-2">None.</p>
        )}
      </Card>
    </>
  );
}
