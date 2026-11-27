"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Course, CoursePage, OfferKind, ProgrammeNode, StaffOption } from "@/lib/types-b1";
import { plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { LiveSearchForm } from "@/components/ui/live-search";
import { Checkbox, FilterSelect, SearchBox, SelectField } from "@/components/ui/fields";
import { Pager } from "@/components/ui/nav-bits";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";
import { CsvImport } from "@/components/staff/csv-import";
import { EmptyCard } from "@/components/staff/load-state";
import { ExportRows } from "@/components/staff/export-rows";

type Filters = { search: string; programmeId: string; level: string; semester: string; lecturer: string; page: string };

export function CoursesView({ data, filters, programmes, lecturers }: { data: CoursePage; filters: Filters; programmes: ProgrammeNode[]; lecturers: StaffOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Course | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = !!(filters.search || filters.programmeId || filters.level || filters.semester || filters.lecturer !== "any");
  const levels = [...new Set(programmes.flatMap((p) => p.levels))].sort();
  const href = (p: number) => `/staff/courses?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: String(p) })}`;
  const progName = programmes.find((p) => p.id === filters.programmeId)?.name;

  return (
    <>
      <PageHeader
        title="Course catalogue"
        subtitle={`${plural(data.catalogueTotal, "course")} across ${plural(data.programmeTotal, "programme")}. Courses carry over between sessions.`}
        actions={
          <>
            <Button variant="secondary" leadingIcon="upload" onClick={() => setImporting(true)}>
              Import CSV
            </Button>
            <Button leadingIcon="add" onClick={() => setEditing("new")} disabled={!programmes.length}>
              Add course
            </Button>
          </>
        }
      />
      {notice ? <Banner tone="success" title={notice} /> : null}
      {!programmes.length ? (
        <EmptyCard title="Add programmes first" icon="account_tree" action={<ButtonLink href="/staff/academic-setup/structure">Go to academic structure</ButtonLink>}>
          Every course is offered to one or more programmes. Set up faculties, departments and programmes (step 2), then add courses here.
        </EmptyCard>
      ) : (
        <>
          <LiveSearchForm action="/staff/courses" label="Filter courses" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <SearchBox name="search" defaultValue={filters.search} placeholder="Search course code or title" label="Search courses" />
            <FilterSelect label="Programme" name="programmeId" defaultValue={filters.programmeId}>
              <option value="">All</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Level" name="level" defaultValue={filters.level}>
              <option value="">All</option>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}L
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Semester" name="semester" defaultValue={filters.semester}>
              <option value="">Both</option>
              <option value="1">First</option>
              <option value="2">Second</option>
            </FilterSelect>
            <FilterSelect label="Lecturer" name="lecturer" defaultValue={filters.lecturer}>
              <option value="any">Any</option>
              <option value="none">No lecturer yet</option>
              {lecturers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullName}
                </option>
              ))}
            </FilterSelect>
            <div className="md:ml-auto">
              <ExportRows
                fileName="course-catalogue.csv"
                rows={[["Code", "Title", "Units", "Level", "Semester", "Programmes", "Lecturer"], ...data.items.map((c) => [c.code, c.title, c.units, `${c.level}L`, c.semesterLabel, c.offeredTo.map((o) => o.programmeName).join("; "), c.lecturer?.fullName ?? ""])]}
              />
            </div>
          </LiveSearchForm>
          {!data.items.length ? (
            <EmptyCard
              title={filtered ? "No courses match" : "No courses yet"}
              icon="menu_book"
              action={
                filtered ? (
                  <ButtonLink href="/staff/courses" variant="secondary">
                    Clear filters
                  </ButtonLink>
                ) : (
                  <Button leadingIcon="add" onClick={() => setEditing("new")}>
                    Add course
                  </Button>
                )
              }
            >
              {filtered ? "Try another programme, level or search." : "Add courses one by one, or import the catalogue from a CSV file."}
            </EmptyCard>
          ) : (
            <>
              <DataTable
                caption="Course catalogue"
                rows={data.items}
                rowKey={(c) => c.id}
                columns={[
                  { header: "Code", cell: (c) => <span className="font-semibold">{c.code}</span> },
                  { header: "Title", cell: (c) => c.title },
                  { header: "Units", cell: (c) => c.units, numeric: true },
                  { header: "Level", cell: (c) => `${c.level}L` },
                  { header: "Semester", cell: (c) => c.semesterLabel },
                  { header: "Offered to", cell: (c) => (c.offeredTo.length ? c.offeredTo.map((o) => `${o.programmeName}${o.kind === "ELECTIVE" ? " (elective)" : ""}`).join(", ") : <Badge tone="warning">No programme</Badge>) },
                  { header: "Lecturer", cell: (c) => (c.lecturer ? <span className={c.lecturer.status === "SUSPENDED" ? "text-danger" : ""}>{c.lecturer.fullName}{c.lecturer.status === "SUSPENDED" ? " (suspended)" : ""}</span> : <Badge tone="danger">No lecturer</Badge>) },
                ]}
                rowAction={(c) => (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}>
                    Edit
                  </Button>
                )}
              />
              <Pager page={data.page} size={data.size} total={data.total} href={href} noun={`courses${progName ? ` in ${progName}` : ""}${filters.level ? ` · ${filters.level}L` : ""}`} />
            </>
          )}
        </>
      )}

      {editing ? (
        <CourseForm
          course={editing === "new" ? null : editing}
          programmes={programmes}
          lecturers={lecturers}
          onClose={() => setEditing(null)}
          onSaved={(c, isNew) => {
            setEditing(null);
            setNotice(`${isNew ? "Added" : "Saved"} ${c.code} · ${c.title}.`);
            router.refresh();
          }}
        />
      ) : null}
      <CsvImport
        open={importing}
        onClose={() => setImporting(false)}
        title="Import the course catalogue"
        intro="One row per course and programme. Use the template so columns match. Nothing is saved until you confirm."
        templateHref="/api/v1/academic/imports/templates/catalogue.csv"
        uploadPath="/academic/uploads"
        checkPath="/academic/courses/imports"
        confirmPath={(id) => `/academic/imports/${id}/confirm`}
        problemsHref={(id) => `/api/v1/academic/imports/${id}/problems.csv`}
        doneMessage={(r) => `Added ${plural(((r.imported ?? {}) as Record<string, number>).courses ?? 0, "course")} to the catalogue.`}
      />
    </>
  );
}

