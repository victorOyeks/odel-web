import type { SessionStage } from "@/lib/types";
import { homePath, signInPath, type Surface } from "@/lib/host";

/** Where /auth/continue (and the sign-in screens) send someone at each stage. */
export function pathForStage(stage: SessionStage, surface: Surface, next: string): string {
  const base = signInPath(surface);
  const q = next && next !== homePath(surface) ? `?next=${encodeURIComponent(next)}` : "";
  switch (stage) {
    case "MFA_SETUP":
      return `${base}/set-up${q}`;
    case "MFA_REQUIRED":
      return `${base}/two-step${q}`;
    case "CHOOSE_ROLE":
      return `${base}/role${q}`;
    case "SIGNED_IN":
      return next || homePath(surface);
  }
}
