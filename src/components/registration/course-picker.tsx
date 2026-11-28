"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { RegCheck, RegCourse, RegCourses, Registration } from "@/lib/types-b2";
import type { ApiError } from "@/lib/types";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, TextArea } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";

const kindLabel = (c: RegCourse) => c.kindLabel ?? (c.kind === "CARRY_OVER" ? "Carry-over" : c.kind === "ELECTIVE" ? "Elective" : "Core");

function CourseLine({ c, checked, onToggle, disabled }: { c: RegCourse; checked: boolean; onToggle?: () => void; disabled?: boolean }) {
  const locked = !onToggle;
  const inner = (
    <>
      {locked ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded bg-subtle text-icon-2">
          <Icon name="lock" size={16} />
          <span className="sr-only">Included, cannot be removed</span>
        </span>
      ) : (
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} className="size-5 shrink-0 accent-[var(--brand)]" />
      )}
      <span className="w-[68px] shrink-0 font-mono text-body-sm text-ink-2">{c.code}</span>
      <span className="min-w-0 flex-1 text-label text-ink">
        {c.title}
        {c.kind === "CARRY_OVER" ? <span className="block text-body-sm font-normal text-ink-2">Carry-over{c.fromSession ? ` from ${c.fromSession}` : ""}</span> : null}
      </span>
      <span className="shrink-0 text-body text-ink-2">{c.units} u</span>
    </>
  );
  const cls = cn("flex min-h-12 items-center gap-3 rounded-md border bg-surface px-3 py-2.5", checked && !locked ? "border-brand bg-brand-subtle" : "border-line");
  return <li>{locked ? <div className={cls}>{inner}</div> : <label className={cn(cls, "cursor-pointer")}>{inner}</label>}</li>;
}

/** Live unit counter from POST /registration/me/check ("18 · min 15 · max 20"), debounced. */
function useCheck(semesterId: string, electiveIds: string[]) {
  const [check, setCheck] = useState<RegCheck | null>(null);
  const [failed, setFailed] = useState(false);
  const key = electiveIds.slice().sort().join(",");
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = window.setTimeout(async () => {
      const r = await api<RegCheck>("POST", "/registration/me/check", { semesterId, electiveIds: key ? key.split(",") : [] });
      if (n !== seq.current) return;
      if (r.ok) {
        setCheck(r.data);
        setFailed(false);
      } else setFailed(true);
    }, 200);
    return () => window.clearTimeout(t);
  }, [semesterId, key]);
  return { check, failed };
}

function Summary({ check, failed, limits, children, title }: { check: RegCheck | null; failed: boolean; limits: RegCourses["limits"]; children: React.ReactNode; title: string }) {
  const pct = check ? Math.min(100, (check.totalUnits / limits.maxUnits) * 100) : 0;
  const over = check?.problems.some((p) => p.code === "over_max" || p.code === "rules_conflict");
  return (
    <aside aria-label={title} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-24">
      <h2 className="text-h4 text-ink">{title}</h2>
      <div className="flex items-baseline justify-between gap-2" aria-live="polite">
        <span className="text-body text-ink-2">Units</span>
        <span className="text-label-lg text-ink">{check ? check.counter : `… · min ${limits.minUnits} · max ${limits.maxUnits}`}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="presentation">
        <div className={cn("h-2 rounded-full", over ? "bg-danger" : check?.ok ? "bg-brand" : "bg-warning")} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-body text-ink-2">Courses</span>
        <span className="text-label-lg text-ink">{check?.courseCount ?? "…"}</span>
      </div>
      {failed ? <p className="text-body-sm text-danger">We could not check your choice. Check your connection; we try again when you change a course.</p> : null}
      {check?.problems.map((p) => (
        <p key={p.code} role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle p-3 text-body text-ink">
          <Icon name="error" className="mt-0.5 text-danger" />
          <span>{p.message}</span>
        </p>
      ))}
      {children}
    </aside>
  );
}

