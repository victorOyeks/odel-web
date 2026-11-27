"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { GradeBand, GradingInput, GradingRules, Standing } from "@/lib/types-b1";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import { PageHeader } from "@/components/shell/page-header";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { Panel } from "@/components/ui/panel";
import { TextField } from "@/components/ui/text-field";

type BandDraft = { grade: string; from: string; to: string; point: string; remark: string };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

/** The same checks as the API (W-17c), so mistakes show while typing. Returns messages and the cells to mark. */
function check(ca: number, ex: number, pass: number, scale: number, bands: BandDraft[]) {
  const problems: string[] = [];
  const bad = new Set<string>();
  if (ca + ex !== 100) {
    problems.push(`the weights add up to ${Number.isNaN(ca + ex) ? "less than 100" : ca + ex}`);
    bad.add("ca");
    bad.add("ex");
  }
  const parsed = bands.map((b, i) => ({ i, grade: b.grade.trim().toUpperCase(), from: num(b.from), to: num(b.to), point: num(b.point) }));
  parsed.forEach((b) => {
    if (!b.grade) {
      problems.push("a band has no grade");
      bad.add(`${b.i}.grade`);
    }
    if (!Number.isInteger(b.from) || !Number.isInteger(b.to) || b.from > b.to) {
      problems.push(`band ${b.grade || "?"} needs whole numbers, from no bigger than to`);
      bad.add(`${b.i}.from`);
      bad.add(`${b.i}.to`);
    }
    if (!(b.point >= 0 && b.point <= scale)) {
      problems.push(`band ${b.grade || "?"} points must be 0 to ${scale}`);
      bad.add(`${b.i}.point`);
    }
  });
  const sorted = parsed.filter((b) => Number.isInteger(b.from) && Number.isInteger(b.to)).sort((a, b) => a.from - b.from);
  if (sorted.length && sorted[0].from !== 0) {
    problems.push("the bottom band must start at 0");
    bad.add(`${sorted[0].i}.from`);
  }
  if (sorted.length && sorted[sorted.length - 1].to !== 100) {
    problems.push("the top band must end at 100");
    bad.add(`${sorted[sorted.length - 1].i}.to`);
  }
  for (let k = 1; k < sorted.length; k++) {
    const lo = sorted[k - 1];
    const hi = sorted[k];
    if (hi.from <= lo.to) {
      problems.push(`bands ${hi.grade} and ${lo.grade} overlap (${hi.from}–${Math.min(lo.to, hi.to)})`);
      bad.add(`${hi.i}.from`);
      bad.add(`${lo.i}.to`);
    } else if (hi.from > lo.to + 1) {
      problems.push(`scores ${lo.to + 1} to ${hi.from - 1} are in no band`);
      bad.add(`${hi.i}.from`);
      bad.add(`${lo.i}.to`);
    }
  }
  const grades = parsed.map((b) => b.grade);
  if (new Set(grades).size !== grades.length) problems.push("each band needs its own grade");
  if (!(pass >= 0 && pass <= 100)) {
    problems.push("the pass mark must be 0 to 100");
    bad.add("pass");
  } else {
    const pb = sorted.find((b) => pass >= b.from && pass <= b.to);
    if (pb && pb.point <= 0) {
      problems.push(`scores of ${pass} (the pass mark) get 0 points`);
      bad.add("pass");
    }
  }
  return { problems, bad };
}

function example(ca: number, ex: number, bands: BandDraft[]) {
  const caScore = Math.round((ca * 0.8 * 10) / 10);
  const exScore = Math.round(ex * 0.73);
  const total = caScore + exScore;
  const b = bands.find((x) => total >= num(x.from) && total <= num(x.to));
  return `CA ${caScore} + exam ${exScore} = ${total}${b ? ` → ${b.grade} (${b.point} point${b.point === "1" ? "" : "s"})` : ""}`;
}

