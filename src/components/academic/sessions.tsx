"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AcademicSession, SessionInput } from "@/lib/types-b1";
import { useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { EmptyCard } from "@/components/staff/load-state";

const STATUS: Record<AcademicSession["status"], { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "info" },
};

export function SessionsView({ sessions }: { sessions: AcademicSession[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AcademicSession | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "activate" | "delete"; s: AcademicSession } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const act = useAction();

  async function doConfirm() {
    if (!confirm) return;
    const r =
      confirm.kind === "activate"
        ? await act.run("confirm", "POST", `/academic/sessions/${confirm.s.id}/activate`)
        : await act.run("confirm", "DELETE", `/academic/sessions/${confirm.s.id}`);
    if (r.ok) {
      setNotice(confirm.kind === "activate" ? `${confirm.s.name} is now the active session. Students see it.` : `Deleted the draft ${confirm.s.name}.`);
      setConfirm(null);
      router.refresh();
    }
  }

  return (
    <>
      <PageHeader
        title="Sessions & semesters"
        subtitle="Only one session is active at a time. Students see the active session."
        actions={
          <Button leadingIcon="add" onClick={() => setEditing("new")}>
            New session
          </Button>
        }
      />
      {notice ? (
        <Banner tone="success" title={notice} />
      ) : null}
      {!sessions.length ? (
        <EmptyCard
          title="No session yet"
          icon="calendar_today"
          action={
            <Button leadingIcon="add" onClick={() => setEditing("new")}>
              New session
            </Button>
          }
        >
          Start with the session you are setting up, like 2026/2027: two semesters and when registration opens.
        </EmptyCard>
      ) : (
        <DataTable
          caption="Sessions, newest first"
          rows={sessions}
          rowKey={(s) => s.id}
          columns={[
            { header: "Session", cell: (s) => <span className="font-semibold">{s.name}{s.current && s.status === "DRAFT" ? <span className="ml-2 text-body-sm font-normal text-ink-2">being set up</span> : null}</span> },
            { header: "Semesters", cell: (s) => s.semestersLabel },
            { header: "Registration window", cell: (s) => s.registrationLabel },
            { header: "Status", cell: (s) => <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge> },
          ]}
          rowAction={(s) => (
            <span className="inline-flex flex-wrap justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                Edit
              </Button>
              {s.status !== "ACTIVE" ? (
                <Button variant="ghost" size="sm" onClick={() => { act.reset(); setConfirm({ kind: "activate", s }); }} aria-label={`Make ${s.name} active`}>
                  Make active
                </Button>
              ) : null}
              {s.status === "DRAFT" ? (
                <Button variant="ghost" size="sm" onClick={() => { act.reset(); setConfirm({ kind: "delete", s }); }} aria-label={`Delete ${s.name}`}>
                  Delete
                </Button>
              ) : null}
            </span>
          )}
        />
      )}

      <SessionForm
        key={editing === "new" ? "new" : editing?.id ?? "none"}
        session={editing === "new" ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          setNotice(msg);
          router.refresh();
        }}
      />

      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        icon={confirm?.kind === "delete" ? "delete" : "check_circle"}
        iconClassName={confirm?.kind === "delete" ? "text-danger" : "text-brand"}
        title={confirm?.kind === "delete" ? `Delete ${confirm?.s.name}?` : `Make ${confirm?.s.name} active?`}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm?.kind === "delete" ? "danger" : "primary"} onClick={doConfirm} loading={act.busy === "confirm"}>
              {confirm?.kind === "delete" ? "Delete draft" : "Make active"}
            </Button>
          </>
        }
      >
        <p>
          {confirm?.kind === "delete"
            ? "Only a draft with nobody assigned can be deleted. This cannot be undone."
            : "Students will see this session. The session that is active now will be archived."}
        </p>
        {act.error ? <p className="mt-3 text-danger" role="alert">{act.error.message}</p> : null}
      </Dialog>
    </>
  );
}

interface Draft {
  name: string;
  s1Start: string;
  s1End: string;
  regOpen: string;
  regClose: string;
  regLate: string;
  s2Start: string;
  s2End: string;
  reg2Open: string;
  reg2Close: string;
}

