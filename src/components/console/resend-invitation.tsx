"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

/** SA-01b "Resend invitation". The result is announced next to the button. */
export function ResendInvitation({ tenantId, adminName }: { tenantId: string; adminName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");
  async function send() {
    setState("busy");
    const r = await api("POST", `/platform/tenants/${tenantId}/resend-invitation`);
    if (r.ok) {
      setState("sent");
      setMessage(`Invitation emailed to ${adminName} again.`);
    } else {
      setState("failed");
      setMessage(r.error.message ?? "We could not resend the invitation. Try again.");
    }
  }
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button onClick={send} loading={state === "busy"} leadingIcon={state === "sent" ? "check" : "mail"}>
        {state === "sent" ? "Invitation sent" : "Resend invitation"}
      </Button>
      <p role="status" className={state === "failed" ? "text-body-sm text-danger" : "text-body-sm text-success-ink"}>
        {state === "sent" || state === "failed" ? message : ""}
      </p>
    </div>
  );
}
