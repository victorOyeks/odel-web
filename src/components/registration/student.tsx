"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigate";
import { formatDate, formatWhen } from "@/lib/format";
import type { RegRequest, Registration } from "@/lib/types-b2";
import type { ApiError } from "@/lib/types";
import type { UploadTicket } from "@/lib/types-b1";
import { Badge } from "@/components/ui/badge";
import { REASONS, REQUEST_TONE } from "@/lib/b2-labels";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField, TextArea } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";


const kind = (k: RegRequest["kind"]) => (k === "LATE" ? "Late registration" : "Course change");

/** Opens a request's attachment through a short-lived signed link. */
export function AttachmentLink({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        className="inline-flex min-h-12 items-center gap-1.5 text-left font-semibold text-brand underline-offset-4 hover:underline md:min-h-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await api<{ url: string }>("GET", path);
          setBusy(false);
          if (r.ok) window.open(r.data.url, "_blank", "noopener");
          else setError(r.error.message ?? "We could not open the file. Try again.");
        }}
      >
        <Icon name="upload_file" size={20} /> {name}
      </button>
      {error ? <span className="text-body-sm text-danger">{error}</span> : null}
    </span>
  );
}

/** A student's own request: R-07 sent, R-07b declined, R-09c sent, R-09d approved, R-09e declined, B10 late approved. */
export function MyRequestCard({ r }: { r: RegRequest }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function cancel() {
    setBusy(true);
    const res = await api("POST", `/registration/me/requests/${r.id}/cancel`);
    setBusy(false);
    if (res.ok) {
      setAsking(false);
      router.refresh();
    } else setError(res.error);
  }
  const d = r.decision;
  return (
    <section aria-label={`${kind(r.kind)} request`} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-label-lg text-ink">
          {kind(r.kind)}
          {r.change ? ` · ${r.change.summary}` : ""}
        </h3>
        <Badge tone={REQUEST_TONE[r.status]}>{r.statusLabel}</Badge>
      </div>
      <p className="text-body-sm text-ink-2">
        Sent {formatWhen(r.createdAt)}
        {r.centre ? ` · decided by ${r.centre.hasCoordinator ? `the ${r.centre.name} coordinator` : "the ODeL office"}` : ""}
      </p>
      {r.change ? (
        <p className="text-body text-ink">
          Units {r.change.unitsBefore} → {r.change.unitsAfter} of {r.change.maxUnits}
        </p>
      ) : null}
      <p className="text-body text-ink-2">
        {r.reasonCategoryLabel ? `${r.reasonCategoryLabel}: ` : ""}“{r.reason}”
      </p>
      {r.attachment ? <AttachmentLink path={`/registration/me/requests/${r.id}/attachment`} name={`${r.attachment.fileName} · ${r.attachment.sizeLabel}`} /> : null}
      {r.status === "PENDING" ? <p className="text-body text-ink">We email you as soon as it is decided, usually within 2 working days.</p> : null}
      {r.status === "APPROVED" && r.kind === "LATE" ? (
        <Banner tone="success" title={`Approved by ${d?.by ?? "your centre"} on ${d ? formatDate(d.at.slice(0, 10), false) : ""}`}>
          Register by {formatDate(r.registerBy)}.{d?.note ? ` “${d.note}”` : ""}
        </Banner>
      ) : null}
      {r.status === "APPROVED" && r.kind === "CHANGE" ? (
        <Banner tone="success" title={`Approved by ${d?.by ?? "your coordinator"}`}>
          Your registration and slip are updated.{d?.note ? ` “${d.note}”` : ""}
        </Banner>
      ) : null}
      {r.status === "DECLINED" ? (
        <Banner tone="danger" title={`Not approved by ${d?.by ?? "your centre"}`}>
          “{d?.note}” {r.kind === "LATE" ? "You can ask again with what was asked for." : "Your courses stay as they were. You can ask for another change."}
        </Banner>
      ) : null}
      {error ? <Banner tone="danger" title="Not cancelled">{error.message}</Banner> : null}
      {r.status === "PENDING" ? (
        <Button variant="ghost" className="w-fit text-danger" leadingIcon="close" onClick={() => setAsking(true)}>
          Cancel this request
        </Button>
      ) : null}
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        icon="close"
        title="Cancel this request?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setAsking(false)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} onClick={cancel}>
              Cancel request
            </Button>
          </>
        }
      >
        Your coordinator will not see it any more. You can send a new one while {r.kind === "LATE" ? "late registration is open" : "course changes are open"}.
      </Dialog>
    </section>
  );
}