function toDraft(s: AcademicSession | null): Draft {
  const a = s?.semesters.find((x) => x.number === 1);
  const b = s?.semesters.find((x) => x.number === 2);
  return {
    name: s?.name ?? "",
    s1Start: a?.startsOn ?? "",
    s1End: a?.endsOn ?? "",
    regOpen: a?.registration?.opensOn ?? "",
    regClose: a?.registration?.closesOn ?? "",
    regLate: a?.registration?.lateClosesOn ?? "",
    s2Start: b?.startsOn ?? "",
    s2End: b?.endsOn ?? "",
    reg2Open: b?.registration?.opensOn ?? "",
    reg2Close: b?.registration?.closesOn ?? "",
  };
}

function SessionForm({ session, open, onClose, onSaved }: { session: AcademicSession | null; open: boolean; onClose: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(session));
  const [secondReg, setSecondReg] = useState(!!session?.semesters.find((x) => x.number === 2)?.registration);
  const act = useAction();
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: e.target.value }));
  const f = act.fields;

  async function save(makeActive: boolean) {
    const semesters: SessionInput["semesters"] = [
      {
        number: 1,
        startsOn: d.s1Start,
        endsOn: d.s1End,
        registration: d.regOpen || d.regClose ? { opensOn: d.regOpen, closesOn: d.regClose, lateClosesOn: d.regLate || null } : null,
      },
    ];
    if (d.s2Start || d.s2End) {
      semesters.push({ number: 2, startsOn: d.s2Start, endsOn: d.s2End, registration: secondReg && (d.reg2Open || d.reg2Close) ? { opensOn: d.reg2Open, closesOn: d.reg2Close, lateClosesOn: null } : null });
    }
    const body: SessionInput = { name: d.name.trim(), semesters, makeActive };
    const r = session ? await act.run<AcademicSession>(makeActive ? "active" : "draft", "PUT", `/academic/sessions/${session.id}`, body) : await act.run<AcademicSession>(makeActive ? "active" : "draft", "POST", "/academic/sessions", body);
    if (r.ok) onSaved(makeActive ? `${r.data.name} is saved and active.` : `${r.data.name} is saved as a draft.`);
  }

  const date = (label: string, k: keyof Draft, field: string, hint?: string) => (
    <TextField label={label} type="date" value={d[k]} onChange={set(k)} error={f[field]} hint={hint} />
  );
  const active = session?.status === "ACTIVE";

  return (
    <Panel
      variant="sheet"
      open={open}
      onClose={onClose}
      title={session ? `Edit session ${session.name}` : "New session"}
      onSubmit={() => save(active)}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          {active ? (
            <Button type="submit" loading={act.busy === "active"}>
              Save changes
            </Button>
          ) : (
            <>
              <Button variant="secondary" type="button" onClick={() => save(false)} loading={act.busy === "draft"}>
                Save draft
              </Button>
              <Button type="button" onClick={() => save(true)} loading={act.busy === "active"}>
                Save and make active
              </Button>
            </>
          )}
        </>
      }
    >
      {act.error && !Object.keys(f).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      {act.error && Object.keys(f).length ? <Banner tone="danger" title="Check the highlighted dates">{act.error.message}</Banner> : null}
      <TextField label="Session name" value={d.name} onChange={set("name")} placeholder="2026/2027" error={f.name} autoFocus={!session} />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-overline text-ink-3 uppercase">First semester</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {date("Starts", "s1Start", "semesters[0].startsOn")}
          {date("Ends", "s1End", "semesters[0].endsOn")}
          {date("Registration opens", "regOpen", "semesters[0].registration.opensOn")}
          {date("Registration closes", "regClose", "semesters[0].registration.closesOn", "Late registration needs coordinator approval after this date.")}
          {date("Late registration closes (optional)", "regLate", "semesters[0].registration.lateClosesOn")}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-overline text-ink-3 uppercase">Second semester</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {date("Starts", "s2Start", "semesters[1].startsOn")}
          {date("Ends", "s2End", "semesters[1].endsOn")}
        </div>
        {secondReg ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {date("Registration opens", "reg2Open", "semesters[1].registration.opensOn")}
            {date("Registration closes", "reg2Close", "semesters[1].registration.closesOn")}
          </div>
        ) : (
          <Button variant="ghost" type="button" size="sm" leadingIcon="add" className="w-fit" onClick={() => setSecondReg(true)}>
            Add a registration window
          </Button>
        )}
        <p className="text-body-sm text-ink-2">You can save a draft without the second semester. Both semesters need dates before the session is made active.</p>
      </fieldset>
    </Panel>
  );
}
