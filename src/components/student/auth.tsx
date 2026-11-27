"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import type { ApiError } from "@/lib/types";
import type { CodeSent, CodeVerified, PasswordRules, PrivacyNotice, StudentProfile } from "@/lib/types-b1";
import { cn } from "@/lib/cn";
import { AuthLead, AuthTitle } from "@/components/auth/auth-layout";
import { OtpInput } from "@/components/auth/otp-input";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";

// ---------------------------------------------------------------- small pieces

const linkCls = "inline-flex min-h-12 items-center justify-center font-semibold text-brand underline-offset-4 hover:underline";

function Steps({ label, step, of }: { label: string; step: number; of: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label-sm text-ink-2">
        {label} · step {step} of {of}
      </p>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cn("h-1 flex-1 rounded-full", i < step ? "bg-brand" : "bg-muted")} />
        ))}
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, error, hint, autoFocus, autoComplete, disabled }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: ReactNode; autoFocus?: boolean; autoComplete: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <TextField
      label={label}
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={hint}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      disabled={disabled}
      trailing={
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="-mr-2 flex size-12 items-center justify-center text-icon-2" disabled={disabled}>
          <Icon name={show ? "visibility_off" : "visibility"} />
        </button>
      }
    />
  );
}

const RULE_TEST: Record<string, (p: string, min: number) => boolean> = {
  length: (p, min) => p.length >= min,
  letter: (p) => /[A-Za-z]/.test(p),
  number: (p) => /\d/.test(p),
  upper: (p) => /[A-Z]/.test(p),
  symbol: (p) => /[^A-Za-z0-9]/.test(p),
};

function usePasswordRules() {
  const [rules, setRules] = useState<PasswordRules | null>(null);
  useEffect(() => {
    api<PasswordRules>("GET", "/auth/student/password-rules").then((r) => r.ok && setRules(r.data));
  }, []);
  return rules;
}

