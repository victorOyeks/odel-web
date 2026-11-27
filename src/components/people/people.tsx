"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { formatWhen } from "@/lib/format";
import { STAFF_ROLES } from "@/lib/staff-roles";
import type { PeoplePage, Person, PersonDetail, RoleInput, SuspendCheck } from "@/lib/types-b1";
import { plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FilterSelect, SearchBox, TextArea } from "@/components/ui/fields";
import { Pager } from "@/components/ui/nav-bits";
import { Panel } from "@/components/ui/panel";
import { SkeletonLine } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { CsvImport } from "@/components/staff/csv-import";
import { EmptyCard } from "@/components/staff/load-state";
import { RoleEditor, rolesValid, useScopeOptions } from "./role-editor";

const STATUS: Record<Person["status"], { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  INVITED: { label: "Invited", tone: "warning" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

type Filters = { search: string; role: string; status: string; page: string };

export function PeopleView({ data, filters, domain, myEmail, canEdit, openId }: { data: PeoplePage; filters: Filters; domain: string; myEmail: string; canEdit: boolean; openId: string | null }) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [open, setOpen] = useState<string | null>(openId);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = !!(filters.search || filters.role || filters.status);
  const href = (p: number) => `/staff/people?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: String(p) })}`;
  const c = data.counts;

  return (
    <>
      <PageHeader
        title="People & roles"
        subtitle={`${plural(c.total, "staff member")} · ${c.active} active · ${c.invited} invited${c.suspended ? ` · ${c.suspended} suspended` : ""}. A person can hold more than one role. Roles decide what each person sees.`}
        actions={
          canEdit ? (
            <>
              <Button variant="secondary" leadingIcon="upload" onClick={() => setBulk(true)}>
                Bulk invite (CSV)
              </Button>
              <Button leadingIcon="person_add" onClick={() => setInviting(true)}>
                Invite staff
              </Button>
            </>
          ) : undefined
        }
      />
      {notice ? <Banner tone="success" title={notice} /> : null}
      <form method="get" action="/staff/people" role="search" aria-label="Filter staff" className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchBox name="search" defaultValue={filters.search} placeholder="Search name or email" label="Search staff" />
        <FilterSelect label="Role" name="role" defaultValue={filters.role}>
          <option value="">Any</option>
          {STAFF_ROLES.map((r) => (
            <option key={r.role} value={r.role}>
              {r.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Status" name="status" defaultValue={filters.status}>
          <option value="">Any</option>
          <option value="ACTIVE">Active</option>
          <option value="INVITED">Invited</option>
          <option value="SUSPENDED">Suspended</option>
        </FilterSelect>
        <Button type="submit" variant="secondary" leadingIcon="filter_list">
          Show
        </Button>
      </form>
      {!data.items.length ? (
        <EmptyCard
          title={filtered ? "Nobody matches" : "Nobody invited yet"}
          icon="groups"
          action={filtered ? <ButtonLink href="/staff/people" variant="secondary">Clear filters</ButtonLink> : canEdit ? <Button leadingIcon="person_add" onClick={() => setInviting(true)}>Invite staff</Button> : undefined}
        >
          {filtered ? "Try another name, role or status." : "Invite lecturers, facilitators, coordinators and exam officers. They sign in with the university’s Google accounts."}
        </EmptyCard>
      ) : (
        <>
          <DataTable
            caption="Staff and their roles"
            rows={data.items}
            rowKey={(p) => p.id}
            columns={[
              { header: "Name", cell: (p) => <button type="button" className="min-h-10 text-left font-semibold text-brand hover:underline" onClick={() => setOpen(p.id)}>{p.fullName}</button> },
              { header: "Email", cell: (p) => <span className="break-all">{p.email}</span> },
              { header: "Roles", cell: (p) => <span className="flex flex-wrap gap-1">{p.roles.map((r) => <Badge key={r.id} tone="brand">{r.roleLabel}</Badge>)}</span> },
              { header: "Scope", cell: (p) => p.scopeLabel },
              { header: "Status", cell: (p) => <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge> },
            ]}
          />
          <Pager page={data.page} size={data.size} total={data.total} href={href} noun="staff" />
        </>
      )}

      {inviting ? (
        <InviteForm
          domain={domain}
          onClose={() => setInviting(false)}
          onSaved={(p) => {
            setInviting(false);
            setNotice(`Invited ${p.fullName}. We emailed ${p.email} a link to sign in.`);
            router.refresh();
          }}
        />
      ) : null}
      <CsvImport
        open={bulk}
        onClose={() => setBulk(false)}
        title="Invite staff from a CSV file"
        intro={`Columns: full_name, email, role, scope_type, scope_code. Emails must end in @${domain}. Nothing is sent until you confirm.`}
        templateHref="/api/v1/people/imports/template.csv"
        uploadPath="/people/uploads"
        checkPath="/people/imports"
        confirmPath={(id) => `/people/imports/${id}/confirm`}
        doneMessage={(r) => `Invited ${plural(Number(r.invited ?? 0), "person", "people")}. Each gets an email with a link to sign in.`}
      />
      {open ? (
        <PersonSheet
          key={open}
          id={open}
          self={(p) => p.email.toLowerCase() === myEmail.toLowerCase()}
          canEdit={canEdit}
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

function InviteForm({ domain, onClose, onSaved }: { domain: string; onClose: () => void; onSaved: (p: Person) => void }) {
  const act = useAction();
  const opts = useScopeOptions();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<RoleInput[]>([]);
  async function save() {
    if (!rolesValid(roles)) {
      act.setFields(roles.length ? Object.fromEntries(roles.map((r, i) => [r.scopeType !== "UNIVERSITY" && !r.scopeId ? `roles[${i}].scopeId` : "", "Choose where this role applies."]).filter(([k]) => k)) : { roles: "Choose at least one role." });
      return;
    }
    const r = await act.run<Person>("save", "POST", "/people", { fullName: name, email, roles });
    if (r.ok) onSaved(r.data);
  }
  return (
    <Panel
      open
      onClose={onClose}
      title="Invite a staff member"
      description="They will sign in with their university Google account. We email them a link."
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" leadingIcon="send" loading={act.busy === "save"}>
            Send invite
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not sent">{act.error.message}</Banner> : null}
      <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Type their full name" error={act.fields.fullName} autoFocus autoComplete="off" />
      <TextField label="University email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${domain}`} hint={`Must end in @${domain}`} error={act.fields.email} autoComplete="off" />
      <RoleEditor value={roles} onChange={setRoles} fields={act.fields} opts={opts} />
    </Panel>
  );
}

function PersonSheet({ id, self, canEdit, onClose, onChanged }: { id: string; self: (p: Person) => boolean; canEdit: boolean; onClose: () => void; onChanged: (msg: string) => void }) {
  const [d, setD] = useState<PersonDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [mode, setMode] = useState<"view" | "roles" | "suspend" | "reset">("view");
  const [reload, setReload] = useState(0);
  const act = useAction();

  useEffect(() => {
    let alive = true;
    api<PersonDetail>("GET", `/people/${id}`).then((r) => {
      if (!alive) return;
      if (r.ok) setD(r.data);
      else setFailed(r.error.message ?? "We could not load this person.");
    });
    return () => {
      alive = false;
    };
  }, [id, reload]);

  const p = d?.person;
  const isSelf = p ? self(p) : false;
  async function simple(key: string, path: string, msg: string) {
    const r = await act.run(key, "POST", path);
    if (r.ok) {
      setReload((x) => x + 1);
      onChanged(msg);
    }
  }

  return (
    <>
      <Panel
        open={mode === "view"}
        variant="sheet"
        onClose={onClose}
        title={p?.fullName ?? "Staff member"}
        description={p ? <span className="break-all">{p.email}</span> : undefined}
        footer={
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        }
      >
        {failed ? (
          <Banner tone="danger" title="Could not load this person">
            {failed} Close this and try again.
          </Banner>
        ) : !p ? (
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">Loading</span>
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="h-16 w-full" />
          </div>
        ) : (
          <>
            {act.error ? <Banner tone="danger" title="That did not work">{act.error.message}</Banner> : null}
            {p.status === "SUSPENDED" ? (
              <Banner tone="danger" title={`Suspended${p.suspendedAt ? ` on ${formatWhen(p.suspendedAt)}` : ""}`}>
                {p.suspendedReason ? `Reason: ${p.suspendedReason}. ` : ""}They cannot sign in until you restore access.
              </Banner>
            ) : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-ink-2">Status</dt>
              <dd>
                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
              </dd>
              <dt className="text-ink-2">Two-step sign-in</dt>
              <dd className="text-ink">{p.twoStepSetUp ? "Set up" : "Not set up yet"}</dd>
              <dt className="text-ink-2">Invited</dt>
              <dd className="text-ink">{p.invitedAt ? formatWhen(p.invitedAt) : "—"}</dd>
              <dt className="text-ink-2">Last sign-in</dt>
              <dd className="text-ink">{p.lastSignInAt ? formatWhen(p.lastSignInAt) : "Never"}</dd>
            </dl>
            <div className="flex items-center gap-3">
              <h3 className="flex-1 text-overline text-ink-3 uppercase">Roles</h3>
              {canEdit ? (
                <Button variant="ghost" size="sm" leadingIcon="edit" onClick={() => { act.reset(); setMode("roles"); }}>
                  Edit roles
                </Button>
              ) : null}
            </div>
            <ul className="flex flex-col gap-2">
              {p.roles.map((r) => (
                <li key={r.id} className="flex flex-col rounded-md border border-line px-3 py-2">
                  <span className="text-label text-ink">{r.roleLabel}</span>
                  <span className="text-body-sm text-ink-2">{r.scopeLabel}</span>
                </li>
              ))}
            </ul>
            <h3 className="text-overline text-ink-3 uppercase">This session</h3>
            {d!.staffing.length ? (
              <ul className="flex flex-col gap-1 text-body text-ink">
                {d!.staffing.map((s) => (
                  <li key={s.what}>{s.what}</li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-ink-2">Not assigned to any course or centre yet. Assign them on Staffing.</p>
            )}
            {canEdit ? (
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                {p.status === "INVITED" ? (
                  <Button variant="secondary" leadingIcon="mail" loading={act.busy === "resend"} onClick={() => simple("resend", `/people/${p.id}/resend-invitation`, `Sent the invitation to ${p.email} again.`)}>
                    Resend invitation
                  </Button>
                ) : null}
                {!isSelf && p.twoStepSetUp ? (
                  <Button variant="secondary" leadingIcon="lock_reset" onClick={() => { act.reset(); setMode("reset"); }}>
                    Reset two-step sign-in
                  </Button>
                ) : null}
                {p.status === "SUSPENDED" ? (
                  <Button variant="secondary" leadingIcon="undo" loading={act.busy === "reinstate"} onClick={() => simple("reinstate", `/people/${p.id}/reinstate`, `${p.fullName} can sign in again.`)}>
                    Restore access
                  </Button>
                ) : !isSelf ? (
                  <Button variant="ghost" leadingIcon="block" className="text-danger" onClick={() => { act.reset(); setMode("suspend"); }}>
                    Suspend {p.fullName}
                  </Button>
                ) : (
                  <p className="text-body-sm text-ink-2">This is you. Another ODeL admin can suspend you or reset your two-step sign-in.</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </Panel>
      {p && mode === "roles" ? (
        <EditRoles
          person={p}
          onClose={() => setMode("view")}
          onSaved={() => {
            setMode("view");
            setReload((x) => x + 1);
            onChanged(`Saved ${p.fullName}’s roles. If a role was removed they are signed out and see their new roles next time.`);
          }}
        />
      ) : null}
      {p && mode === "suspend" ? (
        <SuspendDialog
          person={p}
          onClose={() => setMode("view")}
          onDone={() => {
            setMode("view");
            setReload((x) => x + 1);
            onChanged(`${p.fullName} is suspended and was signed out everywhere.`);
          }}
        />
      ) : null}
      {p && mode === "reset" ? (
        <ResetTwoStep
          person={p}
          onClose={() => setMode("view")}
          onDone={() => {
            setMode("view");
            setReload((x) => x + 1);
            onChanged(`Reset ${p.fullName}’s two-step sign-in. They set it up again the next time they sign in.`);
          }}
        />
      ) : null}
    </>
  );
}

function EditRoles({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: () => void }) {
  const act = useAction();
  const opts = useScopeOptions();
  const [roles, setRoles] = useState<RoleInput[]>(person.roles.map((r) => ({ role: r.role, scopeType: r.scopeType, scopeId: r.scopeId })));
  async function save() {
    if (!rolesValid(roles)) {
      act.setFields(roles.length ? {} : { roles: "Keep at least one role. To stop someone signing in, suspend them instead." });
      if (roles.length) act.setError({ error: "invalid", message: "Choose where each role applies." });
      return;
    }
    const r = await act.run("save", "PUT", `/people/${person.id}/roles`, { roles });
    if (r.ok) onSaved();
  }
  return (
    <Panel
      open
      onClose={onClose}
      title={`Roles for ${person.fullName}`}
      description="Removing a role signs them out everywhere; they see their new roles when they sign in again."
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            Save roles
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <RoleEditor value={roles} onChange={setRoles} fields={act.fields} opts={opts} />
    </Panel>
  );
}

function SuspendDialog({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  const [check, setCheck] = useState<SuspendCheck | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    api<SuspendCheck>("GET", `/people/${person.id}/suspend-check`).then((r) => setCheck(r.ok ? r.data : { warnings: [], staffing: [] }));
  }, [person.id]);
  async function suspend() {
    if (!reason.trim()) {
      act.setFields({ reason: "Write why. It is kept in the audit log." });
      return;
    }
    const r = await act.run("suspend", "POST", `/people/${person.id}/suspend`, { reason: reason.trim() });
    if (r.ok) onDone();
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title={`Suspend ${person.fullName}?`}
      description="They will be signed out at once and cannot sign in until you restore access. Their marking, messages and history stay as they are."
      onSubmit={suspend}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          {check?.warnings.length ? (
            <ButtonLink href="/staff/academic-setup/staffing" variant="secondary">
              Reassign first
            </ButtonLink>
          ) : null}
          <Button type="submit" variant="danger" loading={act.busy === "suspend"}>
            Suspend
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not suspended">{act.error.message}</Banner> : null}
      {check === null ? <SkeletonLine className="h-10 w-full" /> : check.warnings.map((w) => <Banner key={w} tone="danger" icon="groups" title={w} />)}
      <TextArea label="Reason (kept in the audit log)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Left the university on 30 Nov 2026" hint={`${reason.length} / 500`} error={act.fields.reason} autoFocus />
    </Panel>
  );
}

function ResetTwoStep({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  const [reason, setReason] = useState("");
  async function reset() {
    if (!reason.trim()) {
      act.setFields({ reason: "Write why, for example Lost phone. It is kept in the audit log." });
      return;
    }
    const r = await act.run("reset", "POST", `/people/${person.id}/reset-two-step`, { reason: reason.trim() });
    if (r.ok) onDone();
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title={`Reset ${person.fullName}’s two-step sign-in?`}
      description="Use this when they lost their phone or authenticator app. Their app, backup codes and trusted computers stop working, they are signed out everywhere, and the next sign-in asks them to set two-step up again. We email them to say so."
      onSubmit={reset}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "reset"}>
            Reset two-step sign-in
          </Button>
        </>
      }
    >
      {act.error ? <Banner tone="danger" title="Not reset">{act.error.message}</Banner> : null}
      <TextField label="Reason (kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lost phone" error={act.fields.reason} autoFocus />
    </Panel>
  );
}
