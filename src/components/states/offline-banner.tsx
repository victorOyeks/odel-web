"use client";

import { useSyncExternalStore } from "react";
import { Banner } from "@/components/ui/banner";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Shows whenever the device loses its connection (D0 Banner · Offline). */
export function OfflineBanner({ className }: { className?: string }) {
  const offline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
  if (!offline) return null;
  return (
    <Banner tone="offline" title="You’re offline" className={className}>
      Pages you open now will not load. We will carry on when you reconnect.
    </Banner>
  );
}