function CourseForm({ course, programmes, lecturers, onClose, onSaved }: { course: Course | null; programmes: ProgrammeNode[]; lecturers: StaffOption[]; onClose: () => void; onSaved: (c: Course, isNew: boolean) => void }) {
  const act = useAction();
  const [v, setV] = useState({
    code: course?.code ?? "",
    title: course?.title ?? "",
    units: course ? String(course.units) : "",
    level: course ? String(course.level) : "",
    semester: course ? String(course.semester) : "",
    lecturerId: course?.lecturer?.id ?? "",
  });
  const [offered, setOffered] = useState<Record<string, OfferKind>>(Object.fromEntries((course?.offeredTo ?? []).map((o) => [o.programmeId, o.kind])));
  const [choosing, setChoosing] = useState(false);
  const f = act.fields;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const levels = [...new Set(programmes.flatMap((p) => p.levels))].sort();
  const chosen = programmes.filter((p) => offered[p.id]);

  async function save() {
    const body = {
      code: v.code,
      title: v.title,
      units: Number(v.units),
      level: Number(v.level),
      semester: Number(v.semester),
      offeredTo: Object.entries(offered).map(([programmeId, kind]) => ({ programmeId, kind })),
      lecturerId: v.lecturerId || null,
    };
    const r = course ? await act.run<Course>("save", "PUT", `/academic/courses/${course.id}`, body) : await act.run<Course>("save", "POST", "/academic/courses", body);
    if (r.ok) onSaved(r.data, !course);
  }

  return (
    <Panel
      open
      onClose={onClose}
      title={course ? `Edit ${course.code}` : "Add a course"}
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            {course ? "Save changes" : "Add course"}
          </Button>
        </>
      }
    >
      {act.error && !Object.keys(f).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Code" value={v.code} onChange={set("code")} placeholder="e.g. CSC 211" error={f.code} autoFocus={!course} />
        <TextField label="Units" inputMode="numeric" value={v.units} onChange={set("units")} placeholder="e.g. 3" error={f.units} />
      </div>
      <TextField label="Title" value={v.title} onChange={set("title")} placeholder="Type the course title" error={f.title} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Level" value={v.level} onChange={set("level")} error={f.level}>
          <option value="">Choose a level</option>
          {levels.map((l) => (
            <option key={l} value={l}>
              {l}L
            </option>
          ))}
        </SelectField>
        <SelectField label="Semester" value={v.semester} onChange={set("semester")} error={f.semester}>
          <option value="">Choose a semester</option>
          <option value="1">First</option>
          <option value="2">Second</option>
        </SelectField>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-label text-ink" id="offered-label">
          Offered to
        </p>
        <button
          type="button"
          aria-labelledby="offered-label"
          aria-expanded={choosing}
          onClick={() => setChoosing((c) => !c)}
          className={`flex min-h-12 w-full items-center justify-between rounded-md bg-surface px-3.5 py-2 text-left text-body-lg ${f.offeredTo ? "border-2 border-danger-line" : "border border-line-strong"}`}
        >
          <span className={chosen.length ? "text-ink" : "text-ink-3"}>{chosen.length ? chosen.map((p) => `${p.name}${offered[p.id] === "ELECTIVE" ? " (elective)" : ""}`).join(", ") : "Choose programmes"}</span>
          <span aria-hidden="true" className="material-symbol text-icon-2">
            {choosing ? "expand_less" : "expand_more"}
          </span>
        </button>
        {f.offeredTo ? <p className="text-body-sm text-danger">{f.offeredTo}</p> : null}
        <p className="text-body-sm text-ink-2">Programmes come from Academic structure (step 2). Choose one or more, and say if the course is core or elective in each.</p>
        {choosing ? (
          <ul className="mt-1 flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-md border border-line" aria-label="Programmes">
            {programmes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3">
                <Checkbox
                  className="flex-1"
                  label={p.name}
                  hint={`${p.code} · ${p.levels[0]}L–${p.levels[p.levels.length - 1]}L`}
                  checked={!!offered[p.id]}
                  onChange={(e) =>
                    setOffered((o) => {
                      const n = { ...o };
                      if (e.target.checked) n[p.id] = "COMPULSORY";
                      else delete n[p.id];
                      return n;
                    })
                  }
                />
                {offered[p.id] ? (
                  <label className="flex items-center gap-2 text-body text-ink-2">
                    <span className="sr-only">Core or elective in {p.name}</span>
                    <select value={offered[p.id]} onChange={(e) => setOffered((o) => ({ ...o, [p.id]: e.target.value as OfferKind }))} className="h-12 rounded-md border border-line-strong bg-surface px-2 text-body text-ink md:h-9">
                      <option value="COMPULSORY">Core</option>
                      <option value="ELECTIVE">Elective</option>
                    </select>
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <SelectField label="Lecturer (optional)" value={v.lecturerId} onChange={set("lecturerId")} error={f.lecturerId} hint="Staff with the Lecturer role, from People & roles (step 5). Not invited yet? Leave it empty and assign later under Staffing.">
        <option value="">No lecturer yet</option>
        {course?.lecturer && !lecturers.some((l) => l.id === course.lecturer!.id) ? <option value={course.lecturer.id}>{course.lecturer.fullName} (suspended)</option> : null}
        {lecturers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.fullName}
            {l.scopeLabel ? ` · ${l.scopeLabel}` : ""}
          </option>
        ))}
      </SelectField>
    </Panel>
  );
}
