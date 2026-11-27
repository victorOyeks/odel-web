import type { ChecklistB1 } from "@/lib/types-b1";

type ChecklistStep = ChecklistB1["steps"][number];
import { cn } from "@/lib/cn";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress-bar";

const STATUS: Record<ChecklistStep["status"], { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "warning" },
  DONE: { label: "Done", tone: "success" },
  LOCKED: { label: "Locked", tone: "neutral" },
};

/** W-10 rows. The next step to do gets the one primary button; the rest are secondary. */
export function ChecklistView({ checklist }: { checklist: ChecklistB1 }) {
  const { steps, done, total } = checklist;
  const percent = checklist.percent ?? (total ? (done / total) * 100 : 0);
  const nextUp = steps.find((s) => s.status === "IN_PROGRESS" || s.status === "NOT_STARTED")?.number;
  return (
    <>
      <section aria-label="Progress" className="rounded-lg border border-line bg-surface px-4 py-5 sm:px-6">
        <ProgressBar label={`${done} of ${total} steps complete`} value={percent} />
      </section>
      <section aria-label="Setup steps" className="overflow-hidden rounded-lg border border-line bg-surface">
        <ol>
          {steps.map((s) => (
            <Step key={s.key} step={s} primary={s.number === nextUp} />
          ))}
        </ol>
      </section>
    </>
  );
}

function Step({ step, primary }: { step: ChecklistStep; primary: boolean }) {
  const st = STATUS[step.status];
  const isDone = step.status === "DONE";
  const locked = step.status === "LOCKED";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-4 py-3.5 first:border-0 sm:flex-nowrap sm:px-6">
      <span
        aria-hidden="true"
        className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-label", isDone ? "bg-success-subtle text-success" : "bg-subtle text-ink-2")}
      >
        {isDone ? <Icon name="check" /> : step.number}
      </span>
      <div className="flex min-w-0 flex-1 basis-[calc(100%-48px)] flex-col gap-0.5 sm:basis-auto">
        <p className="text-label-lg text-ink">
          <span className="sr-only">Step {step.number}: </span>
          {step.title}
        </p>
        <p className="text-body-sm text-ink-2">{step.summary}</p>
        {locked && step.lockedReason ? (
          <p className="flex items-center gap-1 text-body-sm text-ink-2">
            <Icon name="lock" size={16} className="text-icon-2" />
            {step.lockedReason}
          </p>
        ) : null}
      </div>
      <div className="ml-12 flex items-center gap-3 sm:ml-0">
        <Badge tone={st.tone}>{st.label}</Badge>
        {!locked && step.href ? (
          <ButtonLink href={step.href} size="sm" variant={primary ? "primary" : isDone ? "ghost" : "secondary"} prefetch={false}>
            <span aria-hidden="true">{step.actionLabel ?? (isDone ? "Edit" : step.status === "IN_PROGRESS" ? "Continue" : "Start")}</span>
            <span className="sr-only">{`${step.actionLabel ?? (isDone ? "Edit" : step.status === "IN_PROGRESS" ? "Continue" : "Start")}: ${step.title}`}</span>
          </ButtonLink>
        ) : null}
      </div>
    </li>
  );
}
