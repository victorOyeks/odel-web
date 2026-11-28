import type { BadgeTone } from "@/components/ui/badge";
import type { PaymentStatus, RegRequest } from "@/lib/types-b2";

/** Badge colours shared by server and client components (kept out of "use client" files). */
export const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: "neutral",
  CONFIRMING: "info",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  REFUNDING: "warning",
  REFUNDED: "neutral",
  REVERSED: "danger",
};

export const REQUEST_TONE: Record<RegRequest["status"], BadgeTone> = { PENDING: "warning", APPROVED: "success", DECLINED: "danger", CANCELLED: "neutral" };

export const REASONS = [
  ["MEDICAL", "Medical"],
  ["BEREAVEMENT", "Bereavement"],
  ["WORK", "Work"],
  ["TRAVEL", "Travel"],
  ["FEES", "Fees"],
  ["TECHNICAL", "Technical problem"],
  ["OTHER", "Other"],
] as const;
