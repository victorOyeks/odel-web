"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportProblem } from "@/lib/types-b1";
import { plural, uploadFile, useAction } from "@/lib/use-action";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";

interface Checked {
  id: string;
  totalRows: number;
  readyRows: number;
  problemRows: number;
  problems: ImportProblem[];
  summary?: string;
  status: string;
}

/**
 * W-12c / W-13c / W-15c: download the template, choose a CSV, it goes browser → storage, the API checks every row
 * and saves nothing; "Import the rest" confirms the ready rows.
 */
export function CsvImport({
  open,
  onClose,
  title,
  intro,
  templateHref,
  uploadPath,
  checkPath,
  confirmPath,
  problemsHref,
  doneMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro: string;
  templateHref: string;
  uploadPath: string;
  checkPath: string;
  confirmPath: (id: string) => string;
  problemsHref?: (id: string) => string;
  doneMessage: (result: Record<string, unknown>) => string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, run, reset, setError } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function close() {
    setFile(null);
    setChecked(null);
    setDone(null);
    reset();
    if (input.current) input.current.value = "";
    onClose();
  }

  async function choose(f: File | undefined) {
    if (!f) return;
    reset();
    setChecked(null);
    setFile(f);
    if (!/\.csv$/i.test(f.name)) {
      setError({ error: "not_csv", message: "Upload a CSV file. In Excel use File → Save as → CSV UTF-8, then choose it here." });
      return;
    }
    setUploading(true);
    const up = await uploadFile(uploadPath, f);
    setUploading(false);
    if (!up.ok) {
      setError({ error: "upload", message: up.message });
      return;
    }
    const r = await run<Checked>("check", "POST", checkPath, { key: up.key, fileName: f.name });
    if (r.ok) setChecked(r.data);
  }

  async function confirm() {
    if (!checked) return;
    const r = await run<Record<string, unknown>>("confirm", "POST", confirmPath(checked.id));
    if (r.ok) {
      setDone(doneMessage(r.data));
      router.refresh();
    }
  }

  const checking = busy === "check" || uploading;

  return (
    <Panel
      open={open}
      onClose={close}
      title={title}
      description={intro}
      footer={
        done ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {checked && checked.problemRows > 0 && problemsHref ? (
              <a href={problemsHref(checked.id)} download className="inline-flex h-12 items-center justify-center gap-2 rounded-md border-[1.5px] border-brand px-4 text-label text-brand hover:bg-brand-subtle md:h-10">
                Download problem rows
              </a>
            ) : null}
            <Button onClick={confirm} loading={busy === "confirm"} disabled={!checked || checked.readyRows === 0}>
              {checked && checked.problemRows > 0 ? "Import the rest" : "Import"}
            </Button>
          </>
        )
      }
    >
      <a href={templateHref} download className="inline-flex min-h-12 w-fit items-center gap-1.5 text-label text-brand md:min-h-0">
        <Icon name="download" />
        Download template
      </a>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose a CSV file" onChange={(e) => choose(e.target.files?.[0] ?? undefined)} />
      {done ? (
        <Banner tone="success" title="Imported">
          {done}
        </Banner>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-line p-4">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${checked ? "bg-success-subtle text-success" : "bg-subtle text-icon-2"}`}>
              <Icon name={checked ? "check_circle" : checking ? "progress_activity" : "upload_file"} className={checking ? "spin" : ""} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="truncate text-label text-ink">{file?.name ?? "No file chosen yet"}</p>
              <p className="text-body-sm text-ink-2" role="status">
                {checked ? `Checked · ${plural(checked.totalRows, "row")} · ${checked.readyRows.toLocaleString("en-NG")} ready` : checking ? "Uploading and checking every row…" : "CSV, up to 5 MB"}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()} disabled={checking}>
              {file ? "Choose another" : "Choose file"}
            </Button>
          </div>
          {error ? (
            <Banner tone="danger" title="This file could not be used">
              {error.message}
            </Banner>
          ) : null}
          {checked && checked.problemRows > 0 ? (
            <Banner tone="warning" title={checked.summary ?? `${plural(checked.problemRows, "row")} need fixing`}>
              <ul className="flex flex-col gap-1">
                {checked.problems.slice(0, 8).map((p) => (
                  <li key={`${p.row}-${p.message}`}>
                    Row {p.row.toLocaleString("en-NG")}: {p.message}
                  </li>
                ))}
              </ul>
              {checked.problems.length > 8 ? <p className="mt-1">…and {checked.problems.length - 8} more. Download the problem rows to see them all.</p> : null}
              <p className="mt-1">Nothing is saved until you import. Fix these rows and import them again later, or import the rest now.</p>
            </Banner>
          ) : checked ? (
            <Banner tone="success" title="Every row is ready">
              Nothing is saved until you choose Import.
            </Banner>
          ) : null}
        </>
      )}
    </Panel>
  );
}