/** R-02 / R-02b choose courses, R-03 / R-03b over or under the limit, R-04 review and submit (confirm: true). */
export function CoursePicker({ data }: { data: RegCourses }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(() => data.electives.filter((e) => e.selected).map((e) => e.courseId));
  const [step, setStep] = useState<"choose" | "review">("choose");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<(ApiError & { payPath?: string }) | null>(null);
  const { check, failed } = useCheck(data.semester.id, selected);
  const locked = [...data.compulsory, ...data.carryOvers];
  const chosen = data.electives.filter((e) => selected.includes(e.courseId));
  const atMax = selected.length >= data.limits.maxElectives;

  async function submit() {
    if (!confirm) return setError({ error: "confirm_required", message: "Tick the box to confirm these are your courses." });
    setBusy(true);
    setError(null);
    const r = await api<Registration>("POST", "/registration/me/submit", { semesterId: data.semester.id, electiveIds: selected, confirm: true });
    setBusy(false);
    if (r.ok) {
      router.replace("/registration?done=1");
      router.refresh();
      return;
    }
    if (r.status === 401) return hardNavigate("/sign-in?reason=idle&next=%2Fregistration");
    setError(r.error as ApiError & { payPath?: string });
    if (r.error.error === "invalid") setStep("choose");
  }

  const errorBanner = error ? (
    <Banner tone="danger" title={error.error === "fee_not_paid" ? "Pay the platform fee first" : error.error === "already_registered" ? "Already registered" : "Not submitted"}>
      {error.message}{" "}
      {error.payPath ? (
        <Link href={error.payPath} className="font-semibold text-brand underline-offset-4 hover:underline">
          Pay now
        </Link>
      ) : error.error === "already_registered" ? (
        <Link href="/registration" className="font-semibold text-brand underline-offset-4 hover:underline" onClick={() => router.refresh()}>
          See my registration
        </Link>
      ) : null}
    </Banner>
  ) : null;

  if (step === "review") {
    const all = [...locked, ...chosen];
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h2 text-ink">Review your registration</h1>
            <p className="text-body text-ink-2">Step 2 of 2 · {data.subtitle}</p>
          </div>
          {errorBanner}
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
            {all.map((c) => (
              <li key={c.courseId} className="flex items-center gap-3 px-4 py-3">
                <span className="w-[68px] shrink-0 font-mono text-body-sm text-ink-2">{c.code}</span>
                <span className="min-w-0 flex-1 text-label text-ink">{c.title}</span>
                <span className="hidden text-body-sm text-ink-2 sm:inline">{kindLabel(c)}</span>
                <span className="shrink-0 text-body text-ink">{c.units} u</span>
              </li>
            ))}
            <li className="flex items-center justify-between px-4 py-3 text-label-lg text-ink">
              <span>Total</span>
              <span>
                {all.length} courses · {check?.totalUnits ?? all.reduce((a, c) => a + c.units, 0)} units
              </span>
            </li>
          </ul>
          <Checkbox
            label={`These are my courses for ${data.semester.label}.`}
            hint="After you submit, a change needs your centre coordinator's approval."
            checked={confirm}
            onChange={(e) => {
              setConfirm(e.target.checked);
              if (error?.error === "confirm_required") setError(null);
            }}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <Button variant="ghost" size="lg" leadingIcon="arrow_back" onClick={() => setStep("choose")}>
              Change my choice
            </Button>
            <Button size="lg" loading={busy} onClick={submit} disabled={!check?.ok}>
              Submit registration
            </Button>
          </div>
        </div>
        <Summary check={check} failed={failed} limits={data.limits} title="Your registration">
          <p className="text-body-sm text-ink-2">You get a registration slip (PDF) as soon as you submit.</p>
        </Summary>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 text-ink">Register {data.semester.name.toLowerCase()} courses</h1>
          <p className="text-body text-ink-2">Step 1 of 2 · {data.subtitle}</p>
        </div>
        {errorBanner}
        {locked.length ? (
          <section aria-labelledby="locked" className="flex flex-col gap-2">
            <h2 id="locked" className="text-overline text-ink-2 uppercase">
              Already included · cannot be removed
            </h2>
            <ul className="flex flex-col gap-2">
              {locked.map((c) => (
                <CourseLine key={c.courseId} c={c} checked />
              ))}
            </ul>
            {data.carryOvers.length ? <p className="text-body-sm text-ink-2">Carry-over courses always count towards the maximum.</p> : null}
          </section>
        ) : null}
        <section aria-labelledby="electives" className="flex flex-col gap-2">
          <h2 id="electives" className="text-overline text-ink-2 uppercase">
            Electives · choose up to {data.limits.maxElectives}
          </h2>
          {data.electives.length ? (
            <ul className="flex flex-col gap-2">
              {data.electives.map((c) => {
                const on = selected.includes(c.courseId);
                return <CourseLine key={c.courseId} c={c} checked={on} disabled={!on && atMax} onToggle={() => setSelected((s) => (on ? s.filter((x) => x !== c.courseId) : [...s, c.courseId]))} />;
              })}
            </ul>
          ) : (
            <p className="text-body text-ink-2">Your programme has no electives this semester.</p>
          )}
          {atMax && data.electives.length > selected.length ? <p className="text-body-sm text-ink-2">You have chosen {data.limits.maxElectives}, the most allowed. Untick one to pick another.</p> : null}
        </section>
      </div>
      <Summary check={check} failed={failed} limits={data.limits} title="Your registration">
        <Button size="lg" block disabled={!check?.ok} onClick={() => setStep("review")}>
          Review registration
        </Button>
        <p className="text-body-sm text-ink-2">Changes after submitting need coordinator approval.</p>
      </Summary>
    </div>
  );
}

