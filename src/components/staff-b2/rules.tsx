"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import type { RegRules } from "@/lib/types-b2";
import { useAction } from "@/lib/use-action";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Checkbox, SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";

type Level = { level: number; minUnits: string; maxUnits: string; maxElectives: string; compulsoryUnits: number };

/** A-05 Registration rules: window dates (read-only, from Academic setup), course-change deadline, fee block, unit limits per level for the default or one programme; A-05c errors. */
export function RulesForm({ rules, programmes, canEdit }: { rules: RegRules; programmes: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const act = useAction();
  const [levels, setLevels] = useState<Level[]>(rules.levels.map((l) => ({ level: l.level, minUnits: String(l.minUnits), maxUnits: String(l.maxUnits), maxElectives: String(l.maxElectives), compulsoryUnits: l.compulsoryUnits ?? 0 })));
  const [changes, setChanges] = useState(rules.window?.changesCloseOn ?? "");
  const [fee, setFee] = useState(rules.fee);
  const [saved, setSaved] = useState<string | null>(null);
  const w = rules.window;
  const progId = rules.programme?.id ?? "";

  const local = (l: Level) => {
    const min = Number(l.minUnits);
    const max = Number(l.maxUnits);
    if (l.minUnits !== "" && l.maxUnits !== "" && min > max) return `The minimum (${min}) is above the maximum (${max}).`;
    if (l.maxUnits !== "" && l.compulsoryUnits > max) return `${l.level}L compulsory courses already come to ${l.compulsoryUnits} units, over the maximum of ${max}.`;
    return null;
  };
  const hasLocal = levels.some((l) => local(l));

  async function save() {
    setSaved(null);
    const r = await act.run<RegRules>("save", "PUT", "/registration/rules", {
      semesterId: rules.semester?.id ?? null,
      changesCloseOn: changes || null,
      fee,
      programmeId: progId || null,
      levels: levels.map((l) => ({ level: l.level, minUnits: Number(l.minUnits), maxUnits: Number(l.maxUnits), maxElectives: Number(l.maxElectives) })),
    });
    if (r.ok) {
      setSaved(`Saved the rules${rules.programme ? ` for ${rules.programme.name}` : ""}. Students see the new limits at once.`);
      router.refresh();
    }
  }
  async function reset() {
    const r = await act.run("reset", "DELETE", `/registration/rules/programmes/${progId}`);
    if (r.ok) router.refresh();
  }

  const set = (i: number, k: "minUnits" | "maxUnits" | "maxElectives") => (e: React.ChangeEvent<HTMLInputElement>) => setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: e.target.value.replace(/\D/g, "").slice(0, 2) } : l)));
  const fe = act.fields;

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {saved ? <Banner tone="success" title={saved} /> : null}
      {act.error && !Object.keys(fe).length ? <Banner tone="danger" title="Not saved">{act.error.message}</Banner> : null}
      {Object.keys(fe).length ? <Banner tone="danger" title="Some rules do not add up">Fix the fields in red, then save. Nothing was saved.</Banner> : null}

      <section aria-labelledby="window" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <h2 id="window" className="text-h4 text-ink">
          Registration window · {rules.semester?.label ?? "no semester yet"}
        </h2>
        {w ? (
          <dl className="grid gap-x-6 gap-y-1 text-body sm:grid-cols-[220px_1fr]">
            <dt className="text-ink-2">Opens</dt>
            <dd className="text-ink">{formatDate(w.opensOn)}</dd>
            <dt className="text-ink-2">Closes</dt>
            <dd className="text-ink">{formatDate(w.closesOn)}</dd>
            <dt className="text-ink-2">Late registration until</dt>
            <dd className="text-ink">{w.lateClosesOn ? formatDate(w.lateClosesOn) : "No late registration"}</dd>
          </dl>
        ) : (
          <p className="text-body text-ink-2">No window yet.</p>
        )}
        <p className="flex items-start gap-2 text-body-sm text-ink-2">
          <Icon name="info" size={20} className="text-icon-2" />
          <span>
            These dates come from Academic setup · Sessions. Change them there.{" "}
            <Link href="/staff/academic-setup/sessions" className="font-semibold text-brand hover:underline">
              Open sessions
            </Link>
          </span>
        </p>
        <TextField
          label="Course changes close on"
          type="date"
          value={changes}
          onChange={(e) => setChanges(e.target.value)}
          disabled={!canEdit}
          error={fe.changesCloseOn}
          hint={w?.changesCloseOnDefault ? "Default: the day after late registration closes. Pick another date to change it." : "Students can ask for course changes until this day."}
          className="sm:max-w-xs"
        />
      </section>

      <section aria-labelledby="fee" className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <h2 id="fee" className="text-h4 text-ink">
          Platform fee
        </h2>
        <Checkbox label="Students must pay before they register" checked={fee.blockRegistration} disabled={!canEdit} onChange={(e) => setFee((x) => ({ ...x, blockRegistration: e.target.checked }))} />
        <Checkbox label="Students must pay before they sit exams" checked={fee.blockExams} disabled={!canEdit} onChange={(e) => setFee((x) => ({ ...x, blockExams: e.target.checked }))} />
        <Checkbox label="Unpaid students can see course previews" checked={fee.previewsWhenUnpaid} disabled={!canEdit} onChange={(e) => setFee((x) => ({ ...x, previewsWhenUnpaid: e.target.checked }))} />
        <p className="text-body-sm text-ink-2">Results are never held for the fee.</p>
      </section>

      <section aria-labelledby="limits" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <h2 id="limits" className="min-w-0 flex-1 text-h4 text-ink">
            Unit limits per level
          </h2>
          <SelectField
            label="Limits for"
            value={progId}
            className="md:max-w-sm"
            onChange={(e) => router.push(`/staff/registration/rules${e.target.value ? `?programmeId=${e.target.value}` : ""}`)}
          >
            <option value="">Every programme (default)</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {rules.programmesWithOwnLimits.some((x) => x.id === p.id) ? " · own limits" : ""}
              </option>
            ))}
          </SelectField>
        </div>
        {rules.programme && rules.inheritedFromDefault ? <Banner tone="info" title={`${rules.programme.name} follows the default limits`}>Change a number and save to give it its own.</Banner> : null}
        <div className="flex flex-col gap-3">
          <div className="hidden grid-cols-[80px_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] gap-3 text-label-sm text-ink-2 md:grid">
            <span>Level</span>
            <span>Minimum units</span>
            <span>Maximum units</span>
            <span>Electives up to</span>
            <span>Compulsory courses</span>
          </div>
          {levels.map((l, i) => {
            const problem = local(l);
            return (
              <div key={l.level} className="grid grid-cols-3 gap-3 rounded-md border border-line p-3 md:grid-cols-[80px_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] md:items-start md:border-0 md:p-0">
                <span className="col-span-3 text-label-lg text-ink md:col-span-1 md:pt-3">{l.level}L</span>
                <TextField label={<span className="md:sr-only">Minimum</span>} inputMode="numeric" value={l.minUnits} onChange={set(i, "minUnits")} disabled={!canEdit} error={fe[`levels[${i}].minUnits`] ?? (problem?.startsWith("The minimum") ? " " : undefined)} aria-label={`${l.level}L minimum units`} />
                <TextField label={<span className="md:sr-only">Maximum</span>} inputMode="numeric" value={l.maxUnits} onChange={set(i, "maxUnits")} disabled={!canEdit} error={fe[`levels[${i}].maxUnits`] ?? (problem ? " " : undefined)} aria-label={`${l.level}L maximum units`} />
                <TextField label={<span className="md:sr-only">Electives</span>} inputMode="numeric" value={l.maxElectives} onChange={set(i, "maxElectives")} disabled={!canEdit} error={fe[`levels[${i}].maxElectives`]} aria-label={`${l.level}L electives up to`} />
                <p className={`col-span-3 text-body md:col-span-1 md:pt-3 ${problem ? "text-danger" : "text-ink-2"}`}>{problem ?? (l.compulsoryUnits ? `${l.compulsoryUnits} units · fits` : "None at this level")}</p>
              </div>
            );
          })}
        </div>
        <p className="text-body-sm text-ink-2">{rules.note}</p>
      </section>

      {canEdit ? (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {rules.programme && !rules.inheritedFromDefault ? (
            <Button type="button" variant="ghost" loading={act.busy === "reset"} onClick={reset}>
              Use the default limits again
            </Button>
          ) : null}
          <Button type="submit" loading={act.busy === "save"} disabled={hasLocal}>
            Save rules
          </Button>
        </div>
      ) : (
        <p className="text-body-sm text-ink-2">Only the ODeL admin can change the rules.</p>
      )}
    </form>
  );
}
