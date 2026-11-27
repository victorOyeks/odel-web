"use client";

import { hardNavigate } from "@/lib/navigate";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api/client";
import type { Session } from "@/lib/types";
import type { Surface } from "@/lib/host";
import { signInPath } from "@/lib/host";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { AuthLead, AuthTitle } from "./auth-layout";
import { OtpInput } from "./otp-input";
import { pathForStage } from "./routing";

/** W-03 2FA code, with "Trust this computer for 30 days" and the backup-code route. */
export function VerifyForm({ issuer, surface, next }: { issuer: string; surface: Surface; next: string }) {
  const [mode, setMode] = useState<"code" | "backup">("code");
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState("");
  // Off by default: staff often sign in on shared study-centre computers; trusting one is a deliberate choice.
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "code" && code.length !== 6) {
      setError("Enter all 6 digits from your authenticator app.");
      return;
    }
    if (mode === "backup" && !/^\d{4}-?\d{4}$/.test(backup.trim())) {
      setError("Backup codes look like 4827-1930.");
      return;
    }
    setBusy(true);
    // /auth/mfa/verify answers with the session; /auth/mfa/backup with { session, backupCodesLeft }.
    const res =
      mode === "code"
        ? await api<Session>("POST", "/auth/mfa/verify", { code, trustDevice: trust })
        : await api<{ session: Session; backupCodesLeft: number }>("POST", "/auth/mfa/backup", { code: backup.trim(), trustDevice: trust });
    if (res.ok) {
      const session = "session" in res.data ? res.data.session : res.data;
      hardNavigate(pathForStage(session.stage, surface, next));
      return;
    }
    setBusy(false);
    if (res.error.error === "too_many_attempts" || res.error.error === "signed_out") {
      hardNavigate(`${signInPath(surface)}?error=${res.error.error === "signed_out" ? "expired" : "too_many_attempts"}`);
      return;
    }
    if (res.error.error === "wrong_code") {
      const left = res.error.attemptsLeft;
      setError(
        `That code did not work.${left !== undefined ? ` You have ${left} ${left === 1 ? "try" : "tries"} left.` : ""} ${
          mode === "code" ? "Use the newest code in the app." : "Check the code and try again."
        }`,
      );
      setCode("");
      return;
    }
    setError(res.error.message ?? "Something went wrong. Try again.");
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {mode === "code" ? (
        <>
          <AuthTitle>Enter your 6-digit code</AuthTitle>
          <AuthLead>
            <span id="otp-label">
              Open your authenticator app (Google Authenticator or Microsoft Authenticator) and enter the code for {issuer}.
            </span>
          </AuthLead>
          <OtpInput value={code} onChange={setCode} labelledBy="otp-label" describedBy={error ? "otp-error" : undefined} invalid={!!error} autoFocus />
        </>
      ) : (
        <>
          <AuthTitle>Use a backup code</AuthTitle>
          <AuthLead>Enter one of the backup codes you saved when you set up two-step sign-in. Each code works once.</AuthLead>
          <TextField
            label="Backup code"
            value={backup}
            onChange={(e) => setBackup(e.target.value)}
            placeholder="4827-1930"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            inputClassName="font-mono"
          />
        </>
      )}
      {error ? (
        <p id="otp-error" role="alert" className="-mt-2 text-body text-danger">
          {error}
        </p>
      ) : null}
      <label className="flex min-h-12 cursor-pointer items-center gap-2 text-body text-ink md:min-h-0">
        <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="peer sr-only" />
        <Icon name={trust ? "check_box" : "check_box_outline_blank"} className="text-brand peer-focus-visible:outline-2 peer-focus-visible:outline-focus" />
        Trust this computer for 30 days
      </label>
      <Button type="submit" size="lg" block loading={busy}>
        Verify
      </Button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "code" ? "backup" : "code");
          setError(null);
        }}
        className="min-h-12 self-start text-label text-brand underline-offset-4 hover:underline md:min-h-0"
      >
        {mode === "code" ? "Use a backup code instead" : "Use the code from my app instead"}
      </button>
    </form>
  );
}