/** R-05b registered: courses, total, slip (PDF), verification code, history, and Request a change (R-09). */
export function RegisteredView({ reg, justDone }: { reg: Registration; justDone: boolean }) {
  return (
    <section aria-labelledby="registered" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
      {justDone ? <Banner tone="success" title="You are registered">We have emailed you your slip. Keep the verification code: anyone can check the slip with it.</Banner> : null}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id="registered" className="text-h3 text-ink">
            Registered · {reg.courseCount} courses · {reg.totalUnits} units
          </h2>
          <p className="text-body text-ink-2">
            Slip <span className="font-mono">{reg.slipNumber}</span>
            {reg.slipVersion > 1 ? ` (version ${reg.slipVersion})` : ""} · submitted {formatWhen(reg.submittedAt)}
            {reg.updatedAt && reg.slipVersion > 1 ? ` · updated ${formatWhen(reg.updatedAt)}` : ""}
            {reg.late ? " · late registration" : ""}
          </p>
        </div>
        <Badge tone="success">Registered</Badge>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {reg.courses.map((c) => (
          <li key={c.courseId} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-[68px] shrink-0 font-mono text-body-sm text-ink-2">{c.code}</span>
            <span className="min-w-0 flex-1 text-body text-ink">{c.title}</span>
            <span className="hidden text-body-sm text-ink-2 sm:inline">{c.kindLabel ?? c.kind}</span>
            <span className="shrink-0 text-body text-ink">{c.units} u</span>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-ink-2">
        Verification code <span className="font-mono text-ink">{reg.verificationCode}</span> · check any slip at{" "}
        <Link href={`/verify?code=${encodeURIComponent(reg.verificationCode)}`} className="font-semibold text-brand underline-offset-4 hover:underline">
          /verify
        </Link>
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ButtonLink href={`/api/v1/registration/me/registrations/${reg.id}/slip.pdf`} external leadingIcon="download" size="lg">
          Download slip (PDF)
        </ButtonLink>
        {reg.canRequestChange ? (
          <ButtonLink href="/registration/change" variant="secondary" leadingIcon="swap_horiz" size="lg">
            Request a course change
          </ButtonLink>
        ) : null}
      </div>
      <p className="text-body-sm text-ink-2">
        {reg.canRequestChange
          ? `Course changes are open until ${formatDate(reg.changesCloseOn)} and need your coordinator's approval.`
          : reg.changesCloseOn && reg.changesCloseOn < new Date().toISOString().slice(0, 10)
            ? `Course changes closed on ${formatDate(reg.changesCloseOn)}.`
            : "You have a course change waiting for a decision."}
      </p>
      {reg.history && reg.history.length > 1 ? (
        <details className="text-body">
          <summary className="min-h-12 cursor-pointer py-2 font-semibold text-brand md:min-h-0">History</summary>
          <ol className="flex flex-col gap-2 pt-2">
            {reg.history.map((h, i) => (
              <li key={i} className="flex flex-col">
                <span className="text-ink">{h.summary}</span>
                <span className="text-body-sm text-ink-2">
                  {formatWhen(h.at)} · slip version {h.slipVersion}
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

const MAX = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "application/pdf": "PDF" };
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** R-06 ask for late registration: reason, a document (C30: the attached file shows on the form, replace or remove it), send. */
export function LateRequestForm({ semesterId, lateClosesOn }: { semesterId: string | null; lateClosesOn: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<{ key: string; fileName: string; contentType: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function attach(f: File) {
    setFields((x) => ({ ...x, attachment: "" }));
    if (!TYPES[f.type]) return setFields((x) => ({ ...x, attachment: "Attach a JPG, PNG or PDF file." }));
    if (f.size > MAX) return setFields((x) => ({ ...x, attachment: `That file is ${kb(f.size)}. Attach one of 5 MB or less: take a smaller photo or save it as PDF.` }));
    setUploading(true);
    const t = await api<UploadTicket>("POST", "/registration/me/uploads", { fileName: f.name, contentType: f.type, size: f.size });
    if (!t.ok) {
      setUploading(false);
      return setFields((x) => ({ ...x, attachment: t.error.fields?.fileName ?? t.error.fields?.size ?? t.error.message ?? "We could not start the upload. Try again." }));
    }
    try {
      const put = await fetch(t.data.uploadUrl, { method: t.data.method ?? "PUT", headers: t.data.headers, body: f });
      if (!put.ok) throw new Error(String(put.status));
      setFile({ key: t.data.key, fileName: f.name, contentType: f.type, size: f.size });
    } catch {
      setFields((x) => ({ ...x, attachment: "The upload did not finish. Check your connection and try again." }));
    }
    setUploading(false);
  }

  async function send() {
    const f: Record<string, string> = {};
    if (!cat) f.reasonCategory = "Choose a reason.";
    if (reason.trim().length < 10) f.reason = "Say why you are late, in at least 10 characters.";
    setFields(f);
    if (Object.keys(f).length) return;
    setBusy(true);
    setError(null);
    const r = await api("POST", "/registration/me/late-requests", { semesterId, reasonCategory: cat, reason: reason.trim(), attachment: file });
    setBusy(false);
    if (r.ok) {
      router.push("/registration?sent=late");
      router.refresh();
      return;
    }
    if (r.status === 401) return hardNavigate("/sign-in?reason=idle&next=%2Fregistration%2Flate");
    setError(r.error);
    setFields(r.error.fields ?? {});
    if (r.error.fields?.attachment) setFile(null);
  }

  return (
    <form
      noValidate
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-h2 text-ink">Ask for late registration</h1>
        <p className="text-body text-ink-2">Your centre coordinator decides{lateClosesOn ? `. Late registration closes ${formatDate(lateClosesOn)}` : ""}. We email you the decision.</p>
      </div>
      {error && !Object.keys(error.fields ?? {}).length ? (
        <Banner tone="danger" title="Not sent">
          {error.message}
        </Banner>
      ) : null}
      <SelectField label="Reason" value={cat} onChange={(e) => setCat(e.target.value)} error={fields.reasonCategory}>
        <option value="">Choose a reason</option>
        {REASONS.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </SelectField>
      <TextArea
        label="What happened"
        value={reason}
        maxLength={1000}
        onChange={(e) => setReason(e.target.value)}
        placeholder="I was admitted to hospital from 10 to 18 Feb. My discharge letter is attached."
        hint={`${reason.trim().length} / 1000`}
        error={fields.reason}
      />
      <div className="flex flex-col gap-2">
        <span className="text-label text-ink">Supporting document (optional)</span>
        {file ? (
          <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
            <Icon name={file.contentType === "application/pdf" ? "upload_file" : "image"} className="text-brand" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-label text-ink">{file.fileName}</span>
              <span className="text-body-sm text-ink-2">
                {TYPES[file.contentType]} · {kb(file.size)}
              </span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()}>
              Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => setFile(null)}>
              Remove
            </Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" leadingIcon="upload_file" loading={uploading} className="w-fit" onClick={() => input.current?.click()}>
            Attach a document
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) attach(f);
          }}
        />
        <p className={fields.attachment ? "text-body-sm text-danger" : "text-body-sm text-ink-2"}>{fields.attachment || "A photo or PDF of a letter, receipt or report. JPG, PNG or PDF, up to 5 MB."}</p>
      </div>
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <ButtonLink href="/registration" variant="ghost" size="lg">
          Cancel
        </ButtonLink>
        <Button type="submit" size="lg" loading={busy} disabled={uploading}>
          Send request
        </Button>
      </div>
    </form>
  );
}
