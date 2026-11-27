"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

/** S-04 for students: confirm, and on a shared computer also clear what this browser remembers. */
export function StudentSignOut({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  async function out() {
    setBusy(true);
    await api("POST", "/auth/sign-out");
    if (shared) {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked: nothing to clear */
      }
    }
    hardNavigate("/sign-in?signedOut=1");
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Icon name="logout" size={compact ? 24 : 20} className={compact ? "" : "text-icon-2"} />
        {compact ? <span className="sr-only">Sign out</span> : "Sign out"}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        icon="logout"
        title="Sign out?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={out} loading={busy} autoFocus>
              Sign out
            </Button>
          </>
        }
      >
        <label className="flex min-h-12 items-center justify-center gap-2 text-left text-body text-ink">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          This is a shared computer: clear my details
        </label>
      </Dialog>
    </>
  );
}
