"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { formatWhen } from "@/lib/format";
import type { ImportHistoryItem, Paged, StudentImportProblem, StudentImportReport, StudentImportResult } from "@/lib/types-b1";
import { cn } from "@/lib/cn";
import { n, plural, uploadFile, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { SkeletonLine } from "@/components/ui/skeleton";

export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Upload file", "Check rows", "Import & notify"];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Steps">
      {steps.map((s, i) => {
        const k = i + 1;
        const done = k < step;
        const cur = k === step;
        return (
          <li key={s} className="flex items-center gap-3" aria-current={cur ? "step" : undefined}>
            <span className={cn("flex size-7 items-center justify-center rounded-full text-label-sm", done ? "bg-success text-white" : cur ? "bg-brand text-white" : "border border-line-strong text-ink-2")}>
              {done ? <Icon name="check" size={16} /> : k}
            </span>
            <span className={cn("text-label", cur || done ? "text-ink" : "text-ink-2")}>
              {s}
              {done ? <span className="sr-only"> (done)</span> : null}
            </span>
            {k < 3 ? <span aria-hidden="true" className="hidden h-px w-12 bg-line-strong sm:block" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

const COLUMNS: [string, string][] = [
  ["matric_number", "Required"],
  ["surname, first_name, other_names", "Required"],
  ["programme_code", "Required"],
  ["level", "Required"],
  ["study_centre", "Required"],
  ["email", "Needed for the welcome email"],
  ["phone", "Optional · contact only"],
  ["gender, date_of_birth", "Optional"],
];

export function ImportFlow({ initial }: { initial: StudentImportReport | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const act = useAction();
  const [report, setReport] = useState<StudentImportReport | null>(initial);
  const [result, setResult] = useState<StudentImportResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [history, setHistory] = useState(false);
  const [problems, setProblems] = useState<StudentImportProblem[] | null>(null);
  const step = result ? 3 : report ? 2 : 1;

  async function choose(f: File | undefined) {
    if (!f) return;
    act.reset();
    setProblems(null);
    if (/\.xlsx?$/i.test(f.name)) {
      act.setError({ error: "not_csv", message: "Save it as CSV (File → Save as → CSV UTF-8) and upload it again." });
      return;
    }
    setUploading(true);
    const up = await uploadFile("/imports/students/uploads", f);
    if (!up.ok) {
      setUploading(false);
      act.setError({ error: "upload", message: up.message });
      return;
    }
    const r = await act.run<StudentImportReport>("check", "POST", "/imports/students/validate", { key: up.key, fileName: f.name });
    setUploading(false);
    if (r.ok) {
      setReport(r.data);
      router.replace(`/staff/students/import?importId=${r.data.importId}`, { scroll: false });
    }
    if (input.current) input.current.value = "";
  }

  async function confirm() {
    if (!report) return;
    const r = await act.run<StudentImportResult>("confirm", "POST", `/imports/students/${report.importId}/confirm`);
    if (r.ok) {
      setResult(r.data);
      router.refresh();
    } else if (r.status === 410) {
      setReport(null);
    }
  }

  async function showAll() {
    if (!report) return;
    const r = await act.run<Paged<StudentImportProblem>>("all", "GET", `/imports/students/${report.importId}/problems?size=500`);
    if (r.ok) setProblems(r.data.items);
  }

  const busyCheck = uploading || act.busy === "check";
  const fileInput = <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose the portal CSV file" onChange={(e) => choose(e.target.files?.[0])} />;
  const shown = problems ?? report?.problems ?? [];
  const totalProblems = report ? report.errors.count + report.warnings.count : 0;

  return (
    <>
      <PageHeader
        title={step === 1 ? "Import admitted students" : step === 2 ? "Check before importing" : "Students imported"}
        subtitle={
          step === 1
            ? "Add new ODeL students from the university portal export. Existing students are updated, never duplicated."
            : step === 2
              ? `${report!.fileName} · ${plural(report!.totalRows, "row")}`
              : `${result!.added.toLocaleString("en-NG")} added · ${result!.updated.toLocaleString("en-NG")} updated · ${result!.skipped.toLocaleString("en-NG")} rows skipped`
        }
        actions={
          step === 1 ? (
            <Button variant="ghost" leadingIcon="history" onClick={() => setHistory(true)}>
              Import history
            </Button>
          ) : step === 2 ? (
            <>
              <Button variant="secondary" leadingIcon="upload" onClick={() => input.current?.click()} loading={busyCheck}>
                Upload a fixed file
              </Button>
              <Button onClick={confirm} loading={act.busy === "confirm"} disabled={!report!.ready.count}>
                Import {n(report!.ready.count)} valid row{report!.ready.count === 1 ? "" : "s"}
              </Button>
            </>
          ) : (
            <ButtonLink href="/staff/students/welcome" leadingIcon="send">
              Send welcome messages
            </ButtonLink>
          )
        }
      />
      <Stepper step={step} />
      {fileInput}
      {act.error && act.busy === null ? (
        <Banner tone="danger" title={step === 1 ? "This file could not be used" : "That did not work"}>
          {act.error.message}
          {act.error.fields ? (
            <ul className="mt-1 list-disc pl-5">
              {Object.values(act.error.fields).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </Banner>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px] lg:gap-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void choose(e.dataTransfer.files?.[0]);
            }}
            className={cn("flex min-h-72 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center", drag ? "border-brand bg-brand-muted" : "border-brand bg-brand-subtle")}
          >
            <Icon name={busyCheck ? "progress_activity" : "upload_file"} size={32} className={cn("text-brand", busyCheck && "spin")} />
            <p className="text-h4 text-ink" role="status">
              {busyCheck ? "Uploading and checking every row…" : "Drag the portal CSV here"}
            </p>
            {!busyCheck ? (
              <>
                <p className="text-body-sm text-ink-2">or</p>
                <Button leadingIcon="upload" onClick={() => input.current?.click()}>
                  Choose file
                </Button>
                <p className="text-body-sm text-ink-2">CSV · up to 20,000 rows · 10 MB. Nothing is saved until you confirm.</p>
              </>
            ) : (
              <p className="text-body-sm text-ink-2">Large files take up to a minute. Keep this page open.</p>
            )}
          </div>
          <section aria-labelledby="cols" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
            <h2 id="cols" className="text-h4 text-ink">
              Columns we need
            </h2>
            <dl className="flex flex-col gap-2">
              {COLUMNS.map(([c, need]) => (
                <div key={c} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="font-mono text-body text-ink">{c}</dt>
                  <dd className="text-body-sm text-ink-2">{need}</dd>
                </div>
              ))}
            </dl>
            <p className="text-body-sm text-ink-2">Column names can be in any case. Excel files: save as CSV UTF-8 first.</p>
            <a href="/api/v1/imports/students/template.csv" download className="inline-flex h-12 w-fit items-center gap-2 rounded-md border-[1.5px] border-brand px-4 text-label text-brand hover:bg-brand-subtle md:h-10">
              <Icon name="download" />
              Download template
            </a>
          </section>
        </div>
      ) : null}

      {step === 2 && report ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Summary tone="success" icon="check_circle" title="Ready to import" value={report.ready.count} detail={`${n(report.ready.new)} new · ${n(report.ready.updated)} updated${report.ready.unchanged ? ` · ${n(report.ready.unchanged)} unchanged` : ""}`} />
            <Summary tone="danger" icon="error" title="Errors to fix" value={report.errors.count} detail="Not imported until fixed" />
            <Summary tone="warning" icon="warning" title="Warnings" value={report.warnings.count} detail="Will import; check later" />
          </div>
          {shown.length ? (
            <DataTable
              caption="Rows that need attention"
              rows={shown}
              rowKey={(p) => `${p.row}-${p.field}-${p.message}`}
              columns={[
                { header: "Row", cell: (p) => n(p.row), numeric: true, className: "w-20" },
                { header: "Matric no.", cell: (p) => p.matricNumber ?? "—" },
                { header: "Name", cell: (p) => p.name ?? "—" },
                { header: "Problem", cell: (p) => p.message },
                { header: "Type", cell: (p) => <Badge tone={p.severity === "ERROR" ? "danger" : "warning"}>{p.severity === "ERROR" ? "Error" : "Warning"}</Badge> },
              ]}
              footer={
                <div className="flex flex-col gap-2 text-body-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Showing {n(shown.length)} of {n(totalProblems)} problems
                    {shown.length < totalProblems ? (
                      <>
                        {" · "}
                        <button type="button" className="min-h-12 font-semibold text-brand md:min-h-0" onClick={showAll}>
                          {act.busy === "all" ? "Loading…" : "Show all"}
                        </button>
                      </>
                    ) : null}
                  </span>
                  <a href={`/api/v1/imports/students/${report.importId}/problems.csv`} download className="inline-flex min-h-12 items-center gap-1 font-semibold text-brand md:min-h-0">
                    <Icon name="download" size={16} />
                    Download problem rows (CSV)
                  </a>
                </div>
              }
            />
          ) : (
            <Banner tone="success" title="Every row is ready">
              Nothing is saved until you choose Import.
            </Banner>
          )}
          <p className="text-body text-ink-2">Nothing has been saved yet. Rows with errors are skipped; fix them in the file and upload it again later (students already imported are updated, not duplicated).</p>
        </>
      ) : null}

      {step === 3 && result ? (
        <>
          <Banner tone="success" title={`${plural(result.added + result.updated, "student")} imported`}>
            {result.added.toLocaleString("en-NG")} new and {result.updated.toLocaleString("en-NG")} updated by {result.importedBy.fullName} at {formatWhen(result.importedAt)}.
            {result.skipped ? ` ${plural(result.skipped, "row")} with errors were skipped: download the problem rows, fix them and import that file.` : ""} No email has gone out yet.
          </Banner>
          <div className="flex flex-wrap gap-3">
            {result.skipped ? (
              <a href={`/api/v1/imports/students/${result.importId}/problems.csv`} download className="inline-flex h-12 items-center gap-2 rounded-md border-[1.5px] border-brand px-4 text-label text-brand hover:bg-brand-subtle md:h-10">
                <Icon name="download" />
                Download problem rows
              </a>
            ) : null}
            <ButtonLink href="/staff/students" variant="secondary">
              See students
            </ButtonLink>
            <ButtonLink href="/staff/students/import" variant="ghost">
              Import another file
            </ButtonLink>
          </div>
        </>
      ) : null}
      {history ? <History onClose={() => setHistory(false)} /> : null}
    </>
  );
}

function Summary({ tone, icon, title, value, detail }: { tone: "success" | "danger" | "warning"; icon: "check_circle" | "error" | "warning"; title: string; value: number; detail: string }) {
  const box = { success: "bg-success-subtle", danger: "bg-danger-subtle", warning: "bg-warning-subtle" }[tone];
  const ink = { success: "text-success-ink", danger: "text-danger", warning: "text-warning-ink" }[tone];
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg p-5", box)}>
      <p className={cn("flex items-center gap-2 text-label", ink)}>
        <Icon name={icon} />
        {title}
      </p>
      <p className="text-h2 text-ink">{value.toLocaleString("en-NG")}</p>
      <p className="text-body-sm text-ink-2">{detail}</p>
    </div>
  );
}

function History({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ImportHistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    api<Paged<ImportHistoryItem>>("GET", "/imports/students?size=50").then((r) => (r.ok ? setItems(r.data.items) : setFailed(true)));
  }, []);
  const latest = items?.[0];
  return (
    <Panel
      open
      variant="sheet"
      onClose={onClose}
      title="Import history"
      description="Every import of admitted students: when, who ran it and what it changed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {latest ? (
            <a href={`/api/v1/imports/students/${latest.id}/problems.csv`} download className="inline-flex h-12 items-center justify-center gap-2 rounded-md border-[1.5px] border-brand px-4 text-label text-brand hover:bg-brand-subtle md:h-10">
              <Icon name="download" />
              Download latest report
            </a>
          ) : null}
        </>
      }
    >
      {failed ? (
        <Banner tone="danger" title="Could not load the history">Close this and try again.</Banner>
      ) : !items ? (
        <SkeletonLine className="h-24 w-full" />
      ) : !items.length ? (
        <p className="text-body text-ink-2">No imports yet. Your first import shows here.</p>
      ) : (
        <DataTable
          caption="Imports, newest first"
          rows={items}
          rowKey={(i) => i.id}
          columns={[
            { header: "When", cell: (i) => formatWhen(i.importedAt) },
            { header: "File", cell: (i) => <span className="break-all">{i.fileName}</span> },
            { header: "Added", cell: (i) => n(i.added), numeric: true },
            { header: "Updated", cell: (i) => n(i.updated), numeric: true },
            { header: "Errors", cell: (i) => n(i.errors), numeric: true },
            { header: "By", cell: (i) => i.importedBy.fullName },
          ]}
        />
      )}
    </Panel>
  );
}
