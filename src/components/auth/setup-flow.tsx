"use client";

import { hardNavigate } from "@/lib/navigate";
import { useEffect, useState, type FormEvent } from "react";
import { renderSVG } from "uqr";
import { api } from "@/lib/api/client";
import type { MfaConfirmResult, MfaSetup, Session } from "@/lib/types";
import { signInPath, type Surface } from "@/lib/host";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/ui/banner";
import { SkeletonLine } from "@/components/ui/skeleton";
import { AuthLead, AuthTitle } from "./auth-layout";
import { OtpInput } from "./otp-input";
import { pathForStage } from "./routing";

/** W-04 2FA setup, then W-05 backup codes (shown once, never in the URL). */
export function SetupFlow({ surface, next, fileStem }: { surface: Surface; next: string; fileStem: string }) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ codes: string[]; session: Session } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    api<MfaSetup>("POST", "/auth/mfa/setup").then((r) => {
      if (!live) return;
      if (r.ok) setSetup(r.data);
      else if (r.error.error === "signed_out") hardNavigate(`${signInPath(surface)}?error=expired`);
      else setLoadError(r.error.message ?? "We could not start the setup.");
    });
    return () => {
      live = false;
    };
  }, [surface, attempt]);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter all 6 digits your app shows.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await api<MfaConfirmResult>("POST", "/auth/mfa/setup/confirm", { code });
    setBusy(false);
    if (r.ok) {
      setDone({ codes: r.data.backupCodes, session: r.data.session });
      return;
    }
    if (r.error.error === "too_many_attempts" || r.error.error === "signed_out") {
      hardNavigate(`${signInPath(surface)}?error=${r.error.error === "signed_out" ? "expired" : "too_many_attempts"}`);
      return;
    }
    if (r.error.error === "wrong_code") {
      const left = r.error.attemptsLeft;
      setError(`That code did not work.${left !== undefined ? ` You have ${left} ${left === 1 ? "try" : "tries"} left.` : ""} Use the newest code in the app.`);
      setCode("");
      return;
    }
    setError(r.error.message ?? "Something went wrong. Try again.");
  }

  if (done) return <BackupCodes codes={done.codes} fileStem={fileStem} onContinue={() => hardNavigate(pathForStage(done.session.stage, surface, next))} />;

  return (
    <form onSubmit={confirm} noValidate className="flex flex-col gap-5">
      <AuthTitle>Protect your account</AuthTitle>
      <AuthLead>Staff accounts can change scores and approve results, so we ask for a second step at sign-in.</AuthLead>
      {loadError ? (
        <Banner tone="danger" title="We could not start the setup" action={<button type="button" className="underline" onClick={() => { setLoadError(null); setAttempt((n) => n + 1); }}>Try again</button>}>
          {loadError}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 xs:flex-row">
          <div className="flex size-[132px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-white p-1.5">
            {setup ? (
              <div
                role="img"
                aria-label="QR code to scan with your authenticator app"
                className="size-full [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: renderSVG(setup.otpauthUri, { border: 0, ecc: "M" }) }}
              />
            ) : (
              <div className="skeleton size-full rounded-sm bg-muted" aria-hidden="true" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <p className="text-label-lg text-ink">1. Scan with your authenticator app</p>
            <p className="text-body-sm text-ink-2">Can’t scan? Enter this key:</p>
            {setup ? (
              <p className="font-mono text-[13px] leading-5 break-all text-ink select-all">{setup.secretGrouped}</p>
            ) : (
              <SkeletonLine className="w-40" />
            )}
          </div>
        </div>
        <p id="setup-otp-label" className="text-label-lg text-ink">
          2. Enter the 6-digit code it shows
        </p>
        <OtpInput value={code} onChange={setCode} labelledBy="setup-otp-label" describedBy={error ? "setup-error" : undefined} invalid={!!error} disabled={!setup} />
        {error ? (
          <p id="setup-error" role="alert" className="text-body text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" block loading={busy} disabled={!setup}>
        Turn on two-step sign-in
      </Button>
    </form>
  );
}

function BackupCodes({ codes, fileStem, onContinue }: { codes: string[]; fileStem: string; onContinue: () => void }) {
  function download() {
    const text = `Backup codes for ${fileStem}\nEach code works once. Keep them somewhere safe, not on this computer.\n\n${codes.join("\n")}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${fileStem.toLowerCase().replace(/\s+/g, "-")}-backup-codes.txt` });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="flex flex-col gap-5">
      <AuthTitle>Save your backup codes</AuthTitle>
      <AuthLead>Use one if you lose your phone. Each code works once. Keep them somewhere safe, not on this computer.</AuthLead>
      <ul aria-label="Backup codes" className="grid grid-cols-1 gap-3 rounded-lg bg-subtle p-5 font-mono text-[13px] leading-5 text-ink xs:grid-cols-2">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="no-print flex flex-wrap gap-3">
        <Button type="button" variant="secondary" size="lg" leadingIcon="download" onClick={download}>
          Download
        </Button>
        <Button type="button" variant="secondary" size="lg" leadingIcon="print" onClick={() => window.print()}>
          Print
        </Button>
      </div>
      <Button type="button" size="lg" block className="no-print" onClick={onContinue}>
        I’ve saved them — continue
      </Button>
    </div>
  );
}
