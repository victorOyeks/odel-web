"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import type { CopyResult, PersonRef, StaffOption, Staffing, StaffingCentre, StaffingCourse } from "@/lib/types-b1";
import { plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, SelectField } from "@/components/ui/fields";
import { ChipLinks } from "@/components/ui/nav-bits";
import { Panel } from "@/components/ui/panel";
import { EmptyCard } from "@/components/staff/load-state";

function Who({ p, missing }: { p: PersonRef | null; missing: string }) {
  if (!p) return <span className="font-semibold text-danger">{missing}</span>;
  if (p.status === "SUSPENDED") return <span className="text-danger">{p.fullName} (suspended)</span>;
  return <span>{p.fullName}{p.status === "INVITED" ? <span className="text-ink-2"> (invited)</span> : null}</span>;
}

function facilitatorSummary(c: StaffingCourse) {
  const f = c.facilitators;
  if (!f.length) return <span className="text-ink-2">—</span>;
  const suspended = f.find((x) => x.user.status === "SUSPENDED");
  if (suspended) return <span className="text-danger">{suspended.user.fullName} (suspended){f.length > 1 ? ` + ${f.length - 1} more` : ""}</span>;
  return f.length === 1 ? f[0].user.fullName : f.length <= 3 ? `${f[0].user.fullName} + ${f.length - 1} more` : `${f.length} facilitators`;
}

