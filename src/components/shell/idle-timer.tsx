"use client";

import { hardNavigate } from "@/lib/navigate";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_EVENT, api } from "@/lib/api/client";
import { signInPath, type Surface } from "@/lib/host";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const WARN_SECONDS = 120;
const STORAGE_KEY = "odel:last-activity";

function fmt(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * S-01 "Are you still there?". The API signs staff out after 30 idle minutes
 * (any API call resets its clock). We mirror that clock here: warn 2 minutes
 * before, sign out at 0. Tabs share the clock through localStorage.
 */
export function IdleTimer({ timeoutSeconds, surface }: { timeoutSeconds: number; surface: Surface }) {
  const pathname = usePathname();
  const timeoutMs = timeoutSeconds * 1000;
  const deadline = useRef(0);
  const [remaining, setRemaining] = useState<number | null>(null); // seconds, only while warning
  const [busy, setBusy] = useState<"stay" | "out" | null>(null);
  const ending = useRef(false);

  const touch = useCallback(
    (at = Date.now(), broadcast = true) => {
      deadline.current = at + timeoutMs;
      if (broadcast) {
        try {
          localStorage.setItem(STORAGE_KEY, String(at));
        } catch {
          /* private mode: this tab only */
        }
      }
    },
    [timeoutMs],
  );

  const end = useCallback(
    async (why: "idle" | "manual") => {
      if (ending.current) return;
      ending.current = true;
      await api("POST", "/auth/sign-out");
      hardNavigate(`${signInPath(surface)}?${why === "idle" ? "reason=idle" : "signedOut=1"}`);
    },
    [surface],
  );

  // Page load and every navigation count as activity (pages call the API).
  useEffect(() => {
    touch();
  }, [pathname, touch]);

  useEffect(() => {
    const onActivity = () => {
      touch();
      setRemaining(null);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        touch(Number(e.newValue), false);
        setRemaining(null);
      }
    };
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    window.addEventListener("storage", onStorage);
    const tick = window.setInterval(() => {
      const left = (deadline.current - Date.now()) / 1000;
      if (left <= 0) void end("idle");
      else if (left <= Math.min(WARN_SECONDS, timeoutSeconds / 2)) setRemaining(left);
      else setRemaining((r) => (r === null ? r : null));
    }, 1000);
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, onActivity);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(tick);
    };
  }, [touch, end, timeoutSeconds]);

  async function stay() {
    setBusy("stay");
    const r = await api("POST", "/session/keepalive");
    setBusy(null);
    setRemaining(null);
    if (!r.ok && r.status === 401) {
      hardNavigate(`${signInPath(surface)}?reason=idle`);
      return;
    }
    touch();
  }

  return (
    <Dialog
      open={remaining !== null}
      onClose={stay}
      alert
      icon="schedule"
      title="Are you still there?"
      actions={
        <>
          <Button variant="ghost" onClick={() => { setBusy("out"); void end("manual"); }} loading={busy === "out"}>
            Sign out now
          </Button>
          <Button onClick={stay} loading={busy === "stay"} autoFocus>
            Keep me signed in
          </Button>
        </>
      }
    >
      <p>Unsaved changes are kept as a draft. For your security we will sign you out in</p>
      <p className="mt-3 font-mono text-[28px] leading-8 font-bold text-ink" aria-hidden="true">
        {fmt(remaining ?? 0)}
      </p>
      <p className="sr-only">less than {Math.max(1, Math.ceil((remaining ?? 0) / 60))} minutes.</p>
    </Dialog>
  );
}
