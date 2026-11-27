"use client";

import { hardNavigate } from "@/lib/navigate";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { RoleAssignment, Session } from "@/lib/types";
import type { Surface } from "@/lib/host";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Banner } from "@/components/ui/banner";
import { roleIcon } from "@/components/shell/roles";
import { AuthLead, AuthTitle } from "./auth-layout";
import { pathForStage } from "./routing";

/** W-06 Choose role. A radio group: arrow keys move, the button confirms. */
export function RoleChooser({ roles, initial, surface, next }: { roles: RoleAssignment[]; initial: string | null; surface: Surface; next: string }) {
  const [chosen, setChosen] = useState(initial ?? roles[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = roles.find((r) => r.id === chosen);

  async function go() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const r = await api<Session>("POST", "/me/active-role", { roleAssignmentId: chosen });
    if (r.ok) {
      hardNavigate(pathForStage(r.data.stage, surface, next));
      return;
    }
    setBusy(false);
    setError(r.error.message ?? "We could not switch role. Try again.");
  }

  return (
    <div className="flex flex-col gap-5">
      <AuthTitle>Which role are you working in?</AuthTitle>
      <AuthLead>You can switch at any time from the menu. We will remember your choice.</AuthLead>
      {error ? <Banner tone="danger" title={error} /> : null}
      <div role="radiogroup" aria-label="Your roles" className="flex flex-col gap-5">
        {roles.map((r) => {
          const on = r.id === chosen;
          return (
            <label
              key={r.id}
              className={cn(
                "flex cursor-pointer items-center gap-3.5 rounded-lg px-4 py-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                on ? "border-2 border-brand bg-brand-subtle" : "border border-line bg-surface hover:border-line-strong",
              )}
            >
              <input type="radio" name="role" value={r.id} checked={on} onChange={() => setChosen(r.id)} className="sr-only" />
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", on ? "bg-surface" : "bg-subtle")}>
                <Icon name={roleIcon(r.role)} className="text-brand" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-label-lg text-ink">{r.roleLabel}</span>
                <span className="text-body-sm text-ink-2">{r.scopeLabel}</span>
              </span>
              <Icon name={on ? "check_circle" : "chevron_right"} size={24} className={on ? "text-brand" : "text-icon-2"} />
            </label>
          );
        })}
      </div>
      <Button size="lg" block loading={busy} onClick={go}>
        {current ? `Continue as ${current.roleLabel}` : "Continue"}
      </Button>
    </div>
  );
}