export function GradingView({ rules, programmes, programmeId }: { rules: GradingRules; programmes: { id: string; name: string }[]; programmeId: string }) {
  const router = useRouter();
  const act = useAction();
  const [ca, setCa] = useState(String(rules.caWeight));
  const [ex, setEx] = useState(String(rules.examWeight));
  const [pass, setPass] = useState(String(rules.passMark));
  const [scale, setScale] = useState(String(rules.scale));
  const [round, setRound] = useState(rules.roundTotals);
  const [bands, setBands] = useState<BandDraft[]>(rules.bands.map((b) => ({ grade: b.grade, from: String(b.from), to: String(b.to), point: String(b.point), remark: b.remark })));
  const [standing, setStanding] = useState<Standing>(rules.standing);
  const [editBands, setEditBands] = useState(false);
  const [standingOpen, setStandingOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { problems, bad } = useMemo(() => check(num(ca), num(ex), num(pass), num(scale) || 5, bands), [ca, ex, pass, scale, bands]);
  const dirty =
    ca !== String(rules.caWeight) ||
    ex !== String(rules.examWeight) ||
    pass !== String(rules.passMark) ||
    scale !== String(rules.scale) ||
    round !== rules.roundTotals ||
    JSON.stringify(bands) !== JSON.stringify(rules.bands.map((b) => ({ grade: b.grade, from: String(b.from), to: String(b.to), point: String(b.point), remark: b.remark })));

  const input = (s: Standing): GradingInput => ({
    caWeight: num(ca),
    examWeight: num(ex),
    passMark: num(pass),
    scale: num(scale) || 5,
    roundTotals: round,
    bands: bands.map<GradeBand>((b) => ({ grade: b.grade.trim().toUpperCase(), from: num(b.from), to: num(b.to), point: num(b.point), remark: b.remark.trim() })),
    standing: s,
  });

  async function save(s = standing): Promise<boolean> {
    const r = await act.run<GradingRules>("save", "PUT", programmeId ? `/academic/grading/programmes/${programmeId}` : "/academic/grading", input(s));
    if (r.ok) {
      setNotice(`Saved. Version ${r.data.version} applies from ${r.data.effectiveSession?.name ?? "the current session"}.`);
      setEditBands(false);
      router.refresh();
      return true;
    }
    return false;
  }

  async function useDefault() {
    const r = await act.run("reset", "DELETE", `/academic/grading/programmes/${programmeId}`);
    if (r.ok) {
      setResetOpen(false);
      router.refresh();
    }
  }

  const setBand = (i: number, k: keyof BandDraft) => (e: React.ChangeEvent<HTMLInputElement>) => setBands((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: e.target.value } : b)));
  const serverFields = act.fields;
  const progName = programmes.find((p) => p.id === programmeId)?.name;

  return (
    <>
      <PageHeader
        title="Grading rules"
        subtitle="The default applies to every programme without its own rules. Changes apply to results not yet submitted."
        actions={
          editBands ? (
            <>
              <Button variant="ghost" onClick={() => { setBands(rules.bands.map((b) => ({ grade: b.grade, from: String(b.from), to: String(b.to), point: String(b.point), remark: b.remark }))); setEditBands(false); act.reset(); }}>
                Cancel
              </Button>
              <Button onClick={() => save()} loading={act.busy === "save"} disabled={problems.length > 0}>
                Save bands
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStandingOpen(true)}>
                Standing and degree class
              </Button>
              <Button onClick={() => save()} loading={act.busy === "save"} disabled={problems.length > 0 || (!dirty && (rules.saved || !!programmeId))}>
                {rules.saved || dirty || programmeId ? "Save rules" : "Confirm these rules"}
              </Button>
            </>
          )
        }
      />
      {!rules.saved && !programmeId ? (
        <Banner tone="info" title="These are the built-in default rules">
          A 5-point scale with 30% coursework and 70% exam. Check them against the university’s regulations, change anything that differs, then save. Step 7 of the checklist ticks when you do.
        </Banner>
      ) : null}
      {notice ? <Banner tone="success" title={notice} /> : null}
      {act.error && act.busy === null && !Object.keys(serverFields).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      {Object.keys(serverFields).length ? (
        <Banner tone="danger" title="Not saved">
          <ul className="list-disc pl-5">
            {Object.values(serverFields).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
        <SelectField
          className="sm:max-w-sm"
          label="Rules for"
          value={programmeId}
          onChange={(e) => router.push(`/staff/academic-setup/grading${e.target.value ? `?programmeId=${e.target.value}` : ""}`)}
        >
          <option value="">Default · all ODeL programmes</option>
          {programmes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <p className="pb-3 text-body text-ink-2">
          {rules.programmesWithOwnRules} of {programmes.length} programme{programmes.length === 1 ? " has" : "s have"} {rules.programmesWithOwnRules === 1 ? "its" : "their"} own rules. Pick a programme to see or change its rules.
        </p>
      </div>
      {programmeId ? (
        rules.inheritedFromDefault ? (
          <Banner tone="info" title={`${progName ?? "This programme"} follows the default rules`}>
            Change anything below and save to give it its own rules (for example a 40/60 split agreed by Senate).
          </Banner>
        ) : (
          <Banner tone="warning" title={`${progName ?? "This programme"} has its own rules`} action={<button type="button" className="min-h-12 underline md:min-h-0" onClick={() => setResetOpen(true)}>Use the default again</button>}>
            Students on this programme are graded with these rules, not the default.
          </Banner>
        )
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr] lg:gap-6">
        <section aria-labelledby="weighting" className="flex h-fit flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
          <h2 id="weighting" className="text-h4 text-ink">
            Score weighting
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Coursework (CA)" inputMode="numeric" value={ca} onChange={(e) => setCa(e.target.value)} trailing={<span className="text-ink-2">%</span>} error={bad.has("ca") ? "Must add up to 100" : undefined} />
            <TextField label="Exam" inputMode="numeric" value={ex} onChange={(e) => setEx(e.target.value)} trailing={<span className="text-ink-2">%</span>} error={bad.has("ex") ? `Now ${Number.isNaN(num(ca) + num(ex)) ? "?" : num(ca) + num(ex)}` : undefined} />
          </div>
          <TextField label="Pass mark" inputMode="numeric" value={pass} onChange={(e) => setPass(e.target.value)} hint="Total out of 100" error={bad.has("pass") ? problems.find((p) => p.includes("pass mark")) : undefined} />
          <SelectField label="Grade point scale" value={scale} onChange={(e) => setScale(e.target.value)}>
            <option value="5">5-point</option>
            <option value="4">4-point</option>
          </SelectField>
          <label className="flex min-h-12 cursor-pointer items-center gap-3">
            <input type="checkbox" role="switch" checked={round} onChange={(e) => setRound(e.target.checked)} className="peer sr-only" />
            <span aria-hidden="true" className="relative h-6 w-11 shrink-0 rounded-full bg-muted transition-colors peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-focus after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            <span className="text-body-lg text-ink">Round totals to whole numbers</span>
          </label>
        </section>

        <section aria-labelledby="bands" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <h2 id="bands" className="flex-1 text-h4 text-ink">
              Grade bands
            </h2>
            {editBands ? (
              <Button variant="ghost" size="sm" leadingIcon="add" onClick={() => setBands((b) => [...b, { grade: "", from: "", to: "", point: "0", remark: "" }])}>
                Add a band
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setEditBands(true)}>
                Edit bands
              </Button>
            )}
          </div>
          {editBands ? (
            <div className="flex flex-col gap-3">
              <div className="hidden grid-cols-[64px_1fr_1fr_1fr_2fr_48px] gap-2 text-label-sm text-ink-2 md:grid" aria-hidden="true">
                <span>Grade</span>
                <span>From</span>
                <span>To</span>
                <span>Grade point</span>
                <span>Remark</span>
                <span />
              </div>
              {bands.map((b, i) => (
                <fieldset key={i} className="grid grid-cols-3 gap-2 rounded-md border border-line p-3 md:grid-cols-[64px_1fr_1fr_1fr_2fr_48px] md:border-0 md:p-0">
                  <legend className="sr-only">Band {b.grade || i + 1}</legend>
                  {(["grade", "from", "to", "point", "remark"] as const).map((k) => (
                    <label key={k} className={cn("flex flex-col gap-1", k === "remark" && "col-span-3 md:col-span-1")}>
                      <span className="text-label-sm text-ink-2 md:sr-only">{k === "point" ? "Grade point" : k[0].toUpperCase() + k.slice(1)}</span>
                      <input
                        value={b[k]}
                        onChange={setBand(i, k)}
                        inputMode={k === "grade" || k === "remark" ? "text" : "numeric"}
                        aria-invalid={bad.has(`${i}.${k}`) || undefined}
                        className={cn("h-12 w-full rounded-md bg-surface px-3 text-body-lg text-ink outline-none focus:outline-2 focus:outline-focus", bad.has(`${i}.${k}`) ? "border-2 border-danger-line" : "border border-line-strong")}
                      />
                    </label>
                  ))}
                  <button type="button" onClick={() => setBands((bs) => bs.filter((_, j) => j !== i))} aria-label={`Remove band ${b.grade || i + 1}`} className="flex size-12 items-center justify-center self-end rounded-md text-icon-2 hover:bg-subtle">
                    <Icon name="delete" />
                  </button>
                </fieldset>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[420px] text-left">
                <caption className="sr-only">Grade bands</caption>
                <thead className="bg-subtle text-label-sm text-ink-2">
                  <tr>
                    <th scope="col" className="h-10 px-3 font-semibold">Grade</th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">From</th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">To</th>
                    <th scope="col" className="h-10 px-3 text-right font-semibold">Grade point</th>
                    <th scope="col" className="h-10 px-3 font-semibold">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.grade} className="border-t border-line text-body text-ink">
                      <th scope="row" className="h-12 px-3 font-semibold">{b.grade}</th>
                      <td className="px-3 text-right font-mono">{b.from}</td>
                      <td className="px-3 text-right font-mono">{b.to}</td>
                      <td className="px-3 text-right font-mono">{b.point}</td>
                      <td className="px-3">{b.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p role="status" className={cn("flex items-start gap-2 rounded-md px-3 py-2.5 text-label", problems.length ? "bg-danger-subtle text-danger" : "bg-subtle text-ink")}>
            <Icon name="calculate" className="mt-0.5" />
            {problems.length ? `Fix ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.join(" · ")}` : `Check: ${example(num(ca), num(ex), bands)}`}
          </p>
        </section>
      </div>

      {standingOpen ? (
        <StandingDialog
          standing={standing}
          scale={num(scale) || 5}
          busy={act.busy === "save"}
          error={act.error?.message}
          fields={serverFields}
          onClose={() => setStandingOpen(false)}
          onSave={async (s) => {
            setStanding(s);
            if (await save(s)) setStandingOpen(false);
          }}
        />
      ) : null}

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        icon="undo"
        iconClassName="text-brand"
        title="Use the default rules again?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={useDefault} loading={act.busy === "reset"}>
              Use the default
            </Button>
          </>
        }
      >
        {progName ?? "This programme"} will be graded with the default rules from now on. Its own rules stay in the history.
      </Dialog>
    </>
  );
}

function StandingDialog({ standing, scale, busy, error, fields, onClose, onSave }: { standing: Standing; scale: number; busy: boolean; error?: string; fields: Record<string, string>; onClose: () => void; onSave: (s: Standing) => void }) {
  const [prob, setProb] = useState(standing.probationBelow.toFixed(2));
  const [withdraw, setWithdraw] = useState(String(standing.withdrawAfterProbationSemesters));
  const [classes, setClasses] = useState(standing.classes.map((c) => ({ name: c.name, from: c.from.toFixed(2) })));
  const [carry, setCarry] = useState(standing.carryOverBeforeGraduating);
  const order = classes.findIndex((c, i) => i > 0 && !(Number(c.from) < Number(classes[i - 1].from)));
  const probBad = !(Number(prob) >= 0 && Number(prob) <= scale);
  return (
    <Panel
      open
      onClose={onClose}
      title="Standing and degree class"
      onSubmit={() =>
        onSave({
          probationBelow: Number(prob),
          withdrawAfterProbationSemesters: Number(withdraw),
          carryOverBeforeGraduating: carry,
          classes: classes.map((c) => ({ name: c.name, from: Number(c.from) })),
        })
      }
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={order > 0 || probBad}>
            Save standing rules
          </Button>
        </>
      }
    >
      {error && !Object.keys(fields).length ? <Banner tone="danger" title="Not saved">{error}</Banner> : null}
      <TextField label="Probation when CGPA falls below" inputMode="decimal" value={prob} onChange={(e) => setProb(e.target.value)} hint="The student sees the probation notice and is pointed to counselling." error={probBad ? `Use a number from 0.00 to ${scale}.00.` : fields["standing.probationBelow"]} />
      <SelectField label="Asked to withdraw after" value={withdraw} onChange={(e) => setWithdraw(e.target.value)} error={fields["standing.withdrawAfterProbationSemesters"]}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <option key={n} value={n}>
            {n} semester{n === 1 ? "" : "s"} in a row on probation
          </option>
        ))}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-2">
        {classes.map((c, i) => (
          <TextField
            key={c.name}
            label={`${c.name === "Pass" ? "Pass degree" : c.name} from`}
            inputMode="decimal"
            value={c.from}
            onChange={(e) => setClasses((cs) => cs.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))}
            error={order === i ? `Must be below ${classes[i - 1].name}.` : undefined}
          />
        ))}
      </div>
      <p className="text-body-sm text-ink-2">CGPA on the {scale}-point scale. Graduation also needs the programme’s units (Academic structure).</p>
      {fields["standing.classes"] ? <p className="text-body-sm text-danger">{fields["standing.classes"]}</p> : null}
      <Checkbox label="A carry-over must be passed before graduating" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
    </Panel>
  );
}
