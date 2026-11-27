"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { DepartmentNode, FacultyNode, ProgrammeDetail, ProgrammeNode, Structure } from "@/lib/types-b1";
import { cn } from "@/lib/cn";
import { plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { CsvImport } from "@/components/staff/csv-import";
import { EmptyCard } from "@/components/staff/load-state";

type Sel = { kind: "faculty" | "department" | "programme"; id: string } | null;
type FormState =
  | { kind: "faculty"; item?: FacultyNode }
  | { kind: "department"; item?: DepartmentNode; facultyId?: string }
  | { kind: "programme"; item?: ProgrammeNode; departmentId?: string }
  | null;

const selHref = (kind: string, id: string) => `/staff/academic-setup/structure?sel=${kind}:${id}`;

export function StructureView({ structure, selected, programme }: { structure: Structure; selected: Sel; programme: ProgrammeDetail | null }) {
  const [form, setForm] = useState<FormState>(null);
  const [importing, setImporting] = useState(false);
  const { faculties } = structure;
  const all = {
    faculty: (id: string) => faculties.find((f) => f.id === id),
    department: (id: string) => faculties.flatMap((f) => f.departments).find((d) => d.id === id),
    programme: (id: string) => faculties.flatMap((f) => f.departments.flatMap((d) => d.programmes)).find((p) => p.id === id),
  };
  const parentOf = (deptId: string) => faculties.find((f) => f.departments.some((d) => d.id === deptId));

  const header = (
    <PageHeader
      title="Academic structure"
      subtitle="Faculties, departments and the programmes offered through ODeL."
      actions={
        <>
          <Button variant="secondary" leadingIcon="upload" onClick={() => setImporting(true)}>
            Import from CSV
          </Button>
          <Button leadingIcon="add" onClick={() => setForm({ kind: "faculty" })}>
            Add faculty
          </Button>
        </>
      }
    />
  );

  return (
    <>
      {header}
      {!faculties.length ? (
        <EmptyCard
          title="No faculties yet"
          icon="account_tree"
          action={
            <>
              <Button leadingIcon="add" onClick={() => setForm({ kind: "faculty" })}>
                Add faculty
              </Button>
              <Button variant="secondary" leadingIcon="upload" onClick={() => setImporting(true)}>
                Import from CSV
              </Button>
            </>
          }
        >
          Add each faculty, its departments and the programmes offered through ODeL. Many at once? Import them from a CSV file.
        </EmptyCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.15fr)] lg:gap-6">
          <Tree faculties={faculties} selected={selected} />
          <section aria-label="Details" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
            {selected?.kind === "programme" && programme ? (
              <ProgrammePanel p={programme} onEdit={() => setForm({ kind: "programme", item: all.programme(programme.id), departmentId: programme.department.id })} />
            ) : selected?.kind === "department" && all.department(selected.id) ? (
              <DepartmentPanel d={all.department(selected.id)!} faculty={parentOf(selected.id)!} onEdit={() => setForm({ kind: "department", item: all.department(selected.id), facultyId: parentOf(selected.id)?.id })} onAdd={() => setForm({ kind: "programme", departmentId: selected.id })} />
            ) : selected?.kind === "faculty" && all.faculty(selected.id) ? (
              <FacultyPanel f={all.faculty(selected.id)!} onEdit={() => setForm({ kind: "faculty", item: all.faculty(selected.id) })} onAdd={() => setForm({ kind: "department", facultyId: selected.id })} />
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-body text-ink-2">
                <Icon name="account_tree" size={32} className="text-icon-2" />
                <p className="text-label-lg text-ink">
                  {plural(structure.totals.faculties, "faculty", "faculties")} · {plural(structure.totals.departments, "department")} · {plural(structure.totals.programmes, "programme")}
                </p>
                <p>Choose a faculty, department or programme to see its details, or to add what goes under it.</p>
              </div>
            )}
          </section>
        </div>
      )}

      <StructureForm key={JSON.stringify(form && { k: form.kind, id: form.item?.id })} state={form} faculties={faculties} onClose={() => setForm(null)} />
      <CsvImport
        open={importing}
        onClose={() => setImporting(false)}
        title="Import faculties, departments and programmes"
        intro="Use the template so columns match. Nothing is saved until you confirm."
        templateHref="/api/v1/academic/imports/templates/structure.csv"
        uploadPath="/academic/uploads"
        checkPath="/academic/structure/imports"
        confirmPath={(id) => `/academic/imports/${id}/confirm`}
        problemsHref={(id) => `/api/v1/academic/imports/${id}/problems.csv`}
        doneMessage={(r) => {
          const i = (r.imported ?? {}) as Record<string, number>;
          return `Added ${plural(i.faculties ?? 0, "faculty", "faculties")}, ${plural(i.departments ?? 0, "department")} and ${plural(i.programmes ?? 0, "programme")}.`;
        }}
      />
    </>
  );
}