/** R-09 / R-09b ask to change courses: untick electives to drop, tick others to add; the result must keep the limits. */
export function ChangePicker({ data, registration }: { data: RegCourses; registration: Registration }) {
  const router = useRouter();
  const initial = useMemo(() => registration.courses.filter((c) => c.kind === "ELECTIVE").map((c) => c.courseId), [registration]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const { check, failed } = useCheck(data.semester.id, selected);
  const drop = initial.filter((id) => !selected.includes(id));
  const add = selected.filter((id) => !initial.includes(id));
  const name = (id: string) => data.electives.find((e) => e.courseId === id)?.code ?? registration.courses.find((c) => c.courseId === id)?.code ?? "";
  const summary = [drop.length ? `Drop ${drop.map(name).join(", ")}` : "", add.length ? `add ${add.map(name).join(", ")}` : ""].filter(Boolean).join(", ");
  const locked = [...data.compulsory, ...data.carryOvers];

  async function send() {
    setBusy(true);
    setError(null);
    const r = await api("POST", "/registration/me/change-requests", { registrationId: registration.id, dropCourseIds: drop, addCourseIds: add, reason: reason.trim() });
    setBusy(false);
    if (r.ok) {
      router.push("/registration?sent=change");
      router.refresh();
      return;
    }
    if (r.status === 401) return hardNavigate("/sign-in?reason=idle&next=%2Fregistration%2Fchange");
    setError(r.error);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 text-ink">Ask to change your courses</h1>
          <p className="text-body text-ink-2">
            {data.semester.label} · slip {registration.slipNumber} · changes close {formatDate(registration.changesCloseOn)}
          </p>
        </div>
        <Banner tone="info" title="Your centre coordinator decides">
          Untick an elective to drop it, tick another to add it. Compulsory and carry-over courses stay. Your registration changes only when the change is approved; we email you either way.
        </Banner>
        {error ? (
          <Banner tone="danger" title="Not sent">
            {error.message}
          </Banner>
        ) : null}
        <section aria-labelledby="keep" className="flex flex-col gap-2">
          <h2 id="keep" className="text-overline text-ink-2 uppercase">
            Staying · cannot be dropped
          </h2>
          <ul className="flex flex-col gap-2">
            {locked.map((c) => (
              <CourseLine key={c.courseId} c={c} checked />
            ))}
          </ul>
        </section>
        <section aria-labelledby="el" className="flex flex-col gap-2">
          <h2 id="el" className="text-overline text-ink-2 uppercase">
            Electives · up to {data.limits.maxElectives}
          </h2>
          <ul className="flex flex-col gap-2">
            {data.electives.map((c) => {
              const on = selected.includes(c.courseId);
              return <CourseLine key={c.courseId} c={c} checked={on} disabled={!on && selected.length >= data.limits.maxElectives} onToggle={() => setSelected((s) => (on ? s.filter((x) => x !== c.courseId) : [...s, c.courseId]))} />;
            })}
          </ul>
        </section>
        <TextArea
          label="Why do you want this change?"
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          placeholder="MTH 211 clashes with my work shifts; CSC 211 has weekend classes."
          hint={`Your coordinator reads this. ${reason.trim().length} / 1000 (at least 10)`}
          error={error?.fields?.reason}
        />
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button type="button" variant="ghost" size="lg" onClick={() => router.push("/registration")}>
            Cancel
          </Button>
          <Button type="submit" size="lg" loading={busy} disabled={!check?.ok || (!drop.length && !add.length) || reason.trim().length < 10}>
            Send for approval
          </Button>
        </div>
      </form>
      <Summary check={check} failed={failed} limits={data.limits} title="After the change">
        <p className="text-body text-ink">{summary ? summary.charAt(0).toUpperCase() + summary.slice(1) : "Nothing changed yet."}</p>
        <p className="text-body-sm text-ink-2">
          Now: {registration.courseCount} courses · {registration.totalUnits} units
        </p>
      </Summary>
    </div>
  );
}
