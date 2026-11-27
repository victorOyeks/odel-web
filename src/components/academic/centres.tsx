"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { NG_STATES } from "@/lib/staff-roles";
import type { Centre, CentreDetail, Room, StaffOption } from "@/lib/types-b1";
import { plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SearchBox, SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { SkeletonLine } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { EmptyCard } from "@/components/staff/load-state";

function status(c: Centre): { label: string; tone: BadgeTone } {
  if (!c.rooms) return { label: "No rooms", tone: "warning" };
  if (!c.coordinator) return { label: "No coordinator", tone: "warning" };
  if (!c.computers) return { label: "No CBT room", tone: "warning" };
  return { label: "Ready", tone: "success" };
}

export function CentresView({ centres, search, openId }: { centres: Centre[]; search: string; openId: string | null }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(openId);
  const [notice, setNotice] = useState<string | null>(null);
  const q = search.toLowerCase();
  const rows = centres.filter((c) => !q || `${c.name} ${c.code} ${c.state}`.toLowerCase().includes(q));

  return (
    <>
      <PageHeader
        title="Study centres"
        subtitle={`${plural(centres.length, "centre")}. Each needs a coordinator, rooms and computer capacity before exams can be scheduled.`}
        actions={
          <Button leadingIcon="add" onClick={() => setAdding(true)}>
            Add centre
          </Button>
        }
      />
      {notice ? <Banner tone="success" title={notice} /> : null}
      {!centres.length ? (
        <EmptyCard
          title="No study centres yet"
          icon="location_on"
          action={
            <Button leadingIcon="add" onClick={() => setAdding(true)}>
              Add centre
            </Button>
          }
        >
          Add each centre where students study and sit exams, with its rooms. Students are imported into a centre, so you need at least one.
        </EmptyCard>
      ) : (
        <>
          <form method="get" action="/staff/centres" role="search" aria-label="Search centres">
            <SearchBox defaultValue={search} placeholder="Search centres" label="Search centres" />
          </form>
          {rows.length ? (
            <DataTable
              caption="Study centres"
              rows={rows}
              rowKey={(c) => c.id}
              columns={[
                { header: "Centre", cell: (c) => <button type="button" className="min-h-10 text-left font-semibold text-brand hover:underline" onClick={() => setOpen(c.id)}>{c.name}</button> },
                { header: "State", cell: (c) => c.state },
                { header: "Coordinator", cell: (c) => c.coordinator?.fullName ?? <span className="text-ink-2">—</span> },
                { header: "Students", cell: (c) => c.students.toLocaleString("en-NG"), numeric: true },
                { header: "CBT seats", cell: (c) => c.computers.toLocaleString("en-NG"), numeric: true },
                { header: "Status", cell: (c) => <Badge tone={status(c).tone}>{status(c).label}</Badge> },
              ]}
            />
          ) : (
            <EmptyCard title="No centre matches" icon="search">
              Try another name, code or state.
            </EmptyCard>
          )}
        </>
      )}
      {adding ? (
        <CentreForm
          onClose={() => setAdding(false)}
          onSaved={(c) => {
            setAdding(false);
            setNotice(`Added ${c.name}. Add its rooms next.`);
            setOpen(c.id);
            router.refresh();
          }}
        />
      ) : null}
      {open ? (
        <CentreProfile
          key={open}
          id={open}
          onClose={() => setOpen(null)}
          onSaved={(msg) => {
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function CentreForm({ centre, onClose, onSaved }: { centre?: CentreDetail; onClose: () => void; onSaved: (c: Centre) => void }) {
  const act = useAction();
  const [v, setV] = useState({ name: centre?.name ?? "", code: centre?.code ?? "", address: centre?.address ?? "", state: centre?.state ?? "", phone: centre?.phone ?? "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const f = act.fields;
  async function save() {
    const r = centre ? await act.run<Centre>("save", "PUT", `/academic/centres/${centre.id}`, v) : await act.run<Centre>("save", "POST", "/academic/centres", v);
    if (r.ok) onSaved(r.data);
  }
  return (
    <Panel
      open
      onClose={onClose}
      title={centre ? `Edit ${centre.name}` : "Add a study centre"}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            {centre ? "Save changes" : "Add centre"}
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(f).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <TextField label="Centre name" value={v.name} onChange={set("name")} placeholder="Akure Study Centre" error={f.name} autoFocus />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Code" value={v.code} onChange={set("code")} placeholder="AKR" hint="2 to 6 letters or digits. Used in the student import file." error={f.code} />
        <SelectField label="State" value={v.state} onChange={set("state")} error={f.state}>
          <option value="">Choose a state</option>
          {NG_STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </SelectField>
      </div>
      <TextField label="Address" value={v.address} onChange={set("address")} placeholder="12 Allen Avenue, Ikeja, Lagos" error={f.address} />
      <TextField label="Phone students can call (optional)" type="tel" value={v.phone} onChange={set("phone")} placeholder="0803 555 0142" error={f.phone} />
    </Panel>
  );
}

function CentreProfile({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: (msg: string) => void }) {
  const [c, setC] = useState<CentreDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [coords, setCoords] = useState<StaffOption[] | null>(null);
  const [v, setV] = useState({ address: "", phone: "", coordinatorId: "" });
  const [room, setRoom] = useState<Room | "new" | null>(null);
  const [editAll, setEditAll] = useState(false);
  const [reload, setReload] = useState(0);
  const act = useAction();

  useEffect(() => {
    let alive = true;
    Promise.all([api<CentreDetail>("GET", `/academic/centres/${id}`), api<{ items: StaffOption[] }>("GET", "/academic/staff-options?role=CENTRE_COORDINATOR")]).then(([a, b]) => {
      if (!alive) return;
      if (!a.ok) {
        setFailed(a.error.message ?? "We could not load this centre.");
        return;
      }
      setC(a.data);
      setV({ address: a.data.address ?? "", phone: a.data.phone ?? "", coordinatorId: a.data.coordinator?.id ?? "" });
      setCoords(b.ok ? b.data.items : []);
    });
    return () => {
      alive = false;
    };
  }, [id, reload]);

  async function save() {
    if (!c) return;
    if (v.address !== (c.address ?? "") || v.phone !== (c.phone ?? "")) {
      const r = await act.run("save", "PUT", `/academic/centres/${c.id}`, { name: c.name, code: c.code, state: c.state, address: v.address, phone: v.phone });
      if (!r.ok) return;
    }
    if (v.coordinatorId !== (c.coordinator?.id ?? "")) {
      const r = await act.run("save", "PUT", `/academic/staffing/centres/${c.id}`, { sessionId: null, coordinatorId: v.coordinatorId || null, notify: true });
      if (!r.ok) return;
    }
    onSaved(`Saved ${c.name}.`);
    onClose();
  }

  async function removeRoom(r: Room) {
    const res = await act.run(`del-${r.id}`, "DELETE", `/academic/rooms/${r.id}`);
    if (res.ok) {
      setReload((x) => x + 1);
      onSaved(`Removed ${r.name}.`);
    }
  }

  return (
    <>
    <Panel
      open
      variant="sheet"
      onClose={onClose}
      title={c?.name ?? "Study centre"}
      description={c ? `${c.code} · ${c.state} · ${plural(c.students, "student")}` : undefined}
      onSubmit={save}
      footer={
        c ? (
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={act.busy === "save"}>
              Save centre
            </Button>
          </>
        ) : undefined
      }
    >
      {failed ? (
        <Banner tone="danger" title="Could not load this centre">
          {failed} Close this and try again.
        </Banner>
      ) : !c ? (
        <div role="status" className="flex flex-col gap-3">
          <span className="sr-only">Loading the centre</span>
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="h-12 w-full" />
          <SkeletonLine className="h-12 w-full" />
        </div>
      ) : (
        <>
          {!v.coordinatorId ? <Banner tone="warning" title="Assign a coordinator so students at this centre have someone to contact." /> : null}
          {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
          <TextField label="Address" value={v.address} onChange={(e) => setV((x) => ({ ...x, address: e.target.value }))} error={act.fields.address} />
          <SelectField
            label="Coordinator"
            value={v.coordinatorId}
            onChange={(e) => setV((x) => ({ ...x, coordinatorId: e.target.value }))}
            error={act.fields.coordinatorId}
            hint={coords && !coords.length ? "Nobody has the Centre coordinator role yet. Give it on People & roles (step 5)." : "Required before exams can be scheduled here. The list is staff with the Centre coordinator role."}
          >
            <option value="">Select a staff member</option>
            {c.coordinator && !coords?.some((p) => p.id === c.coordinator!.id) ? <option value={c.coordinator.id}>{c.coordinator.fullName}</option> : null}
            {(coords ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
                {p.status === "INVITED" ? " (invited)" : ""}
              </option>
            ))}
          </SelectField>
          <TextField label="Phone students can call" type="tel" value={v.phone} onChange={(e) => setV((x) => ({ ...x, phone: e.target.value }))} error={act.fields.phone} />
          <Button variant="ghost" size="sm" type="button" className="w-fit" leadingIcon="edit" onClick={() => setEditAll(true)}>
            Change name, code or state
          </Button>
          <div className="flex items-center gap-3">
            <h3 className="flex-1 text-overline text-ink-3 uppercase">Rooms</h3>
          </div>
          {c.roomsList.length ? (
            <ul className="flex flex-col gap-2">
              {c.roomsList.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <Icon name={r.computers ? "computer" : "meeting_room"} className="text-icon-2" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-label text-ink">{r.name}</span>
                    <span className="text-body-sm text-ink-2">
                      {r.seats} seats · {r.computers ? `${r.computers} computers · exam use` : "no computers · tutorials"}
                    </span>
                  </div>
                  <button type="button" onClick={() => setRoom(r)} aria-label={`Edit ${r.name}`} className="flex size-12 items-center justify-center rounded-md text-icon-2 hover:bg-subtle md:size-10">
                    <Icon name="edit" />
                  </button>
                  <button type="button" onClick={() => removeRoom(r)} aria-label={`Remove ${r.name}`} className="flex size-12 items-center justify-center rounded-md text-icon-2 hover:bg-subtle md:size-10">
                    <Icon name={act.busy === `del-${r.id}` ? "progress_activity" : "delete"} className={act.busy === `del-${r.id}` ? "spin" : ""} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-2">No rooms yet. A centre needs at least one room; a room with computers is needed for computer-based exams.</p>
          )}
          <Button variant="ghost" type="button" size="sm" leadingIcon="add" className="w-fit" onClick={() => setRoom("new")}>
            Add room
          </Button>
        </>
      )}
    </Panel>
      {room && c ? (
        <RoomForm
          centreId={c.id}
          room={room === "new" ? null : room}
          onClose={() => setRoom(null)}
          onSaved={(name) => {
            setRoom(null);
            setReload((x) => x + 1);
            onSaved(`Saved ${name}.`);
          }}
        />
      ) : null}
      {editAll && c ? (
        <CentreForm
          centre={c}
          onClose={() => setEditAll(false)}
          onSaved={(x) => {
            setEditAll(false);
            setReload((r) => r + 1);
            onSaved(`Saved ${x.name}.`);
          }}
        />
      ) : null}
    </>
  );
}

function RoomForm({ centreId, room, onClose, onSaved }: { centreId: string; room: Room | null; onClose: () => void; onSaved: (name: string) => void }) {
  const act = useAction();
  const [v, setV] = useState({ name: room?.name ?? "", seats: room ? String(room.seats) : "", computers: room ? String(room.computers) : "0" });
  const f = act.fields;
  async function save() {
    const body = { name: v.name, seats: Number(v.seats), computers: Number(v.computers || 0) };
    const r = room ? await act.run<Room>("save", "PUT", `/academic/rooms/${room.id}`, body) : await act.run<Room>("save", "POST", `/academic/centres/${centreId}/rooms`, body);
    if (r.ok) onSaved(r.data.name);
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title={room ? `Edit ${room.name}` : "Add a room"}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            {room ? "Save room" : "Add room"}
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(f).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <TextField label="Room name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} placeholder="CBT Lab 1" error={f.name} autoFocus />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Seats" inputMode="numeric" value={v.seats} onChange={(e) => setV((x) => ({ ...x, seats: e.target.value }))} error={f.seats} />
        <TextField label="Computers" inputMode="numeric" value={v.computers} onChange={(e) => setV((x) => ({ ...x, computers: e.target.value }))} error={f.computers} hint="0 for a tutorial room" />
      </div>
    </Panel>
  );
}