function Tree({ faculties, selected }: { faculties: FacultyNode[]; selected: Sel }) {
  const openFor = () => {
    const s = new Set<string>();
    if (!selected) return s;
    for (const f of faculties) {
      if (f.id === selected.id) s.add(f.id);
      for (const d of f.departments) {
        if (d.id === selected.id || d.programmes.some((p) => p.id === selected.id)) {
          s.add(f.id);
          s.add(d.id);
        }
      }
    }
    return s;
  };
  const [open, setOpen] = useState<Set<string>>(openFor);
  const toggle = (id: string) => setOpen((o) => {
    const n = new Set(o);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <nav aria-label="Faculties, departments and programmes" className="rounded-lg border border-line bg-surface py-2">
      <ul role="tree" className="flex flex-col">
        {faculties.map((f) => (
          <Node key={f.id} level={1} id={f.id} icon="account_balance" label={f.name} count={plural(f.departmentCount, "dept")} href={selHref("faculty", f.id)} expanded={open.has(f.id)} onToggle={() => toggle(f.id)} current={selected?.id === f.id} hasChildren={f.departments.length > 0}>
            {f.departments.map((d) => (
              <Node key={d.id} level={2} id={d.id} icon="domain" label={d.name} count={plural(d.programmeCount, "programme")} href={selHref("department", d.id)} expanded={open.has(d.id)} onToggle={() => toggle(d.id)} current={selected?.id === d.id} hasChildren={d.programmes.length > 0}>
                {d.programmes.map((p) => (
                  <Node key={p.id} level={3} id={p.id} icon="school" label={p.name} count={plural(p.courseCount, "course")} href={selHref("programme", p.id)} current={selected?.id === p.id} />
                ))}
              </Node>
            ))}
          </Node>
        ))}
      </ul>
    </nav>
  );
}

function Node(props: { id: string; level: number; icon: "account_balance" | "domain" | "school"; label: string; count: string; href: string; current: boolean; expanded?: boolean; onToggle?: () => void; hasChildren?: boolean; children?: ReactNode }) {
  const { level, icon, label, count, href, current, expanded, onToggle, hasChildren, children } = props;
  return (
    <li role="treeitem" aria-expanded={hasChildren ? !!expanded : undefined} aria-selected={current} className="flex flex-col">
      <div className={cn("flex min-h-12 items-center gap-1 pr-3 md:min-h-10", current && "bg-brand-subtle")} style={{ paddingLeft: 8 + (level - 1) * 20 }}>
        {hasChildren ? (
          <button type="button" onClick={onToggle} aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} className="flex size-10 shrink-0 items-center justify-center rounded-md text-icon-2 hover:bg-subtle md:size-8">
            <Icon name={expanded ? "expand_more" : "chevron_right"} />
          </button>
        ) : (
          <span className="size-10 shrink-0 md:size-8" />
        )}
        <Link href={href} scroll={false} aria-current={current ? "true" : undefined} className={cn("flex min-h-10 min-w-0 flex-1 items-center gap-2 text-body", current ? "font-semibold text-brand" : "text-ink hover:text-brand")}>
          <Icon name={icon} className={current ? "text-brand" : "text-icon-2"} />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="shrink-0 text-body-sm font-normal text-ink-2">{count}</span>
        </Link>
      </div>
      {hasChildren && expanded ? <ul role="group">{children}</ul> : null}
    </li>
  );
}

function PanelHead({ kind, name, onEdit }: { kind: string; name: string; onEdit: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-overline text-ink-3 uppercase">{kind}</p>
        <h2 className="text-h3 text-ink">{name}</h2>
      </div>
      <Badge tone="success">Active</Badge>
      <Button variant="secondary" size="sm" leadingIcon="edit" onClick={onEdit} aria-label={`Edit ${name}`}>
        Edit
      </Button>
    </div>
  );
}

