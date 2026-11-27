"use client";

import { useEffect } from "react";

/** Registers /sw.js (offline page only, for now). Skipped in development to keep reloads honest. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
