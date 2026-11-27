import type { TenantStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const MAP: Record<TenantStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  LIVE: { label: "Live", tone: "success" },
  SETTING_UP: { label: "Setting up", tone: "warning" },
  SUSPENDED: { label: "Paused", tone: "danger" },
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  const m = MAP[status] ?? MAP.SETTING_UP;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export const statusLabel = (s: TenantStatus) => (MAP[s] ?? MAP.SETTING_UP).label;
