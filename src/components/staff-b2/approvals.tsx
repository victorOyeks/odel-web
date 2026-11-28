"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDate, formatShort, formatWhen } from "@/lib/format";
import { REQUEST_TONE } from "@/lib/b2-labels";
import type { RegRequest } from "@/lib/types-b2";
import { useAction } from "@/lib/use-action";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { SkeletonLine } from "@/components/ui/skeleton";
import { AttachmentLink } from "@/components/registration/student";

/** GET /registration/requests/{id} answers {"request", "registration"} (the contract shows them merged): accept both. */
const detailOf = (d: RegRequest | { request: RegRequest; registration: RegRequest["registration"] }): RegRequest => ("request" in d && d.request ? { ...d.request, registration: d.registration } : (d as RegRequest));

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/** A-03 queue with A-03c detail: list on the left, the chosen request on the right (stacked on phones). */
export function Approvals({ items, selectedId, canDecide, notice }: { items: RegRequest[]; selectedId: string | null; canDecide: boolean; notice: string | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(selectedId ?? null);
  const [done, setDone] = useState<string | null>(notice);
  const select = (id: string | null) => {
    setSel(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("id", id);
    else u.searchParams.delete("id");
    window.history.replaceState(null, "", u);
  };
  return (
    <div className="flex flex-col gap-4">
      {done ? <Banner tone="success" title={done} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)] lg:items-start">
        <ul aria-label="Requests" className={cn("flex-col overflow-hidden rounded-lg border border-line bg-surface", sel ? "hidden lg:flex" : "flex")}>
          {items.map((r) => (
            <li key={r.id} className="border-b border-line last:border-0">
              <button type="button" onClick={() => select(r.id)} aria-current={sel === r.id ? "true" : undefined} className={cn("flex w-full items-start gap-3 p-4 text-left hover:bg-subtle", sel === r.id && "bg-brand-subtle")}>
                <Avatar initials={initials(r.student.fullName)} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-label text-ink">{r.student.fullName}</span>
                  <span className="truncate text-body-sm text-ink-2">
                    {r.kind === "LATE" ? `Late registration · ${r.reasonCategoryLabel ?? ""}` : r.change?.summary}
                  </span>
                  <span className="text-body-sm text-ink-3">
                    {formatShort(r.createdAt)} · {r.centre?.name ?? ""}
                    {r.centre && !r.centre.hasCoordinator ? " · no coordinator" : ""}
                  </span>
                </span>
                {r.status !== "PENDING" ? <Badge tone={REQUEST_TONE[r.status]}>{r.statusLabel}</Badge> : null}
              </button>
            </li>
          ))}
        </ul>
        <div className={cn(sel ? "flex" : "hidden lg:flex", "min-w-0 flex-col")}>
          {sel ? (
            <Detail
              key={sel}
              id={sel}
              canDecide={canDecide}
              onBack={() => select(null)}
              onDecided={(msg) => {
                setDone(msg);
                select(null);
                router.refresh();
              }}
            />
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-6 text-center text-body text-ink-2">
              <Icon name="fact_check" size={32} className="text-icon-2" />
              Choose a request to see the reason, the courses and the attachment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ id, canDecide, onBack, onDecided }: { id: string; canDecide: boolean; onBack: () => void; onDecided: (msg: string) => void }) {
  const [r, setR] = useState<RegRequest | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [declining, setDeclining] = useState(false);
  const act = useAction();

  useEffect(() => {
    let alive = true;
    api<RegRequest | { request: RegRequest; registration: RegRequest["registration"] }>("GET", `/registration/requests/${id}`).then((x) => {
      if (!alive) return;
      if (x.ok) setR(detailOf(x.data));
      else setFailed(x.error.message ?? "We could not load this request.");
    });
    return () => {
      alive = false;
    };
  }, [id]);

  async function decide(what: "approve" | "decline") {
    if (!r) return;
    const res = await act.run<RegRequest>(what, "POST", `/registration/requests/${r.id}/${what}`, { note: note.trim() || null });
    if (res.ok) {
      setDeclining(false);
      onDecided(`${what === "approve" ? "Approved" : "Declined"} ${r.student.fullName}'s ${r.kind === "LATE" ? "late registration" : "course change"}. ${r.student.fullName.split(" ")[0]} gets an email${what === "approve" && r.kind === "CHANGE" ? " and a new slip" : ""}.`);
    } else if (res.error.error === "not_pending") {
      const fresh = await api<RegRequest | { request: RegRequest; registration: RegRequest["registration"] }>("GET", `/registration/requests/${r.id}`);
      if (fresh.ok) setR(detailOf(fresh.data));
    }
  }

  const back = (
    <button type="button" onClick={onBack} className="inline-flex min-h-12 w-fit items-center gap-1 font-semibold text-brand lg:hidden">
      <Icon name="arrow_back" /> All requests
    </button>
  );
  if (failed)
    return (
      <div className="flex flex-col gap-3">
        {back}
        <Banner tone="danger" title="Could not load this request">
          {failed} Go back to the list and try again.
        </Banner>
      </div>
    );
  if (!r)
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
        <span className="sr-only">Loading the request</span>
        <SkeletonLine className="w-1/2" />
        <SkeletonLine className="h-16 w-full" />
        <SkeletonLine className="h-24 w-full" />
      </div>
    );
  const ch = r.change;
  const first = r.student.fullName.split(" ")[0];
  return (
    <section aria-labelledby="req-title" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      {back}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="req-title" className="text-h3 text-ink">
            {r.kind === "LATE" ? "Late registration" : "Course change"} · {r.student.fullName}
          </h2>
          <p className="text-body-sm text-ink-2">
            {r.student.matricNumber} · {r.student.programme} · {r.student.levelLabel}
            {r.registeredOn ? ` · registered ${formatDate(r.registeredOn, false)}` : ""} · {r.centre?.name}
          </p>
        </div>
        <Badge tone={REQUEST_TONE[r.status]}>{r.status === "PENDING" ? "Waiting for you" : r.statusLabel}</Badge>
      </div>
      {r.centre && !r.centre.hasCoordinator ? <Banner tone="info" title="No coordinator at this centre">The ODeL office decides requests from {r.centre.name} this session.</Banner> : null}
      <div className="flex flex-col gap-1 rounded-md bg-subtle p-3">
        <p className="text-label-sm text-ink-2">Reason{r.reasonCategoryLabel ? `: ${r.reasonCategoryLabel}` : ""}</p>
        <p className="text-body text-ink">“{r.reason}”</p>
        <p className="text-body-sm text-ink-3">Sent {formatWhen(r.createdAt)}</p>
      </div>
      {r.attachment ? (
        <div className="flex flex-col gap-1">
          <p className="text-label text-ink">Attachment</p>
          <AttachmentLink path={`/registration/requests/${r.id}/attachment`} name={`${r.attachment.fileName} · ${r.attachment.type} · ${r.attachment.sizeLabel}`} />
        </div>
      ) : r.kind === "LATE" ? (
        <p className="text-body-sm text-ink-2">No document attached.</p>
      ) : null}
      {ch ? (
        <Banner tone="info" title={ch.summary}>
          If you approve, {ch.drop.map((c) => `${c.code} ${c.title} (${c.units} units)`).join(", ") || "nothing"} is dropped and {ch.add.map((c) => `${c.code} ${c.title} (${c.units} units)`).join(", ") || "nothing"} is added: {ch.unitsBefore} → {ch.unitsAfter} of {ch.maxUnits} units. {first} gets an email and a new slip.
        </Banner>
      ) : r.status === "PENDING" ? (
        <Banner tone="info" title="If you approve">
          {first} can register until {r.registerBy ? formatDate(r.registerBy) : "the late registration closing date (or three days from today if that has passed)"} and gets an email saying so.
        </Banner>
      ) : null}
      {r.registration ? (
        <details className="text-body">
          <summary className="min-h-12 cursor-pointer py-2 font-semibold text-brand md:min-h-0">
            Current registration · {r.registration.courseCount} courses · {r.registration.totalUnits} units
          </summary>
          <ul className="flex flex-col gap-1 pt-2">
            {r.registration.courses.map((c) => (
              <li key={c.courseId} className="text-ink">
                <span className="font-mono">{c.code}</span> {c.title} · {c.units} u · {c.kindLabel ?? c.kind}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {r.decision ? (
        <Banner tone={r.status === "APPROVED" ? "success" : "danger"} title={`${r.statusLabel} by ${r.decision.by} · ${formatWhen(r.decision.at)}`}>
          {r.decision.note ? `“${r.decision.note}”` : null}
        </Banner>
      ) : null}
      {act.error && !declining ? <Banner tone="danger" title="That did not work">{act.error.message}</Banner> : null}
      {r.status === "PENDING" && canDecide ? (
        <>
          <TextArea label="Note to the student (optional if you approve)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Write a short note the student will see…" hint={`${note.length} / 500`} />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDeclining(true)}>
              Decline
            </Button>
            <Button leadingIcon="check" loading={act.busy === "approve"} onClick={() => decide("approve")}>
              Approve
            </Button>
          </div>
        </>
      ) : r.status === "PENDING" ? (
        <p className="text-body-sm text-ink-2">Only the centre coordinator or an ODeL admin can decide this request.</p>
      ) : null}
      <Panel
        open={declining}
        width="sm"
        onClose={() => setDeclining(false)}
        title={r.kind === "LATE" ? `Decline ${first}'s late registration?` : `Decline ${first}'s course change?`}
        description={r.kind === "LATE" ? `${r.student.fullName} can ask again with what you ask for.` : `${r.student.fullName} keeps the current courses${ch ? ` (${ch.summary.toLowerCase()} will not happen)` : ""}.`}
        onSubmit={() => {
          if (note.trim().length < 5) return act.setFields({ note: "Write a short note (5 to 500 characters): tell the student what to do next." });
          decide("decline");
        }}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={act.busy === "decline"}>
              Decline
            </Button>
          </>
        }
      >
        {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not declined">{act.error.message}</Banner> : null}
        <TextArea
          label="Note to the student (required)"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder={r.kind === "LATE" ? "The discharge letter photo is not readable. Please upload a clearer photo or PDF." : "STA 201 is full at Akure this semester. Choose another elective."}
          hint={`${note.trim().length} / 500`}
          error={act.fields.note}
          autoFocus
        />
      </Panel>
    </section>
  );
}