function Tiles({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 rounded-md bg-subtle p-3">
          <dt className="text-body-sm text-ink-2">{k}</dt>
          <dd className="text-label text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function ProgrammePanel({ p, onEdit }: { p: ProgrammeDetail; onEdit: () => void }) {
  return (
    <>
      <PanelHead kind="Programme" name={p.name} onEdit={onEdit} />
      <p className="-mt-2 text-body-sm text-ink-2">
        {p.code} · {p.department.name} · {p.faculty.name}
      </p>
      <Tiles
        items={[
          ["Duration", p.durationLabel],
          ["Entry levels", p.entryLevelsLabel],
          ["Graduation", p.minUnitsToGraduate ? `At least ${p.minUnitsToGraduate} units` : "Not set yet"],
          ["Grading rules", p.gradingRules],
        ]}
      />
      <h3 className="text-h4 text-ink">Courses by level</h3>
      {p.byLevel.length ? (
        <DataTable
          caption={`Courses in ${p.name} by level and semester`}
          rows={p.byLevel}
          rowKey={(r) => `${r.level}-${r.semester}`}
          columns={[
            { header: "Level", cell: (r) => `${r.level}L` },
            { header: "Semester", cell: (r) => (r.semester === 1 ? "First" : "Second") },
            { header: "Courses", cell: (r) => r.courses, numeric: true },
            { header: "Units", cell: (r) => r.units, numeric: true },
            { header: "Lecturers assigned", cell: (r) => `${r.lecturersAssigned} of ${r.courses}` },
          ]}
        />
      ) : (
        <p className="text-body text-ink-2">
          No courses yet. Add them in the{" "}
          <Link href="/staff/courses" className="font-semibold text-brand underline-offset-4 hover:underline">
            course catalogue
          </Link>
          .
        </p>
      )}
    </>
  );
}

function DepartmentPanel({ d, faculty, onEdit, onAdd }: { d: DepartmentNode; faculty: FacultyNode; onEdit: () => void; onAdd: () => void }) {
  return (
    <>
      <PanelHead kind="Department" name={d.name} onEdit={onEdit} />
      <Tiles
        items={[
          ["Faculty", faculty.name],
          ["Code", d.code],
          ["Programmes", `${d.programmeCount} through ODeL`],
          ["Courses", `${d.programmes.reduce((a, p) => a + p.courseCount, 0)} in the catalogue`],
        ]}
      />
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-h4 text-ink">Programmes</h3>
        <Button variant="secondary" size="sm" leadingIcon="add" onClick={onAdd}>
          Add programme
        </Button>
      </div>
      {d.programmes.length ? (
        <DataTable
          caption={`Programmes in ${d.name}`}
          rows={d.programmes}
          rowKey={(p) => p.id}
          columns={[
            { header: "Programme", cell: (p) => <Link href={selHref("programme", p.id)} className="font-semibold text-brand hover:underline">{p.name}</Link> },
            { header: "Courses", cell: (p) => p.courseCount, numeric: true },
            { header: "Units to graduate", cell: (p) => p.minUnitsToGraduate ?? "—", numeric: true },
            { header: "Status", cell: () => "Active" },
          ]}
        />
      ) : (
        <p className="text-body text-ink-2">No programmes yet. A department needs at least one programme before students can be imported into it.</p>
      )}
    </>
  );
}

function FacultyPanel({ f, onEdit, onAdd }: { f: FacultyNode; onEdit: () => void; onAdd: () => void }) {
  return (
    <>
      <PanelHead kind="Faculty" name={f.name} onEdit={onEdit} />
      <Tiles items={[["Code", f.code], ["Departments", String(f.departmentCount)], ["Programmes", String(f.departments.reduce((a, d) => a + d.programmeCount, 0))]]} />
      <div className="flex items-center gap-3">
        <h3 className="flex-1 text-h4 text-ink">Departments</h3>
        <Button variant="secondary" size="sm" leadingIcon="add" onClick={onAdd}>
          Add department
        </Button>
      </div>
      {f.departments.length ? (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {f.departments.map((d) => (
            <li key={d.id}>
              <Link href={selHref("department", d.id)} className="flex min-h-12 items-center gap-3 px-4 text-body text-ink hover:bg-subtle">
                <span className="flex-1 font-semibold">{d.name}</span>
                <span className="text-body-sm text-ink-2">{plural(d.programmeCount, "programme")}</span>
                <Icon name="chevron_right" className="text-icon-2" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-2">No departments yet. Add one, then its programmes.</p>
      )}
    </>
  );
}

function StructureForm({ state, faculties, onClose }: { state: FormState; faculties: FacultyNode[]; onClose: () => void }) {
  const router = useRouter();
  const act = useAction();
  const p = state?.kind === "programme" ? state.item : undefined;
  const [v, setV] = useState({
    name: state?.item?.name ?? "",
    code: state?.item?.code ?? "",
    facultyId: state?.kind === "department" ? state.facultyId ?? faculties[0]?.id ?? "" : "",
    departmentId: state?.kind === "programme" ? state.departmentId ?? "" : "",
    degree: p?.degree ?? "B.Sc.",
    durationYears: String(p?.durationYears ?? 4),
    entryLevels: p?.entryLevels ?? [100],
    minUnits: p?.minUnitsToGraduate ? String(p.minUnitsToGraduate) : "",
  });
  if (!state) return null;
  const f = act.fields;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const editing = !!state.item;
  const noun = state.kind === "faculty" ? "faculty" : state.kind === "department" ? "department" : "programme";
  const levels = Array.from({ length: Number(v.durationYears) || 1 }, (_, i) => (i + 1) * 100);
  const departments = faculties.flatMap((fa) => fa.departments.map((d) => ({ ...d, faculty: fa.name })));

  async function save() {
    const id = state!.item?.id;
    const base = `/academic/${state!.kind === "faculty" ? "faculties" : state!.kind === "department" ? "departments" : "programmes"}`;
    const body =
      state!.kind === "faculty"
        ? { name: v.name, code: v.code }
        : state!.kind === "department"
          ? { facultyId: v.facultyId, name: v.name, code: v.code }
          : {
              departmentId: v.departmentId,
              name: v.name,
              code: v.code,
              degree: v.degree,
              durationYears: Number(v.durationYears),
              entryLevels: v.entryLevels.filter((l) => levels.includes(l)),
              minUnitsToGraduate: v.minUnits ? Number(v.minUnits) : null,
            };
    const r = await act.run<{ id: string }>("save", id ? "PUT" : "POST", id ? `${base}/${id}` : base, body);
    if (r.ok) {
      onClose();
      router.push(selHref(state!.kind, r.data.id));
      router.refresh();
    }
  }

  return (
    <Panel
      open
      onClose={onClose}
      title={editing ? `Edit ${state.item!.name}` : `Add ${noun === "faculty" ? "a faculty" : `a ${noun}`}`}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            {editing ? "Save changes" : `Add ${noun}`}
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(f).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      {state.kind === "department" ? (
        <SelectField label="Faculty" value={v.facultyId} onChange={set("facultyId")} error={f.facultyId}>
          {faculties.map((fa) => (
            <option key={fa.id} value={fa.id}>
              {fa.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      {state.kind === "programme" ? (
        <SelectField label="Department" value={v.departmentId} onChange={set("departmentId")} error={f.departmentId}>
          <option value="">Choose a department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} · {d.faculty}
            </option>
          ))}
        </SelectField>
      ) : null}
      <TextField
        label="Name"
        value={v.name}
        onChange={set("name")}
        error={f.name}
        placeholder={state.kind === "faculty" ? "Faculty of Science" : state.kind === "department" ? "Computer Science" : "B.Sc. Computer Science"}
        autoFocus
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Code" value={v.code} onChange={set("code")} error={f.code} hint="Letters, digits and hyphens. Used in CSV files." placeholder={state.kind === "faculty" ? "SCI" : state.kind === "department" ? "CSC" : "BSC-CSC"} />
        {state.kind === "programme" ? <TextField label="Degree" value={v.degree} onChange={set("degree")} error={f.degree} placeholder="B.Sc." /> : null}
      </div>
      {state.kind === "programme" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Duration" value={v.durationYears} onChange={set("durationYears")} error={f.durationYears}>
              {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                <option key={y} value={y}>
                  {y} year{y === 1 ? "" : "s"} · {y * 2} semesters
                </option>
              ))}
            </SelectField>
            <TextField label="Units to graduate (optional)" inputMode="numeric" value={v.minUnits} onChange={set("minUnits")} error={f.minUnitsToGraduate} placeholder="120" />
          </div>
          <fieldset className="flex flex-col gap-1" aria-describedby="entry-hint">
            <legend className="text-label text-ink">Entry levels</legend>
            <p id="entry-hint" className="text-body-sm text-ink-2">
              The levels students can be admitted at. 200L is usual for direct entry.
            </p>
            <div className="flex flex-wrap gap-x-5">
              {levels.map((l) => (
                <Checkbox
                  key={l}
                  label={`${l}L`}
                  checked={v.entryLevels.includes(l)}
                  onChange={(e) => setV((x) => ({ ...x, entryLevels: e.target.checked ? [...x.entryLevels, l].sort() : x.entryLevels.filter((y) => y !== l) }))}
                />
              ))}
            </div>
            {f.entryLevels ? <p className="text-body-sm text-danger">{f.entryLevels}</p> : null}
          </fieldset>
        </>
      ) : null}
    </Panel>
  );
}