export function StaffingView({ staffing, tab }: { staffing: Staffing; tab: "courses" | "centres" }) {
  const router = useRouter();
  const [course, setCourse] = useState<StaffingCourse | null>(null);
  const [centre, setCentre] = useState<StaffingCentre | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copied, setCopied] = useState<CopyResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const copy = useAction();

  async function doCopy() {
    const r = await copy.run<CopyResult>("copy", "POST", "/academic/staffing/copy", { toSessionId: null, fromSessionId: null });
    if (r.ok) {
      setCopied(r.data);
      router.refresh();
    }
  }

  const s = staffing.session;
  if (!s) {
    return (
      <>
        <PageHeader title="Staffing" subtitle="Who teaches each course this session, and who supports each centre." />
        <EmptyCard title="Create a session first" icon="calendar_today" action={<ButtonLink href="/staff/academic-setup/sessions">Go to sessions</ButtonLink>}>
          Staffing belongs to a session. Add 2026/2027 (or the session you are setting up), then come back here.
        </EmptyCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Staffing"
        subtitle={`Who teaches each course in ${s.name}, and who supports each centre.`}
        actions={
          <Button variant="secondary" leadingIcon="content_copy" onClick={() => { setCopied(null); copy.reset(); setCopyOpen(true); }}>
            Copy from last session
          </Button>
        }
      />
      {!staffing.studentsImported ? (
        <Banner tone="info" title={`No students imported yet for ${s.name} · ${plural(staffing.centres.length, "centre")}`}>
          Facilitators are set per centre once you know where students are. You can choose them now and change them after the import.
        </Banner>
      ) : null}
      {notice ? <Banner tone="success" title={notice} /> : null}
      <ChipLinks
        label="Show"
        active={tab}
        chips={[
          { key: "courses", label: `Courses (${staffing.needLecturer} need a lecturer)`, href: "/staff/academic-setup/staffing" },
          { key: "centres", label: `Centres (${staffing.needCoordinator} need a coordinator)`, href: "/staff/academic-setup/staffing?tab=centres" },
        ]}
      />
      {tab === "courses" ? (
        staffing.courses.length ? (
          <DataTable
            caption={`Who teaches each course in ${s.name}`}
            rows={staffing.courses}
            rowKey={(c) => c.course.id}
            columns={[
              { header: "Course", cell: (c) => `${c.course.code} · ${c.course.title}` },
              { header: "Lecturer", cell: (c) => <Who p={c.lecturer} missing="Needs a lecturer" /> },
              { header: "Facilitators", cell: facilitatorSummary },
              { header: "Exam officer", cell: (c) => (c.examOfficer ? <Who p={c.examOfficer} missing="" /> : <span className="text-ink-2">—</span>) },
            ]}
            rowAction={(c) => (
              <Button variant="ghost" size="sm" onClick={() => setCourse(c)} aria-label={`${c.needsLecturer ? "Assign" : "Edit"} staff for ${c.course.code}`}>
                {c.needsLecturer ? "Assign" : "Edit"}
              </Button>
            )}
          />
        ) : (
          <EmptyCard title="No courses yet" icon="menu_book" action={<ButtonLink href="/staff/courses">Go to the catalogue</ButtonLink>}>
            Add courses to the catalogue first, then choose who teaches them here.
          </EmptyCard>
        )
      ) : staffing.centres.length ? (
        <DataTable
          caption={`Who coordinates each centre in ${s.name}`}
          rows={staffing.centres}
          rowKey={(c) => c.centre.id}
          columns={[
            { header: "Centre", cell: (c) => c.centre.name },
            { header: "Coordinator", cell: (c) => <Who p={c.coordinator} missing="Needs a coordinator" /> },
            { header: "Students", cell: (c) => c.students.toLocaleString("en-NG"), numeric: true },
          ]}
          rowAction={(c) => (
            <Button variant="ghost" size="sm" onClick={() => setCentre(c)} aria-label={`${c.needsCoordinator ? "Assign" : "Edit"} coordinator for ${c.centre.name}`}>
              {c.needsCoordinator ? "Assign" : "Edit"}
            </Button>
          )}
        />
      ) : (
        <EmptyCard title="No centres yet" icon="location_on" action={<ButtonLink href="/staff/centres">Go to centres</ButtonLink>}>
          Add study centres first, then choose a coordinator for each.
        </EmptyCard>
      )}

      {course ? (
        <CourseStaffing
          row={course}
          centres={staffing.centres}
          onClose={() => setCourse(null)}
          onSaved={() => {
            setNotice(`Saved who teaches ${course.course.code}.`);
            setCourse(null);
            router.refresh();
          }}
        />
      ) : null}
      {centre ? (
        <CentreCoordinator
          row={centre}
          onClose={() => setCentre(null)}
          onSaved={() => {
            setNotice(`Saved the coordinator for ${centre.centre.name}.`);
            setCentre(null);
            router.refresh();
          }}
        />
      ) : null}

      <Dialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        icon="content_copy"
        iconClassName="text-brand"
        title={copied ? `Copied ${plural(copied.copied, "place")}` : "Copy from last session?"}
        actions={
          copied ? (
            <Button onClick={() => setCopyOpen(false)} autoFocus>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setCopyOpen(false)}>
                Cancel
              </Button>
              <Button onClick={doCopy} loading={copy.busy === "copy"}>
                Copy
              </Button>
            </>
          )
        }
      >
        {copied ? (
          <div className="flex flex-col gap-2 text-left">
            <p>
              From {copied.from} to {copied.to}. Places you had already filled were left as they are.
            </p>
            {copied.skipped.length ? (
              <>
                <p className="font-semibold text-ink">Not copied ({copied.skipped.length}):</p>
                <ul className="list-disc pl-5">
                  {copied.skipped.map((x) => (
                    <li key={x.what}>
                      {x.what}: {x.reason}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <p>Lecturers, facilitators, exam officers and coordinators from the session before {s.name} fill the empty places. Nothing you have already set is changed. Suspended staff are skipped.</p>
            {copy.error ? <p className="mt-3 text-danger" role="alert">{copy.error.message}</p> : null}
          </>
        )}
      </Dialog>
    </>
  );
}

/** The staff lists a staffing dialog needs, loaded once for the whole dialog (one request), with a retry. */
function useStaffOptions(roles: string[]) {
  const key = roles.join(",");
  const [byRole, setByRole] = useState<Record<string, StaffOption[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    api<{ byRole: Record<string, StaffOption[]> }>("GET", `/academic/staff-options?roles=${key}`).then((r) => {
      if (!alive) return;
      if (r.ok) setByRole(r.data.byRole);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [key, attempt]);
  const retry = () => {
    setFailed(false);
    setByRole(null);
    setAttempt((x) => x + 1);
  };
  return { of: (role: string) => (byRole ? byRole[role] ?? [] : null), failed, retry };
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner tone="danger" title="We could not load the staff list" action={<button type="button" className="min-h-12 underline md:min-h-0" onClick={onRetry}>Try again</button>}>
      Check your connection, then try again.
    </Banner>
  );
}

function PersonSelect({ label, hint, value, onChange, options, current, error, emptyLabel }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: StaffOption[] | null; current: PersonRef | null; error?: string; emptyLabel: string }) {
  const list = options ?? [];
  const showCurrent = current && !list.some((o) => o.id === current.id);
  return (
    <SelectField label={label} hint={options === null ? undefined : !list.length ? `Nobody has this role yet. Give it on People & roles first.` : hint} value={options === null ? "" : value} onChange={(e) => onChange(e.target.value)} error={error} disabled={options === null} aria-busy={options === null || undefined}>
      <option value="">{options === null ? "Loading…" : emptyLabel}</option>
      {showCurrent ? (
        <option value={current.id}>
          {current.fullName} {current.status === "SUSPENDED" ? "(suspended)" : ""}
        </option>
      ) : null}
      {list.map((o) => (
        <option key={o.id} value={o.id}>
          {o.fullName}
          {o.status === "INVITED" ? " (invited)" : ""}
          {o.scopeLabel ? ` · ${o.scopeLabel}` : ""}
        </option>
      ))}
    </SelectField>
  );
}

function CourseStaffing({ row, centres, onClose, onSaved }: { row: StaffingCourse; centres: StaffingCentre[]; onClose: () => void; onSaved: () => void }) {
  const staff = useStaffOptions(["LECTURER", "FACILITATOR", "EXAM_OFFICER"]);
  const act = useAction();
  const [lecturerId, setLecturer] = useState(row.lecturer?.id ?? "");
  const [examId, setExam] = useState(row.examOfficer?.id ?? "");
  const [facs, setFacs] = useState<Record<string, string>>(Object.fromEntries(row.facilitators.map((f) => [f.centreId, f.user.id])));
  const [notify, setNotify] = useState(true);

  async function save() {
    const r = await act.run("save", "PUT", `/academic/staffing/courses/${row.course.id}`, {
      sessionId: null,
      lecturerId: lecturerId || null,
      facilitators: Object.entries(facs)
        .filter(([, u]) => u)
        .map(([centreId, userId]) => ({ centreId, userId })),
      examOfficerId: examId || null,
      notify,
    });
    if (r.ok) onSaved();
  }
  const facErr = (centreId: string) => {
    const keys = Object.keys(act.fields).filter((k) => k.startsWith("facilitators["));
    const i = Object.entries(facs).filter(([, u]) => u).findIndex(([c]) => c === centreId);
    return keys.length && i >= 0 ? act.fields[`facilitators[${i}].userId`] : undefined;
  };

  return (
    <Panel
      open
      onClose={onClose}
      title={`Who teaches ${row.course.code} · ${row.course.title}`}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            Save
          </Button>
        </>
      }
    >
      {staff.failed ? <LoadFailed onRetry={staff.retry} /> : null}
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <PersonSelect label="Lecturer" hint="Staff with the Lecturer role, from People & roles." value={lecturerId} onChange={setLecturer} options={staff.of("LECTURER")} current={row.lecturer} error={act.fields.lecturerId} emptyLabel="No lecturer yet" />
      <div role="group" aria-labelledby="fac-head" aria-describedby="fac-desc" className="flex flex-col gap-3 rounded-md border border-line p-4">
        <div className="flex flex-col gap-1">
          <p id="fac-head" className="text-label text-ink">
            Facilitators · one per study centre
          </p>
          <p id="fac-desc" className="text-body-sm text-ink-2">
            Each runs tutorials, answers the course forum and marks coursework at their centre.
          </p>
        </div>
        {centres.map((c) => {
          const cur = row.facilitators.find((f) => f.centreId === c.centre.id)?.user ?? null;
          return (
            <PersonSelect
              key={c.centre.id}
              label={`${c.centre.name}${c.students ? ` · ${plural(c.students, "student")}` : ""}`}
              value={facs[c.centre.id] ?? ""}
              onChange={(v) => setFacs((x) => ({ ...x, [c.centre.id]: v }))}
              options={staff.of("FACILITATOR")}
              current={cur}
              error={facErr(c.centre.id)}
              emptyLabel="Needs a facilitator"
            />
          );
        })}
        {!centres.length ? <p className="text-body text-ink-2">Add study centres to choose facilitators.</p> : null}
      </div>
      <PersonSelect label="Exam officer" hint="Staff with the Exam officer role." value={examId} onChange={setExam} options={staff.of("EXAM_OFFICER")} current={row.examOfficer} error={act.fields.examOfficerId} emptyLabel="No exam officer yet" />
      <Checkbox label="Email them that they have been assigned" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
    </Panel>
  );
}

function CentreCoordinator({ row, onClose, onSaved }: { row: StaffingCentre; onClose: () => void; onSaved: () => void }) {
  const staff = useStaffOptions(["CENTRE_COORDINATOR"]);
  const act = useAction();
  const [id, setId] = useState(row.coordinator?.id ?? "");
  const [notify, setNotify] = useState(true);
  async function save() {
    const r = await act.run("save", "PUT", `/academic/staffing/centres/${row.centre.id}`, { sessionId: null, coordinatorId: id || null, notify });
    if (r.ok) onSaved();
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title={`Coordinator for ${row.centre.name}`}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            Save
          </Button>
        </>
      }
    >
      {staff.failed ? <LoadFailed onRetry={staff.retry} /> : null}
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <PersonSelect label="Coordinator" hint="Staff with the Centre coordinator role. Students at this centre contact them." value={id} onChange={setId} options={staff.of("CENTRE_COORDINATOR")} current={row.coordinator} error={act.fields.coordinatorId} emptyLabel="Needs a coordinator" />
      <Checkbox label="Email them that they have been assigned" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
    </Panel>
  );
}