function RulesList({ rules, password, id }: { rules: PasswordRules | null; password: string; id: string }) {
  if (!rules) return null;
  return (
    <ul id={id} className="flex flex-col gap-1" aria-label="Password rules">
      {rules.rules.map((r) => {
        const ok = (RULE_TEST[r.key] ?? (() => false))(password, rules.minLength);
        return (
          <li key={r.key} className={cn("flex items-center gap-2 text-body-sm", ok ? "text-success-ink" : "text-ink-2")}>
            <Icon name={ok ? "check_circle" : "radio_button_unchecked"} size={16} className={ok ? "text-success" : "text-icon-2"} />
            {r.label}
            <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function rulesMet(rules: PasswordRules | null, p: string) {
  return !rules || rules.rules.every((r) => (RULE_TEST[r.key] ?? (() => true))(p, rules.minLength));
}

/** Seconds left until `until` (a timestamp), ticking once a second. */
function useSecondsLeft(until: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const minutes = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
};
const atTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)).toLowerCase();

// ---------------------------------------------------------------- the code step (M-03, M-03b, M-03R, E-03)

function CodeStep({
  kind,
  sent,
  setSent,
  onVerified,
  onRestart,
  header,
}: {
  kind: "activation" | "reset";
  sent: CodeSent;
  setSent: (s: CodeSent) => void;
  onVerified: (v: CodeVerified) => void;
  onRestart: (message: string) => void;
  header: ReactNode;
}) {
  const base = kind === "activation" ? "/auth/student/activation" : "/auth/student/password-reset";
  const idKey = kind === "activation" ? "activationId" : "resetId";
  const id = (sent.activationId ?? sent.resetId)!;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(sent.codeSent ? null : "We already sent you a code a moment ago. Use that one.");
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const [cantAccess, setCantAccess] = useState(false);
  const [until, setUntil] = useState(() => Date.now() + sent.resendInSeconds * 1000);
  const left = useSecondsLeft(until);
  const labelId = useId();

  async function verify() {
    if (code.length !== 6) return setError("Enter all 6 digits.");
    setBusy("verify");
    setError(null);
    setInfo(null);
    const r = await api<CodeVerified>("POST", `${base}/verify`, { [idKey]: id, code });
    setBusy(null);
    if (r.ok) return onVerified(r.data);
    setCode("");
    const e = r.error;
    if (e.error === "new_code_sent") {
      setInfo(`${e.message} Check ${e.maskedEmail ?? sent.maskedEmail}.`);
      setUntil(Date.now() + (e.resendInSeconds ?? 60) * 1000);
    } else if (e.error === "expired") onRestart(e.message ?? "This took too long. Start again.");
    else setError(e.message ?? "That code did not work. Try again.");
  }

  async function resend() {
    setBusy("resend");
    setError(null);
    const r = await api<CodeSent>("POST", `${base}/resend`, { [idKey]: id });
    setBusy(null);
    if (r.ok) {
      setSent(r.data);
      setInfo(`We sent a new code to ${r.data.maskedEmail}.`);
      setUntil(Date.now() + r.data.resendInSeconds * 1000);
      setCode("");
      return;
    }
    if (r.error.error === "expired") return onRestart(r.error.message ?? "This took too long. Start again.");
    if (r.error.error === "resend_too_soon") {
      setUntil(Date.now() + (r.error.retryInSeconds ?? 60) * 1000);
    }
    setError(r.error.message ?? "We could not send a new code. Try again.");
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      {header}
      <AuthTitle>Enter the 6-digit code</AuthTitle>
      <AuthLead>
        Sent to <span className="font-semibold text-ink">{sent.maskedEmail}</span>. It expires in {minutes(sent.expiresInSeconds)}. Check your spam folder too.
      </AuthLead>
      {info ? <Banner tone="info" title={info} /> : null}
      <div className="flex flex-col gap-2">
        <p id={labelId} className="text-label text-ink">
          Code from the email
        </p>
        <OtpInput value={code} onChange={setCode} labelledBy={labelId} describedBy={error ? `${labelId}-err` : undefined} invalid={!!error} autoFocus />
        {error ? (
          <p id={`${labelId}-err`} role="alert" className="text-body-sm text-danger">
            {error}
          </p>
        ) : null}
        {left > 0 ? (
          <p className="text-body-sm text-ink-2" aria-live="off">
            Resend code in <span className="font-mono">{mmss(left)}</span>
          </p>
        ) : (
          <button type="button" className={cn(linkCls, "w-fit justify-start")} onClick={resend} disabled={busy === "resend"}>
            {busy === "resend" ? "Sending…" : "Send a new code"}
          </button>
        )}
      </div>
      <Button type="submit" size="lg" block loading={busy === "verify"}>
        Verify
      </Button>
      <button type="button" className={linkCls} onClick={() => setCantAccess(true)}>
        I can’t access this email
      </button>
      <Dialog
        open={cantAccess}
        onClose={() => setCantAccess(false)}
        icon="mail"
        iconClassName="text-brand"
        title="Can’t access this email?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCantAccess(false)}>
              Cancel
            </Button>
            {sent.centre?.phone ? (
              <a href={`tel:${sent.centre.phone.replace(/\s+/g, "")}`} className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand px-5 text-label-lg text-white">
                <Icon name="call" />
                Call the ODeL office
              </a>
            ) : null}
          </>
        }
      >
        The ODeL office at {sent.centre?.name ?? "your study centre"} can check your admission letter and update your email. Then we send you a new code.
        {sent.centre?.phone ? <span className="mt-2 block font-semibold text-ink">{sent.centre.phone}</span> : null}
      </Dialog>
    </form>
  );
}

// ---------------------------------------------------------------- M-01 welcome

export function Welcome() {
  return (
    <div className="flex flex-col gap-5">
      <AuthTitle>Welcome to the ODeL portal</AuthTitle>
      <AuthLead>Activate your account the first time, then sign in with your matric number.</AuthLead>
      <Link href="/activate" className="inline-flex h-12 w-full items-center justify-center rounded-md bg-brand text-label-lg text-white">
        Activate my account
      </Link>
      <Link href="/sign-in" className="inline-flex h-12 w-full items-center justify-center rounded-md border-[1.5px] border-brand text-label-lg text-brand">
        Sign in
      </Link>
      <p className="text-center text-body text-ink-2">
        Staff?{" "}
        <Link href="/staff/sign-in" className={linkCls}>
          Staff sign-in
        </Link>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- M-08 sign in, E-04 … E-06

export function SignInForm({ initialLogin, notice, next }: { initialLogin: string; notice: "idle" | "signedOut" | "reset" | null; next: string }) {
  const [login, setLogin] = useState(initialLogin);
  const [password, setPassword] = useState("");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const blocked = err?.error === "locked" || err?.error === "suspended";
  const resetHref = `/reset-password${login ? `?login=${encodeURIComponent(login)}` : ""}`;

  async function submit() {
    if (!login.trim()) return setErr({ error: "login", message: "Enter your matric number or email." });
    if (!password) return setErr({ error: "password", message: "Enter your password." });
    setBusy(true);
    setErr(null);
    const r = await api("POST", "/auth/student/sign-in", { login: login.trim(), password, keepSignedIn: keep });
    if (r.ok) return hardNavigate(next);
    setBusy(false);
    setPassword("");
    setErr(r.error);
  }

  const loginErr = err && ["login", "not_found", "not_activated"].includes(err.error) ? err.message : undefined;
  const pwErr = err && ["password", "wrong_password"].includes(err.error) ? err.message : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <AuthTitle>Welcome back</AuthTitle>
      <AuthLead>Sign in with your matric number or email.</AuthLead>
      {notice === "idle" ? <Banner tone="info" icon="schedule" title="You were signed out">For your security we sign you out after 30 minutes without activity. Nothing you saved is lost.</Banner> : null}
      {notice === "signedOut" ? <Banner tone="success" title="You signed out" /> : null}
      {err?.error === "locked" ? (
        <Banner tone="warning" title="Too many attempts" action={<Link href={resetHref} className="min-h-12 underline md:min-h-0">Reset password</Link>}>
          Sign-in is paused for 15 minutes{err.retryAt ? `, until ${atTime(err.retryAt)}` : ""}. You can reset your password now instead.
        </Banner>
      ) : null}
      {err?.error === "suspended" ? (
        <Banner tone="danger" title="Your account is suspended">
          {err.message?.replace(/^Your account is suspended\.\s*/, "")}
        </Banner>
      ) : null}
      {err && !loginErr && !pwErr && !blocked ? <Banner tone="danger" title="Could not sign in">{err.message}</Banner> : null}
      <TextField label="Matric number or email" value={login} onChange={(e) => setLogin(e.target.value)} error={loginErr} autoComplete="username" autoCapitalize="characters" spellCheck={false} autoFocus={!initialLogin} />
      {err?.error === "not_activated" ? (
        <Link href={`/activate?matric=${encodeURIComponent(login)}`} className={cn(linkCls, "-mt-3 w-fit")}>
          Activate your account
        </Link>
      ) : null}
      <PasswordField label="Password" value={password} onChange={setPassword} error={pwErr} autoComplete="current-password" disabled={blocked} autoFocus={!!initialLogin} />
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-12 items-center gap-2 text-body text-ink-2">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          Keep me signed in on this computer
        </label>
        <Link href={resetHref} className={linkCls}>
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" block loading={busy} disabled={blocked}>
        Sign in
      </Button>
      <Link href="/activate" className={linkCls}>
        First time here? Activate your account
      </Link>
    </form>
  );
}

// ---------------------------------------------------------------- shared: the start step (M-02, M-09, E-01 … E-03, E-06)

function StartStep({
  kind,
  initial,
  onSent,
  restartMessage,
  header,
}: {
  kind: "activation" | "reset";
  initial: string;
  onSent: (s: CodeSent) => void;
  restartMessage: string | null;
  header: ReactNode;
}) {
  const [useEmail, setUseEmail] = useState(kind === "reset" || initial.includes("@"));
  const [login, setLogin] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const label = kind === "reset" ? "Matric number or email" : useEmail ? "Email address" : "Matric number";

  async function submit() {
    if (!login.trim()) return setErr({ error: "empty", message: `Enter your ${kind === "reset" ? "matric number or email" : useEmail ? "email address" : "matric number"}.` });
    setBusy(true);
    setErr(null);
    const r = await api<CodeSent>("POST", kind === "activation" ? "/auth/student/activation/start" : "/auth/student/password-reset/start", kind === "activation" ? { login: login.trim() } : { login: login.trim(), codeAlreadySent: false });
    setBusy(false);
    if (r.ok) return onSent(r.data);
    setErr(r.error);
  }
  const fieldErr = err && ["empty", "matric_not_found", "not_found"].includes(err.error) ? err.message : undefined;

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {header}
      <AuthTitle>{kind === "activation" ? (useEmail ? "Enter your email address" : "Enter your matric number") : "Reset your password"}</AuthTitle>
      <AuthLead>
        {kind === "activation" ? "We will email a code to the address the university has for you." : "Enter your matric number or email. We will email you a code to confirm it is you."}
      </AuthLead>
      {restartMessage ? <Banner tone="warning" title={restartMessage} /> : null}
      {err?.error === "already_active" ? (
        <Banner tone="info" title="This account is already active" action={<span className="flex flex-wrap gap-x-4"><Link href={`/sign-in?login=${encodeURIComponent(login)}`} className="min-h-12 underline md:min-h-0">Sign in</Link><Link href={`/reset-password?login=${encodeURIComponent(login)}`} className="min-h-12 underline md:min-h-0">Reset password</Link></span>}>
          Sign in with your password, or reset it if you have forgotten it.
        </Banner>
      ) : null}
      {err?.error === "not_activated" ? (
        <Banner tone="info" title="This account is not active yet" action={<Link href={`/activate?matric=${encodeURIComponent(login)}`} className="min-h-12 underline md:min-h-0">Activate it</Link>}>
          {err.message}
        </Banner>
      ) : null}
      {err?.error === "no_email" ? (
        <Banner tone="warning" title="We have no email address for you">
          {err.message?.replace(/^We have no email address for you, so we cannot/, "We cannot")}
          {err.centre?.phone ? (
            <a href={`tel:${err.centre.phone.replace(/\s+/g, "")}`} className="mt-1 flex min-h-12 items-center gap-1 font-semibold text-warning-ink md:min-h-0">
              <Icon name="call" size={16} />
              {err.centre.name} · {err.centre.phone}
            </a>
          ) : null}
        </Banner>
      ) : null}
      {err?.error === "suspended" ? <Banner tone="danger" title="Your account is suspended">{err.message?.replace(/^Your account is suspended\.\s*/, "")}</Banner> : null}
      {err?.error === "too_many_codes" ? <Banner tone="warning" title="Too many codes">{err.message}</Banner> : null}
      {err && !fieldErr && !["already_active", "not_activated", "no_email", "suspended", "too_many_codes"].includes(err.error) ? <Banner tone="danger" title="That did not work">{err.message}</Banner> : null}
      <TextField
        label={label}
        type={useEmail && kind === "activation" ? "email" : "text"}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        error={fieldErr}
        hint={kind === "activation" && !useEmail ? "As printed on your admission letter, like WU/ODL/24/0153" : undefined}
        autoComplete="username"
        autoCapitalize={useEmail ? "none" : "characters"}
        spellCheck={false}
        autoFocus
      />
      {err?.error === "matric_not_found" ? (
        <div className="-mt-2 flex flex-col gap-1 rounded-lg bg-subtle p-4 text-body">
          <p className="text-label text-ink">Just admitted?</p>
          <p className="text-ink-2">New students appear about 48 hours after admission. Your study centre can check for you.</p>
        </div>
      ) : null}
      <Button type="submit" size="lg" block loading={busy}>
        {err?.error === "matric_not_found" ? "Try again" : kind === "activation" ? "Send my code" : "Continue"}
      </Button>
      {kind === "activation" ? (
        <button
          type="button"
          className={linkCls}
          onClick={() => {
            setUseEmail((u) => !u);
            setLogin("");
            setErr(null);
          }}
        >
          {useEmail ? "Use my matric number instead" : "Use my email address instead"}
        </button>
      ) : (
        <Link href="/sign-in" className={linkCls}>
          Back to sign in
        </Link>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- password step (M-04, M-11)

function PasswordStep({ title, lead, button, header, onSubmit }: { title: string; lead: string; button: string; header: ReactNode; onSubmit: (p: string, c: string) => Promise<ApiError | null> }) {
  const rules = usePasswordRules();
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const rulesId = useId();
  async function submit() {
    if (!rulesMet(rules, p)) return setErr({ error: "weak", message: "Your password does not meet the rules yet.", fields: { password: rules?.hint ?? "Choose a stronger password." } });
    if (p !== c) return setErr({ error: "match", message: "The two passwords do not match.", fields: { confirmPassword: "The two passwords do not match." } });
    setBusy(true);
    setErr(null);
    const e = await onSubmit(p, c);
    setBusy(false);
    if (e) setErr(e);
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {header}
      <AuthTitle>{title}</AuthTitle>
      <AuthLead>{lead}</AuthLead>
      {err && !err.fields ? <Banner tone="danger" title="Not saved">{err.message}</Banner> : null}
      <div className="flex flex-col gap-2">
        <PasswordField label="New password" value={p} onChange={setP} error={err?.fields?.password} autoComplete="new-password" autoFocus hint={rules ? undefined : "At least 8 characters, with a letter and a number."} />
        <RulesList rules={rules} password={p} id={rulesId} />
      </div>
      <PasswordField label="Confirm password" value={c} onChange={setC} error={err?.fields?.confirmPassword} autoComplete="new-password" />
      <Button type="submit" size="lg" block loading={busy}>
        {button}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- activation (M-02 … M-06)

export function ActivateFlow({ initialMatric }: { initialMatric: string }) {
  type S = { step: "start"; restart: string | null } | { step: "code"; sent: CodeSent } | { step: "password"; token: string } | { step: "privacy"; token: string } | { step: "details" };
  const [s, setS] = useState<S>({ step: "start", restart: null });
  const header = (n: number) => <Steps label="Activate account" step={n} of={4} />;

  if (s.step === "start") return <StartStep kind="activation" initial={initialMatric} restartMessage={s.restart} header={header(1)} onSent={(sent) => setS({ step: "code", sent })} />;
  if (s.step === "code")
    return (
      <CodeStep
        kind="activation"
        sent={s.sent}
        setSent={(sent) => setS({ step: "code", sent })}
        header={header(1)}
        onRestart={(m) => setS({ step: "start", restart: m })}
        onVerified={(v) => setS({ step: "password", token: v.activationToken! })}
      />
    );
  if (s.step === "password")
    return (
      <PasswordStep
        header={header(2)}
        title="Create a password"
        lead="You will use it with your matric number to sign in."
        button="Continue"
        onSubmit={async (password, confirmPassword) => {
          const r = await api("POST", "/auth/student/activation/password", { activationToken: s.token, password, confirmPassword });
          if (r.ok) {
            setS({ step: "privacy", token: s.token });
            return null;
          }
          if (r.error.error === "expired") setS({ step: "start", restart: r.error.message ?? "This took too long. Enter your matric number again." });
          return r.error;
        }}
      />
    );
  if (s.step === "privacy") return <PrivacyStep token={s.token} header={header(3)} onDone={() => setS({ step: "details" })} onExpired={(m) => setS({ step: "start", restart: m })} />;
  return <DetailsStep header={header(4)} />;
}

function PrivacyStep({ token, header, onDone, onExpired }: { token: string; header: ReactNode; onDone: () => void; onExpired: (m: string) => void }) {
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<PrivacyNotice>("GET", "/auth/student/privacy-notice").then((r) => (r.ok ? setNotice(r.data) : setErr("We could not load the privacy notice. Check your connection and try again.")));
  }, []);
  const icons = ["school", "notifications", "visibility", "lock"] as const;
  async function submit() {
    if (!accepted) return setErr("Tick the box to accept the privacy notice.");
    setBusy(true);
    setErr(null);
    const r = await api("POST", "/auth/student/activation/complete", { activationToken: token, acceptPrivacyNotice: true, privacyNoticeVersion: notice?.version });
    setBusy(false);
    if (r.ok) return onDone();
    if (r.error.error === "expired") return onExpired(r.error.message ?? "This took too long. Enter your matric number again.");
    setErr(r.error.message ?? "Something went wrong. Try again.");
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {header}
      <AuthTitle>{notice?.title ?? "How we use your information"}</AuthTitle>
      {notice ? <AuthLead>{notice.intro}</AuthLead> : null}
      {notice ? (
        <ul className="flex flex-col gap-3 rounded-lg bg-subtle p-4">
          {notice.points.map((p, i) => (
            <li key={p} className="flex items-start gap-3 text-body text-ink">
              <Icon name={icons[i % icons.length]} className="mt-0.5 text-brand" />
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      <label className="flex min-h-12 cursor-pointer items-start gap-3">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]" aria-invalid={!!err && !accepted} />
        <span className="text-body-lg text-ink">I have read and accept the privacy notice</span>
      </label>
      {err ? (
        <p role="alert" className="-mt-3 text-body-sm text-danger">
          {err}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={busy} disabled={!notice}>
        Accept and continue
      </Button>
    </form>
  );
}

function DetailsStep({ header }: { header: ReactNode }) {
  const [p, setP] = useState<StudentProfile | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<StudentProfile>("GET", "/student-profile").then((r) => {
      if (r.ok) {
        setP(r.data);
        setPhone(r.data.phone ?? "");
      } else hardNavigate("/");
    });
  }, []);
  async function submit() {
    if (p && phone !== (p.phone ?? "")) {
      setBusy(true);
      const r = await api("PATCH", "/student-profile", { phone });
      setBusy(false);
      if (!r.ok) return setErr(r.error.fields?.phone ?? r.error.message ?? "Check the number and try again.");
    }
    hardNavigate("/?welcome=1");
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {header}
      <AuthTitle>Check your details</AuthTitle>
      <Banner tone="success" title="Your account is active" />
      {p ? (
        <>
          <div className="flex items-center gap-3 rounded-lg bg-brand-subtle p-3">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-brand-muted text-label text-brand">
              {p.initials}
            </span>
            <div className="flex min-w-0 flex-col">
              <p className="text-label-lg text-ink">{p.fullName}</p>
              <p className="text-body-sm text-ink-2">
                {p.matricNumber} · {p.programme.name} · {p.levelLabel}
              </p>
            </div>
          </div>
          <TextField label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={err ?? undefined} autoComplete="tel" hint="For your study centre to reach you. Codes always come by email." />
          <TextField label="Email" value={p.email ?? ""} readOnly disabled hint="Your codes go here. To change it, contact the ODeL office." />
          <TextField label="Study centre" value={p.centre.name} readOnly disabled hint="To move centre, contact the ODeL office." />
        </>
      ) : (
        <div role="status" className="skeleton h-40 rounded-lg bg-muted">
          <span className="sr-only">Loading your details</span>
        </div>
      )}
      <Button type="submit" size="lg" block loading={busy} disabled={!p}>
        Save and go to my dashboard
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- reset (M-09 … M-11)

export function ResetFlow({ initialLogin, codeAlreadySent }: { initialLogin: string; codeAlreadySent: boolean }) {
  type S = { step: "start"; restart: string | null } | { step: "resuming" } | { step: "code"; sent: CodeSent } | { step: "password"; token: string };
  const [s, setS] = useState<S>(codeAlreadySent && initialLogin ? { step: "resuming" } : { step: "start", restart: null });

  useEffect(() => {
    if (s.step !== "resuming") return;
    // From the office's email (W-22b): reuse the code it already sent instead of sending another.
    api<CodeSent>("POST", "/auth/student/password-reset/start", { login: initialLogin, codeAlreadySent: true }).then((r) =>
      setS(r.ok ? { step: "code", sent: r.data } : { step: "start", restart: r.error.message ?? "Enter your matric number or email to get a code." }),
    );
  }, [s.step, initialLogin]);

  if (s.step === "resuming")
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-8 text-body text-ink-2">
        <Icon name="progress_activity" size={32} className="spin text-brand" />
        Getting your code ready…
      </div>
    );
  if (s.step === "start") return <StartStep kind="reset" initial={initialLogin} restartMessage={s.restart} header={null} onSent={(sent) => setS({ step: "code", sent })} />;
  if (s.step === "code")
    return (
      <CodeStep
        kind="reset"
        sent={s.sent}
        setSent={(sent) => setS({ step: "code", sent })}
        header={null}
        onRestart={(m) => setS({ step: "start", restart: m })}
        onVerified={(v) => setS({ step: "password", token: v.resetToken! })}
      />
    );
  return (
    <PasswordStep
      header={null}
      title="Choose a new password"
      lead="You will be signed out of other devices."
      button="Save and sign in"
      onSubmit={async (password, confirmPassword) => {
        const r = await api("POST", "/auth/student/password-reset/complete", { resetToken: s.token, password, confirmPassword });
        if (r.ok) {
          hardNavigate("/");
          return null;
        }
        if (r.error.error === "expired") setS({ step: "start", restart: r.error.message ?? "This took too long. Start again." });
        return r.error;
      }}
    />
  );
}
