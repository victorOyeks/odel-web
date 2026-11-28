"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { formatShort } from "@/lib/format";
import type { CarryOver } from "@/lib/types-b2";
import type { Paged, StudentRow } from "@/lib/types-b1";
import { plural, uploadFile, useAction } from "@/lib/use-action";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { DownloadLink } from "./bits";

type Row = CarryOver & { studentName?: string; matricNumber?: string };

/** Carry-overs (until results produce them): list with live search, add one, remove, CSV import with a row report. */
export function CarryOvers({ items, names, canEdit }: { items: Row[]; names: Record<string, { fullName: string; matricNumber: string }>; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [report, setReport] = useState<{ totalRows: number; added: number; skipped: number; problems: { row: number; message: string }[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const act = useAction();
  const who = (r: Row) => ({ name: r.studentName || names[r.studentId]?.fullName || "Student", matric: r.matricNumber || names[r.studentId]?.matricNumber || "" });
  const needle = q.trim().toLowerCase();
  const shown = items.filter((r) => {
    if (needle.length < 2) return true;
    const w = who(r);
    return [w.name, w.matric, r.code, r.title].some((x) => x.toLowerCase().includes(needle));
  });

  async function importCsv(f: File) {
    setImporting(true);
    setImportError(null);
    setReport(null);
    const up = await uploadFile("/registration/uploads", f);
    if (!up.ok) {
      setImporting(false);
      return setImportError(up.message);
    }
    const r = await api<NonNullable<typeof report>>("POST", "/registration/carry-overs/imports", { key: up.key, fileName: f.name });
    setImporting(false);
    if (!r.ok) return setImportError(r.error.message ?? "We could not read the file. Check it matches the template and try again.");
    setReport(r.data);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    const r = await act.run("remove", "DELETE", `/registration/carry-overs/${removing.id}`);
    if (r.ok) {
      setNotice(`Removed ${removing.code} from ${who(removing).name}'s carry-overs.`);
      setRemoving(null);
      router.refresh();
    }
  }

  return (
    <>
      {notice ? <Banner tone="success" title={notice} /> : null}
      {importError ? <Banner tone="danger" title="Import did not run">{importError}</Banner> : null}
      {report ? (
        <Banner tone={report.problems.length ? "warning" : "success"} title={`Imported ${plural(report.added, "carry-over")} from ${plural(report.totalRows, "row")}`}>
          {report.skipped ? `${report.skipped} skipped. ` : ""}
          {report.problems.length ? (
            <ul className="mt-1 list-disc pl-5">
              {report.problems.slice(0, 20).map((p) => (
                <li key={p.row}>
                  Row {p.row}: {p.message}
                </li>
              ))}
            </ul>
          ) : (
            "Every row was added or was already there."
          )}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <label className="relative flex w-full items-center sm:max-w-xs">
          <span className="sr-only">Search carry-overs</span>
          <Icon name="search" className="pointer-events-none absolute left-3 text-icon-2" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, matric no. or course"
            autoComplete="off"
            className="h-12 w-full rounded-full border border-transparent bg-subtle pr-4 pl-10 text-body-lg text-ink outline-none placeholder:text-ink-3 focus:border-focus md:h-10 md:text-body"
          />
        </label>
        <div className="flex flex-1 flex-wrap gap-2 md:justify-end">
          <DownloadLink href="/api/v1/registration/carry-overs/template.csv" variant="ghost">
            Template
          </DownloadLink>
          {canEdit ? (
            <>
              <Button variant="secondary" leadingIcon="upload" loading={importing} onClick={() => file.current?.click()}>
                Import CSV
              </Button>
              <Button leadingIcon="add" onClick={() => setAdding(true)}>
                Add a carry-over
              </Button>
            </>
          ) : null}
        </div>
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importCsv(f);
          }}
        />
      </div>
      {!shown.length ? (
        <div className="rounded-lg border border-line bg-surface p-6 text-center text-body text-ink-2">
          {items.length ? "No carry-overs match. Check the spelling or the matric number." : "No carry-overs yet. Add one, or import the list from the results office as a CSV (matric_number, course_code, from_session)."}
        </div>
      ) : (
        <DataTable
          caption="Carry-overs"
          rows={shown}
          rowKey={(r) => r.id}
          columns={[
            { header: "Student", cell: (r) => <span className="font-semibold">{who(r).name}</span> },
            { header: "Matric no.", cell: (r) => <span className="font-mono">{who(r).matric}</span> },
            { header: "Course", cell: (r) => `${r.code} · ${r.title} (${r.units} u)` },
            { header: "From", cell: (r) => r.fromSession },
            { header: "Added", cell: (r) => `${formatShort(r.createdAt)}${r.createdBy ? ` · ${r.createdBy}` : ""}` },
            { header: "Status", cell: (r) => <Badge tone={r.status === "OPEN" ? "warning" : "success"}>{r.status === "OPEN" ? "Open" : "Cleared"}</Badge> },
          ]}
          rowAction={
            canEdit
              ? (r) => (
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(r)}>
                    Remove
                  </Button>
                )
              : undefined
          }
        />
      )}
      {adding ? (
        <AddCarryOver
          onClose={() => setAdding(false)}
          onAdded={(msg) => {
            setAdding(false);
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        icon="delete"
        iconClassName="text-danger"
        title={removing ? `Remove ${removing.code}?` : ""}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={act.busy === "remove"} onClick={remove}>
              Remove
            </Button>
          </>
        }
      >
        {act.error ? <span className="text-danger">{act.error.message}</span> : removing ? `${who(removing).name} will no longer see ${removing.code} pinned when registering.` : null}
      </Dialog>
    </>
  );
}

function AddCarryOver({ onClose, onAdded }: { onClose: () => void; onAdded: (msg: string) => void }) {
  const act = useAction();
  const [matric, setMatric] = useState("");
  const [code, setCode] = useState("");
  const [from, setFrom] = useState("2025/2026");
  async function save() {
    const m = matric.trim().toUpperCase();
    if (!m) return act.setFields({ matric: "Enter the student's matric number." });
    const found = await api<Paged<StudentRow>>("GET", `/students?q=${encodeURIComponent(m)}&size=5`);
    const st = found.ok ? found.data.items.find((s) => s.matricNumber.toUpperCase() === m) : undefined;
    if (!st) return act.setFields({ matric: `${m} is not a student here. Check the matric number.` });
    const r = await act.run("save", "POST", "/registration/carry-overs", { studentId: st.id, courseCode: code.trim().toUpperCase(), fromSession: from.trim() });
    if (r.ok) onAdded(`Added ${code.trim().toUpperCase()} as a carry-over for ${st.fullName}. It is pinned when they register.`);
  }
  return (
    <Panel
      open
      width="sm"
      onClose={onClose}
      title="Add a carry-over"
      description="The course is pinned on the student's registration and always counts towards the maximum."
      onSubmit={save}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            Add carry-over
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not added">{act.error.message}</Banner> : null}
      <TextField label="Matric number" value={matric} onChange={(e) => setMatric(e.target.value)} placeholder="WU/ODL/24/0153" error={act.fields.matric ?? act.fields.studentId} autoComplete="off" autoFocus />
      <TextField label="Course code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CSC 103" error={act.fields.courseCode} autoComplete="off" />
      <TextField label="Failed in session" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2025/2026" error={act.fields.fromSession} autoComplete="off" />
    </Panel>
  );
}
