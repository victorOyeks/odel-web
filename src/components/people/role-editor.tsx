"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { SCOPE_LABEL, STAFF_ROLES, scopesFor } from "@/lib/staff-roles";
import type { Centre, Course, RoleInput, StaffRoleCode, StaffScopeType, Structure } from "@/lib/types-b1";
import { cn } from "@/lib/cn";
import { SelectField } from "@/components/ui/fields";
import { Icon } from "@/components/ui/icon";

export interface ScopeOptions {
  FACULTY: { id: string; label: string }[];
  DEPARTMENT: { id: string; label: string }[];
  COURSE: { id: string; label: string }[];
  CENTRE: { id: string; label: string }[];
}

/** Faculties, departments, courses and centres for the scope pickers; loaded when a role form opens. */
export function useScopeOptions() {
  const [opts, setOpts] = useState<ScopeOptions | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      api<Structure>("GET", "/academic/structure"),
      api<{ items: Course[] }>("GET", "/academic/courses?size=200"),
      api<{ items: Centre[] }>("GET", "/academic/centres"),
    ]).then(([s, c, ce]) => {
      if (!alive) return;
      const fac = s.ok ? s.data.faculties : [];
      setOpts({
        FACULTY: fac.map((f) => ({ id: f.id, label: f.name })),
        DEPARTMENT: fac.flatMap((f) => f.departments.map((d) => ({ id: d.id, label: `${d.name} · ${f.name}` }))),
        COURSE: c.ok ? c.data.items.map((x) => ({ id: x.id, label: `${x.code} · ${x.title}` })) : [],
        CENTRE: ce.ok ? ce.data.items.map((x) => ({ id: x.id, label: x.name })) : [],
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return opts;
}

/**
 * W-15b roles: toggle chips for each role; every chosen role then asks where it applies (scope). One row per role;
 * the API allows the same role twice with different scopes, which People & roles edits one at a time.
 */
export function RoleEditor({ value, onChange, fields, opts }: { value: RoleInput[]; onChange: (v: RoleInput[]) => void; fields: Record<string, string>; opts: ScopeOptions | null }) {
  const has = (r: StaffRoleCode) => value.some((x) => x.role === r);
  function toggle(r: StaffRoleCode) {
    if (has(r)) onChange(value.filter((x) => x.role !== r));
    else {
      const scopeType = scopesFor(r)[0];
      onChange([...value, { role: r, scopeType, scopeId: null }]);
    }
  }
  const update = (i: number, patch: Partial<RoleInput>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label text-ink">Roles</legend>
        <div className="flex flex-wrap gap-2">
          {STAFF_ROLES.map((r) => {
            const on = has(r.role);
            return (
              <button
                key={r.role}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(r.role)}
                className={cn("inline-flex min-h-12 items-center gap-1.5 rounded-full border px-3.5 text-label md:min-h-9", on ? "border-brand bg-brand-subtle text-brand" : "border-line-strong bg-surface text-ink hover:bg-subtle")}
              >
                {on ? <Icon name="check" size={16} /> : null}
                {r.label}
              </button>
            );
          })}
        </div>
        {fields.roles ? <p className="text-body-sm text-danger">{fields.roles}</p> : null}
      </fieldset>
      {value.map((r, i) => {
        const def = STAFF_ROLES.find((x) => x.role === r.role)!;
        const scopes = def.scopes;
        const list = r.scopeType === "UNIVERSITY" ? [] : opts?.[r.scopeType as keyof ScopeOptions] ?? [];
        return (
          <div key={`${r.role}-${i}`} className="flex flex-col gap-2 rounded-md border border-line p-3">
            <p className="text-label text-ink">{def.label}: where it applies</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopes.length > 1 ? (
                <SelectField label="Scope" value={r.scopeType} onChange={(e) => update(i, { scopeType: e.target.value as StaffScopeType, scopeId: null })} error={fields[`roles[${i}].scopeType`]}>
                  {scopes.map((s) => (
                    <option key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </option>
                  ))}
                </SelectField>
              ) : null}
              {r.scopeType !== "UNIVERSITY" ? (
                <SelectField
                  label={SCOPE_LABEL[r.scopeType].replace(/^A /, "").replace(/^./, (c) => c.toUpperCase())}
                  value={r.scopeId ?? ""}
                  onChange={(e) => update(i, { scopeId: e.target.value || null })}
                  error={fields[`roles[${i}].scopeId`]}
                  disabled={!opts}
                  hint={!opts ? "Loading…" : !list.length ? `None yet. Add ${r.scopeType === "COURSE" ? "courses in the catalogue" : r.scopeType === "CENTRE" ? "centres" : "them on Academic structure"} first.` : undefined}
                >
                  <option value="">Choose</option>
                  {list.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <p className="text-body text-ink-2 sm:col-span-2">Applies to the whole university.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function rolesValid(v: RoleInput[]) {
  return v.length > 0 && v.every((r) => r.scopeType === "UNIVERSITY" || r.scopeId);
}
