"use client";

import { Button } from "@/components/ui/button";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** "Export": the rows on screen as a CSV file (no export endpoint in B1). */
export function ExportRows({ fileName, rows, label = "Export" }: { fileName: string; rows: unknown[][]; label?: string }) {
  function go() {
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: fileName }).click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="secondary" leadingIcon="download" onClick={go} disabled={rows.length < 2}>
      {label}
    </Button>
  );
}
