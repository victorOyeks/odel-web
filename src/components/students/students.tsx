"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { formatWhen } from "@/lib/format";
import type { NewStudent, Paged, StudentFilters, StudentRecord, StudentRow, StudentStatus } from "@/lib/types-b1";
import { plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, FilterSelect, SearchBox, SelectField, TextArea } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Pager } from "@/components/ui/nav-bits";
import { Panel } from "@/components/ui/panel";
import { SkeletonLine } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { EmptyCard } from "@/components/staff/load-state";

const TONE: Record<StudentStatus, BadgeTone> = { IMPORTED: "warning", INVITED: "warning", ACTIVE: "success", SUSPENDED: "danger" };
type F = { q: string; programme: string; level: string; centre: string; status: string; page: string };

export function StudentsView({ data, f, filters, openId }: { data: Paged<StudentRow>; f: F; filters: StudentFilters; openId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(openId);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = !!(f.q || f.programme || f.level || f.centre || f.status);
  const href = (p: number) => `/staff/students?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(p) })}`;
  const levels = [...new Set(filters.programmes.flatMap((p) => p.levels))].sort();

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={filtered ? `${plural(data.total, "student")} match.` : `${plural(data.total, "student")}. Search by name, matric number or email.`}
        actions={
          <>
            <ButtonLink href="/staff/students/import" variant="secondary" leadingIcon="upload">
              Import students
            </ButtonLink>
            <Button leadingIcon="person_add" onClick={() => setAdding(true)} disabled={!filters.programmes.length || !filters.centres.length}>
              Add a student
            </Button>
          </>
        }
      />
      {notice ? <Banner tone="success" title={notice} /> : null}
      <form method="get" action="/staff/students" role="search" aria-label="Find students" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <SearchBox name="q" defaultValue={f.q} placeholder="Name, matric number or email" label="Search students" />
        <FilterSelect label="Programme" name="programme" defaultValue={f.programme}>
          <option value="">All</option>
          {filters.programmes.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Level" name="level" defaultValue={f.level}>
          <option value="">All</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}L
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Centre" name="centre" defaultValue={f.centre}>
          <option value="">All</option>
          {filters.centres.map((c) => (
            <option key={c.code} value={c.code}>
              {c.shortName ?? c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" name="status" defaultValue={f.status}>
          <option value="">Any</option>
          {filters.statuses.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </FilterSelect>
        <Button type="submit" variant="secondary" leadingIcon="search">
          Find
        </Button>
      </form>
      {!data.items.length ? (
        <EmptyCard
          title={filtered ? "No students match" : "No students yet"}
          icon="school"
          action={filtered ? <ButtonLink href="/staff/students" variant="secondary">Clear search</ButtonLink> : <ButtonLink href="/staff/students/import" leadingIcon="upload">Import students</ButtonLink>}
        >
          {filtered ? "Check the spelling or the matric number, or try fewer filters." : "Import the admitted students from the university portal’s CSV export, then send the welcome emails."}
        </EmptyCard>
      ) : (
        <>
          <DataTable
            caption="Students"
            rows={data.items}
            rowKey={(s) => s.id}
            columns={[
              { header: "Name", cell: (s) => <button type="button" className="min-h-10 text-left font-semibold text-brand hover:underline" onClick={() => setOpen(s.id)}>{s.fullName}</button> },
              { header: "Matric number", cell: (s) => <span className="font-mono text-body">{s.matricNumber}</span> },
              { header: "Programme and level", cell: (s) => <Badge tone="brand">{`${s.programme.name} · ${s.levelLabel}`}</Badge> },
              { header: "Study centre", cell: (s) => s.centre.shortName ?? s.centre.name },
              { header: "Status", cell: (s) => <Badge tone={TONE[s.status]}>{s.statusLabel}</Badge> },
            ]}
          />
          <Pager page={data.page} size={data.size} total={data.total} href={href} noun="students" />
        </>
      )}
      {adding ? (
        <AddStudent
          filters={filters}
          onClose={() => setAdding(false)}
          onSaved={(s, sent) => {
            setAdding(false);
            setNotice(`Added ${s.fullName}${sent ? " and sent the welcome email" : ""}.`);
            router.refresh();
          }}
        />
      ) : null}
      {open ? (
        <StudentSheet
          key={open}
          id={open}
          filters={filters}
          onClose={() => setOpen(null)}
          onChanged={(msg) => {
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function AddStudent({ filters, onClose, onSaved }: { filters: StudentFilters; onClose: () => void; onSaved: (s: StudentRecord, sent: boolean) => void }) {
  const act = useAction();
  const [v, setV] = useState({ surname: "", firstName: "", otherNames: "", matricNumber: "", programme: "", centreCode: "", email: "", phone: "" });
  const [send, setSend] = useState(true);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const f = act.fields;
  async function save() {
    const [programmeCode, level] = v.programme.split("|");
    const body: NewStudent = { surname: v.surname, firstName: v.firstName, otherNames: v.otherNames, matricNumber: v.matricNumber, programmeCode: programmeCode ?? "", level: Number(level) || 0, centreCode: v.centreCode, email: v.email, phone: v.phone, sendWelcome: send && !!v.email };
    const r = await act.run<StudentRecord>("save", "POST", "/students", body);
    if (r.ok) onSaved(r.data, body.sendWelcome);
  }
  return (
    <Panel
      open
      variant="sheet"
      onClose={onClose}
      title="Add a student"
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            {send && v.email ? "Add and send welcome" : "Add student"}
          </Button>
        </>
      }
    >
      <Banner tone="warning" title="For one late admission. For many students, import the portal file instead." />
      {act.error && !Object.keys(f).length ? <Banner tone="danger" title="Not added">{act.error.message}</Banner> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="First name" value={v.firstName} onChange={set("firstName")} error={f.firstName} autoComplete="off" autoFocus />
        <TextField label="Surname" value={v.surname} onChange={set("surname")} error={f.surname} autoComplete="off" />
      </div>
      <TextField label="Other names (optional)" value={v.otherNames} onChange={set("otherNames")} autoComplete="off" />
      <TextField label="Matric number" value={v.matricNumber} onChange={set("matricNumber")} placeholder="e.g. WU/ODL/25/0389" error={f.matricNumber} autoComplete="off" />
      <SelectField label="Programme and level" value={v.programme} onChange={set("programme")} hint="Programmes come from Academic structure." error={f.programmeCode ?? f.level}>
        <option value="">Choose a programme and level</option>
        {filters.programmes.flatMap((p) =>
          p.levels.map((l) => (
            <option key={`${p.code}-${l}`} value={`${p.code}|${l}`}>
              {p.name} · {l}L
            </option>
          )),
        )}
      </SelectField>
      <SelectField label="Study centre" value={v.centreCode} onChange={set("centreCode")} hint="From Centres." error={f.centreCode}>
        <option value="">Choose a centre</option>
        {filters.centres.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Email (for the welcome email)" type="email" value={v.email} onChange={set("email")} placeholder="name@example.com" error={f.email} hint="Every activation and reset code goes to this address." autoComplete="off" />
      <TextField label="Phone (optional)" type="tel" value={v.phone} onChange={set("phone")} placeholder="e.g. 0806 555 0191" error={f.phone} autoComplete="off" />
      <Checkbox label="Send the welcome email now" hint={v.email ? undefined : "Add an email to send it."} checked={send && !!v.email} disabled={!v.email} onChange={(e) => setSend(e.target.checked)} />
    </Panel>
  );
}

function StudentSheet({ id, filters, onClose, onChanged }: { id: string; filters: StudentFilters; onClose: () => void; onChanged: (msg: string) => void }) {
  const [s, setS] = useState<StudentRecord | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [v, setV] = useState({ matricNumber: "", email: "", phone: "", programme: "", centreCode: "" });
  const [suspending, setSuspending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const act = useAction();

  useEffect(() => {
    let alive = true;
    api<StudentRecord>("GET", `/students/${id}`).then((r) => {
      if (!alive) return;
      if (!r.ok) return setFailed(r.error.message ?? "We could not load this student.");
      setS(r.data);
      setV({ matricNumber: r.data.matricNumber, email: r.data.email ?? "", phone: r.data.phone ?? "", programme: `${r.data.programme.code}|${r.data.level}`, centreCode: r.data.centre.code });
    });
    return () => {
      alive = false;
    };
  }, [id, reload]);

  async function save() {
    if (!s) return;
    const [programmeCode, level] = v.programme.split("|");
    const patch: Record<string, unknown> = {};
    if (v.matricNumber !== s.matricNumber) patch.matricNumber = v.matricNumber;
    if (v.email !== (s.email ?? "")) patch.email = v.email;
    if (v.phone !== (s.phone ?? "")) patch.phone = v.phone;
    if (programmeCode !== s.programme.code || Number(level) !== s.level) {
      patch.programmeCode = programmeCode;
      patch.level = Number(level);
    }
    if (v.centreCode !== s.centre.code) patch.centreCode = v.centreCode;
    if (!Object.keys(patch).length) return onClose();
    const r = await act.run<StudentRecord>("save", "PATCH", `/students/${s.id}`, patch);
    if (r.ok) {
      onChanged(`Saved ${r.data.fullName}’s record.`);
      onClose();
    }
  }

  async function action(key: string, path: string, msg: string) {
    setDone(null);
    const r = await act.run(key, "POST", path);
    if (r.ok) {
      setDone(msg);
      setReload((x) => x + 1);
      onChanged(msg);
    }
  }

  const acc = s?.account;
  return (
    <>
      <Panel
        open={!suspending}
        variant="sheet"
        onClose={onClose}
        title={s?.fullName ?? "Student"}
        description={s ? <Badge tone={TONE[s.status]}>{s.statusLabel}</Badge> : undefined}
        onSubmit={save}
        footer={
          s ? (
            <>
              <Button variant="ghost" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={act.busy === "save"}>
                Save changes
              </Button>
            </>
          ) : undefined
        }
      >
        {failed ? (
          <Banner tone="danger" title="Could not load this student">
            {failed} Close this and try again.
          </Banner>
        ) : !s ? (
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">Loading the student</span>
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="h-12 w-full" />
            <SkeletonLine className="h-12 w-full" />
          </div>
        ) : (
          <>
            {done ? <Banner tone="success" title={done} /> : null}
            {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="That did not work">{act.error.message}</Banner> : null}
            {s.status === "SUSPENDED" ? <Banner tone="danger" title="Suspended">{s.history.find((h) => h.to === "SUSPENDED")?.reason ?? ""} They cannot sign in until you restore access. Their work is kept.</Banner> : null}
            {acc?.lockedUntil ? <Banner tone="warning" title={`Sign-in paused until ${formatWhen(acc.lockedUntil)}`}>Too many wrong passwords. Sending a reset code lets them in sooner.</Banner> : null}
            <TextField label="Matric number" value={v.matricNumber} onChange={(e) => setV((x) => ({ ...x, matricNumber: e.target.value }))} error={act.fields.matricNumber} hint="Changing it changes what the student signs in with." />
            <SelectField label="Programme and level" value={v.programme} onChange={(e) => setV((x) => ({ ...x, programme: e.target.value }))} error={act.fields.programmeCode ?? act.fields.level}>
              {filters.programmes.flatMap((p) =>
                p.levels.map((l) => (
                  <option key={`${p.code}-${l}`} value={`${p.code}|${l}`}>
                    {p.name} · {l}L
                  </option>
                )),
              )}
            </SelectField>
            <SelectField label="Study centre" value={v.centreCode} onChange={(e) => setV((x) => ({ ...x, centreCode: e.target.value }))} error={act.fields.centreCode} hint={v.centreCode !== s.centre.code ? "Moving a student to another centre is recorded. Tell both centre coordinators." : undefined}>
              {filters.centres.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextField label="Email" type="email" value={v.email} onChange={(e) => setV((x) => ({ ...x, email: e.target.value }))} error={act.fields.email} hint={s.status === "ACTIVE" ? "Codes go here. Changing it changes what the student can sign in with." : "The welcome email and codes go here."} />
            <TextField label="Phone" type="tel" value={v.phone} onChange={(e) => setV((x) => ({ ...x, phone: e.target.value }))} error={act.fields.phone} />
            <h3 className="text-overline text-ink-3 uppercase">Account</h3>
            <div className="flex items-center gap-3 rounded-lg border border-line p-3">
              <Icon name="mail" className="text-icon-2" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-label text-ink">Activation message</span>
                <span className="text-body-sm text-ink-2">
                  {acc?.welcomeSentAt ? `Sent ${formatWhen(acc.welcomeSentAt)}` : "Not sent yet"}
                  {acc?.activatedAt ? ` · activated ${formatWhen(acc.activatedAt)}` : ""}
                </span>
              </div>
              {s.status !== "ACTIVE" && s.status !== "SUSPENDED" ? (
                <Button variant="ghost" size="sm" type="button" leadingIcon="send" loading={act.busy === "resend"} disabled={!s.email} onClick={() => action("resend", `/students/${s.id}/resend-activation`, `Sent the welcome email to ${s.email}.`)}>
                  {acc?.welcomeSentAt ? "Resend" : "Send"}
                </Button>
              ) : null}
            </div>
            {acc?.consent ? (
              <p className="text-body-sm text-ink-2">
                Accepted the privacy notice (version {acc.consent.version}) on {formatWhen(acc.consent.at)}.
              </p>
            ) : null}
            <div className="flex items-center gap-3 rounded-lg border border-line p-3">
              <Icon name="lock_reset" className="text-icon-2" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-label text-ink">Password</span>
                <span className="text-body-sm text-ink-2">{s.status === "ACTIVE" ? "Send a reset code by email" : "Available once the student has activated"}</span>
              </div>
              {s.status === "ACTIVE" ? (
                <Button variant="ghost" size="sm" type="button" leadingIcon="send" loading={act.busy === "reset"} disabled={!s.email} onClick={() => action("reset", `/students/${s.id}/password-reset`, `Emailed a password reset code to ${s.email}.`)}>
                  Send code
                </Button>
              ) : null}
            </div>
            {!s.email ? <p className="text-body-sm text-danger">No email on record. Add one above and save, then send.</p> : null}
            {s.status === "SUSPENDED" ? (
              <Button variant="secondary" type="button" leadingIcon="undo" className="w-fit" loading={act.busy === "reinstate"} onClick={() => action("reinstate", `/students/${s.id}/reinstate`, `${s.fullName} can sign in again.`)}>
                Restore access
              </Button>
            ) : (
              <Button variant="ghost" type="button" leadingIcon="block" className="w-fit text-danger" onClick={() => setSuspending(true)}>
                Suspend this student
              </Button>
            )}
            <h3 className="text-overline text-ink-3 uppercase">History</h3>
            <ol className="flex flex-col gap-2 text-body">
              {s.history.map((h, i) => (
                <li key={i} className="flex flex-col">
                  <span className="text-ink">{h.reason ?? h.to}</span>
                  <span className="text-body-sm text-ink-2">
                    {formatWhen(h.at)}
                    {h.by ? ` · ${h.by.fullName}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </Panel>
      {s && suspending ? (
        <SuspendStudent
          s={s}
          onClose={() => setSuspending(false)}
          onDone={() => {
            setSuspending(false);
            setReload((x) => x + 1);
            onChanged(`${s.fullName} is suspended and was signed out.`);
          }}
        />
      ) : null}
    </>
  );
}

function SuspendStudent({ s, onClose, onDone }: { s: StudentRecord; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  const [reason, setReason] = useState("");
  async function go() {
    if (!reason.trim()) return act.setFields({ reason: "Write why. It is kept in the student’s record." });
    const r = await act.run("suspend", "POST", `/students/${s.id}/suspend`, { reason: reason.trim() });
    if (r.ok) onDone();
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title={`Suspend ${s.fullName}?`}
      description="They are signed out at once and cannot sign in until you restore access. Their work and records are kept."
      onSubmit={go}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={act.busy === "suspend"}>
            Suspend
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not suspended">{act.error.message}</Banner> : null}
      <TextArea label="Reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Fees query" hint={`${reason.length} / 500`} error={act.fields.reason} autoFocus />
    </Panel>
  );
}
