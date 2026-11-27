"use client";

import type { AuditItem } from "@/lib/types";
import { Button } from "@/components/ui/button";

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** SA-09 Export: the entries on screen as a CSV file (there is no export endpoint in B0). */
export function ExportCsv({ items }: { items: AuditItem[] }) {
  function go() {
    const rows = [
      ["When", "Who", "Role", "What", "University", "Action", "IP"],
      ...items.map((a) => [a.at, a.actor?.fullName ?? "System", a.actor?.role ?? "", a.summary, a.tenant?.name ?? "", a.action, a.ip ?? ""]),
    ];
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "odel-audit-trail.csv" }).click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="secondary" leadingIcon="download" onClick={go} disabled={!items.length}>
      Export
    </Button>
  );
}
