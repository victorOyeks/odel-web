"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { formatWhen } from "@/lib/format";
import type { Delivery, Paged, WelcomeOverview, WelcomeSend } from "@/lib/types-b1";
import { n, plural, useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, TextArea } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Logo } from "@/components/ui/logo";
import { Panel } from "@/components/ui/panel";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TextField } from "@/components/ui/text-field";
import { EmptyCard } from "@/components/staff/load-state";
import { Stepper } from "./import";

const LINK = /(https?:\/\/\S+\/activate\?\S+|\{activation_link\})/;

/** The email body as students see it: paragraphs, with the activation link drawn as the button the email shows. */
function EmailBody({ body }: { body: string }) {
  const paras = body.split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3 text-body-lg text-ink">
      {paras.map((p, i) =>
        LINK.test(p) && p.replace(LINK, "").trim() === "" ? (
          <span key={i} className="inline-flex h-12 w-fit items-center rounded-md bg-brand px-5 text-label-lg text-white">
            Activate my account
          </span>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {p.split(LINK).map((part, j) => (LINK.test(part) ? <span key={j} className="font-semibold text-brand underline">Activate my account</span> : part))}
          </p>
        ),
      )}
    </div>
  );
}

export function WelcomeView({ data, university }: { data: WelcomeOverview; university: { name: string; logoUrl: string | null } }) {
  const router = useRouter();
  const act = useAction();
  const [editing, setEditing] = useState(false);
  const [remind, setRemind] = useState(true);
  const [confirmSend, setConfirmSend] = useState(false);
  const [send, setSend] = useState<WelcomeSend | null>(data.lastSend?.status === "RUNNING" ? data.lastSend : null);
  const [report, setReport] = useState<WelcomeSend | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const a = data.audience;
  const polling = useRef<number | null>(null);

  const poll = useCallback(
    (id: string) => {
      if (polling.current) window.clearInterval(polling.current);
      polling.current = window.setInterval(async () => {
        const r = await api<WelcomeSend>("GET", `/students/welcome/sends/${id}`);
        if (!r.ok) return;
        setSend(r.data);
        if (r.data.status !== "RUNNING") {
          window.clearInterval(polling.current!);
          polling.current = null;
          setSend(null);
          setReport(r.data);
          router.refresh();
        }
      }, 2000);
    },
    [router],
  );

  useEffect(() => {
    if (data.lastSend?.status === "RUNNING") poll(data.lastSend.id);
    return () => {
      if (polling.current) window.clearInterval(polling.current);
    };
  }, [data.lastSend, poll]);

  async function test() {
    setNotice(null);
    const r = await act.run<{ sentTo: string }>("test", "POST", "/students/welcome/test", {});
    if (r.ok) setNotice(`Sent a test to ${r.data.sentTo}. Check that inbox (and spam) before sending to everyone.`);
  }

  async function sendAll() {
    const r = await act.run<WelcomeSend>("send", "POST", "/students/welcome/sends", { remindAfterDays: remind ? 3 : null });
    setConfirmSend(false);
    if (r.ok) {
      setSend(r.data);
      poll(r.data.id);
    }
  }

  if (!a.notActivated && !a.alreadyActive) {
    return (
      <>
        <PageHeader title="Send welcome messages" />
        <EmptyCard title="Import students first" icon="school" action={<ButtonLink href="/staff/students/import" leadingIcon="upload">Import students</ButtonLink>}>
          The welcome email goes to imported students who have not activated yet. Import the portal file, then come back here.
        </EmptyCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Send welcome messages"
        subtitle={`The ${n(a.notActivated)} students not yet activated get this email. The ${n(a.alreadyActive)} already active get nothing.`}
        actions={
          <>
            <Button variant="ghost" leadingIcon="edit" onClick={() => setEditing(true)}>
              Edit the wording
            </Button>
            <Button variant="secondary" leadingIcon="send" onClick={test} loading={act.busy === "test"}>
              Send a test to me
            </Button>
            <Button onClick={() => setConfirmSend(true)} disabled={!a.withEmail || !!send}>
              Send to {n(a.withEmail)} student{a.withEmail === 1 ? "" : "s"}
            </Button>
          </>
        }
      />
      <Stepper step={3} />
      {notice ? <Banner tone="success" title={notice} /> : null}
      {act.error && act.busy === null ? <Banner tone="danger" title="That did not work">{act.error.message}</Banner> : null}
      {a.noEmail ? (
        <Banner tone="warning" title={`${plural(a.noEmail, "student has", "students have")} no email on record`}>
          They are skipped. Add their emails on Students (or in the next portal file), then send again: students who already got it are not emailed twice unless you resend from their record.
        </Banner>
      ) : null}
      {send ? (
        <section aria-label="Sending" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
          <p className="flex items-center gap-2 text-label-lg text-ink">
            <Icon name="progress_activity" className="spin text-brand" />
            Sending in the background
          </p>
          <ProgressBar label={`${n(send.totals.sent + send.totals.failed)} of ${n(send.totals.toSend)} sent`} value={send.progressPercent} />
          <p className="text-body-sm text-ink-2">You can leave this page; the send carries on and the checklist updates when it is done.</p>
        </section>
      ) : null}

      <article aria-label="Email preview" className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex flex-col gap-0.5 border-b border-line px-5 py-4">
          <p className="text-label text-ink">Subject: {data.preview.subject}</p>
          <p className="text-body-sm text-ink-2">Preview for {data.preview.studentName}. Every student gets their own name, programme and link.</p>
        </div>
        <div className="flex items-center gap-3 bg-brand px-5 py-4 text-white">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-white p-1">
            <Logo name={university.name} logoUrl={university.logoUrl} className="size-full" />
          </span>
          <p className="text-label-lg">{university.name} · ODeL</p>
        </div>
        <div className="px-5 py-5">
          <EmailBody body={data.preview.body} />
        </div>
      </article>
      <Checkbox label="Remind anyone who has not activated after 3 days" hint="They get the same email once more, with “Reminder:” before the subject." checked={remind} onChange={(e) => setRemind(e.target.checked)} />

      {data.lastSend && data.lastSend.status !== "RUNNING" && !report ? <LastSend send={data.lastSend} onOpen={() => setReport(data.lastSend)} /> : null}

      <Panel
        open={confirmSend}
        width="sm"
        onClose={() => setConfirmSend(false)}
        title={`Send to ${plural(a.withEmail, "student")}?`}
        description={`${n(a.withEmail)} students with an email get the welcome now${remind ? ", and one reminder after 3 days if they have not activated" : ""}. ${a.noEmail ? `${n(a.noEmail)} without an email are skipped. ` : ""}Already active students are skipped.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSend(false)}>
              Cancel
            </Button>
            <Button onClick={sendAll} loading={act.busy === "send"} leadingIcon="send">
              Send now
            </Button>
          </>
        }
      >
        <p className="text-body text-ink-2">Sent a test to yourself first? It is the best way to check the wording and the link.</p>
      </Panel>

      {report ? <Report send={report} onClose={() => setReport(null)} /> : null}
      {editing ? (
        <TemplateEditor
          data={data}
          onClose={() => setEditing(false)}
          onSaved={(msg) => {
            setEditing(false);
            setNotice(msg);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function LastSend({ send, onOpen }: { send: WelcomeSend; onOpen: () => void }) {
  const t = send.totals;
  return (
    <section aria-label="Last send" className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center">
      <Icon name="mark_email_read" size={24} className="text-success" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-label text-ink">
          Last sent {formatWhen(send.startedAt)}: {n(t.sent)} of {n(t.toSend)} delivered
        </p>
        <p className="text-body-sm text-ink-2">
          {t.failed ? `${n(t.failed)} failed · ` : ""}
          {n(t.skippedNoEmail)} without an email · {n(t.skippedActive)} already active
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpen}>
        Delivery report
      </Button>
    </section>
  );
}

/** W-20c: the send's totals, what failed and why, and the failed list. */
function Report({ send, onClose }: { send: WelcomeSend; onClose: () => void }) {
  const t = send.totals;
  const missed = t.failed + t.skippedNoEmail + t.skippedTestAddress;
  const [failed, setFailed] = useState<Delivery[] | null>(null);
  useEffect(() => {
    Promise.all([
      api<Paged<Delivery>>("GET", `/students/welcome/sends/${send.id}/deliveries?status=FAILED&size=100`),
      api<Paged<Delivery>>("GET", `/students/welcome/sends/${send.id}/deliveries?status=SKIPPED_NO_EMAIL&size=100`),
    ]).then(([a, b]) => setFailed([...(a.ok ? a.data.items : []), ...(b.ok ? b.data.items : [])]));
  }, [send.id]);
  return (
    <Panel
      open
      onClose={onClose}
      title="Welcome messages sent"
      description={`Sent ${formatWhen(send.startedAt)} to ${plural(t.toSend + t.skippedNoEmail, "student")}.${send.remindAfterDays ? ` Anyone who has not activated in ${send.remindAfterDays} days gets one reminder.` : ""}`}
      footer={
        <>
          {missed ? (
            <a href={`/api/v1/students/welcome/sends/${send.id}/failed.csv`} download className="inline-flex h-12 items-center justify-center gap-2 rounded-md border-[1.5px] border-brand px-4 text-label text-brand hover:bg-brand-subtle md:h-10">
              Download the failed list
            </a>
          ) : null}
          <ButtonLink href="/staff/setup">Go to the checklist</ButtonLink>
        </>
      }
    >
      <div className="flex items-center gap-3 rounded-lg border border-line p-4">
        <span className="flex size-10 items-center justify-center rounded-md bg-success-subtle text-success">
          <Icon name="check_circle" />
        </span>
        <div className="flex flex-col">
          <p className="text-label text-ink">
            {n(t.sent)} of {n(t.toSend + t.skippedNoEmail)} emails delivered
          </p>
          <p className="text-body-sm text-ink-2">
            {n(t.skippedNoEmail)} students have no email on record{t.skippedActive ? ` · ${n(t.skippedActive)} already active were skipped` : ""}
          </p>
        </div>
      </div>
      {missed ? (
        <Banner tone="warning" title={`${plural(missed, "student")} did not get the welcome`}>
          They have no email on record, or the address bounced. Download the list, add or correct the email on each student’s record (Students), and resend the welcome from there.
        </Banner>
      ) : null}
      {failed && failed.length ? (
        <DataTable
          caption="Students who did not get the welcome"
          rows={failed}
          rowKey={(d) => d.studentId}
          columns={[
            { header: "Student", cell: (d) => `${d.fullName} · ${d.matricNumber}` },
            { header: "Email", cell: (d) => d.email ?? "—" },
            { header: "Why", cell: (d) => <Badge tone={d.status === "FAILED" ? "danger" : "warning"}>{d.reason ?? (d.status === "FAILED" ? "Failed" : "No email")}</Badge> },
          ]}
        />
      ) : null}
    </Panel>
  );
}

function fill(text: string, fields: WelcomeOverview["fields"]) {
  const ex = Object.fromEntries(fields.map((f) => [f.key, f.example]));
  return text.replace(/\{([a-z_]+)\}/g, (all, k: string) => ex[k] ?? all);
}

/** W-20d: subject and body with {fields}, insert a field at the cursor, live preview, test send of the unsaved text. */
function TemplateEditor({ data, onClose, onSaved }: { data: WelcomeOverview; onClose: () => void; onSaved: (msg: string) => void }) {
  const act = useAction();
  const [subject, setSubject] = useState(data.template.subject);
  const [body, setBody] = useState(data.template.body);
  const [sent, setSent] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement | null>(null);

  function insert(key: string) {
    const el = document.getElementById("welcome-body") as HTMLTextAreaElement | null;
    area.current = el;
    const token = `{${key}}`;
    if (!el) return setBody((b) => b + token);
    const s = el.selectionStart ?? body.length;
    const e = el.selectionEnd ?? body.length;
    const next = body.slice(0, s) + token + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  async function save() {
    const r = await act.run("save", "PUT", "/students/welcome/template", { subject, body });
    if (r.ok) onSaved("Saved the welcome email. It is used for every send from now on.");
  }
  async function test() {
    setSent(null);
    const r = await act.run<{ sentTo: string }>("test", "POST", "/students/welcome/test", { subject, body });
    if (r.ok) setSent(`Sent a test of this wording to ${r.data.sentTo}.`);
  }
  async function restore() {
    const r = await act.run("default", "DELETE", "/students/welcome/template");
    if (r.ok) onSaved("The welcome email is back to the default wording.");
  }

  return (
    <Panel
      open
      variant="sheet"
      onClose={onClose}
      title="Edit the welcome email"
      description="Only the welcome email is edited here. The code and reminder emails use the platform wording."
      onSubmit={save}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" type="button" onClick={test} loading={act.busy === "test"}>
            Send a test to me
          </Button>
          <Button type="submit" loading={act.busy === "save"}>
            Save template
          </Button>
        </>
      }
    >
      {sent ? <Banner tone="success" title={sent} /> : null}
      {act.error && !Object.keys(act.fields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={act.fields.subject} />
      <TextArea id="welcome-body" label="Welcome email" rows={9} value={body} onChange={(e) => setBody(e.target.value)} error={act.fields.body} hint="No length limit. The university crest and the Activate button are added for you; {activation_link} must stay in." />
      <div className="flex flex-col gap-2">
        <p className="text-label text-ink">Insert a field</p>
        <div className="flex flex-wrap gap-2">
          {data.fields.map((f) => (
            <button key={f.key} type="button" onClick={() => insert(f.key)} title={f.label} className="inline-flex min-h-12 items-center rounded-full border border-line-strong bg-surface px-3 font-mono text-body-sm text-ink hover:bg-subtle md:min-h-9">
              {`{${f.key}}`}
              <span className="sr-only"> ({f.label})</span>
            </button>
          ))}
        </div>
      </div>
      <section aria-label="Preview" className="flex flex-col gap-2 rounded-lg bg-subtle p-4">
        <p className="text-overline text-ink-3 uppercase">Preview · {data.preview.studentName}</p>
        <p className="text-label text-ink">{fill(subject, data.fields)}</p>
        <EmailBody body={fill(body, data.fields)} />
      </section>
      <p className="text-body-sm text-ink-2">
        Changes apply to messages sent from now on. Every change is logged.
        {data.template.custom ? (
          <>
            {" "}
            <button type="button" className="min-h-12 font-semibold text-brand md:min-h-0" onClick={restore}>
              Use the default wording
            </button>
          </>
        ) : null}
      </p>
    </Panel>
  );
}
