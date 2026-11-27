import {
  type DepartureKind,
  type PersonnelCheck,
  type Training,
  type TrainingState,
  trainingStatus,
} from "@shared/personnel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";
import { PeopleImport } from "./PeopleImport";

export interface PersonItem {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  cuiAccess: boolean;
  securityDuties: boolean;
  dutiesDescription: string;
  screenedOn: string | null;
  screeningMethod: string;
  accessGrantedOn: string | null;
  awarenessOn: string | null;
  roleBasedOn: string | null;
  insiderThreatOn: string | null;
  leftOn: string | null;
  departureKind: DepartureKind | null;
  accessRemovedOn: string | null;
  notes: string;
}

interface PeopleResponse {
  items: PersonItem[];
  refreshMonths: number;
  today: string;
  check: PersonnelCheck;
  trainings: { key: Training; label: string; controlId: string; who: string }[];
  departureKinds: { key: DepartureKind; label: string }[];
  refreshChoices: number[];
  refreshNote: string;
}

type Form = {
  [K in keyof Omit<PersonItem, "id">]: PersonItem[K] extends string | null ? string : boolean;
};

const EMPTY: Form = {
  name: "",
  jobTitle: "",
  email: "",
  cuiAccess: true,
  securityDuties: false,
  dutiesDescription: "",
  screenedOn: "",
  screeningMethod: "",
  accessGrantedOn: "",
  awarenessOn: "",
  roleBasedOn: "",
  insiderThreatOn: "",
  leftOn: "",
  departureKind: "",
  accessRemovedOn: "",
  notes: "",
};

const DATE_KEYS = [
  "screenedOn",
  "accessGrantedOn",
  "awarenessOn",
  "roleBasedOn",
  "insiderThreatOn",
  "leftOn",
  "accessRemovedOn",
] as const;

const STATE_STYLE: Record<TrainingState, string> = {
  not_required: "text-stone-400",
  missing: "text-red-700",
  overdue: "text-red-700",
  due_soon: "text-amber-700",
  current: "text-emerald-700",
};

/** The form's strings as the API wants them: blank dates and departure become null. */
export function personBody(f: Form) {
  const out: Record<string, unknown> = { ...f };
  for (const k of DATE_KEYS) out[k] = f[k] || null;
  out.departureKind = f.departureKind || null;
  return out;
}

const toForm = (p: PersonItem): Form => ({
  ...p,
  screenedOn: p.screenedOn ?? "",
  accessGrantedOn: p.accessGrantedOn ?? "",
  awarenessOn: p.awarenessOn ?? "",
  roleBasedOn: p.roleBasedOn ?? "",
  insiderThreatOn: p.insiderThreatOn ?? "",
  leftOn: p.leftOn ?? "",
  departureKind: p.departureKind ?? "",
  accessRemovedOn: p.accessRemovedOn ?? "",
});

export function PeopleView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const canRecord = info.role !== "viewer" && info.plan.level2;
  const isAdmin = info.role === "owner" || info.role === "admin";
  const key = ["people", orgId];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<PeopleResponse>(`/api/orgs/${orgId}/people`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [importing, setImporting] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/people/${editing}`, { method: "PATCH", json: personBody(form) })
        : api(`/api/orgs/${orgId}/people`, { method: "POST", json: personBody(form) }),
    onSuccess: () => {
      setForm(EMPTY);
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/people/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const interval = useMutation({
    mutationFn: (refreshMonths: number) =>
      api(`/api/orgs/${orgId}/people/settings`, { method: "PUT", json: { refreshMonths } }),
    onSuccess: refresh,
  });
  const data = list.data;
  const active = data?.items.filter((p) => p.leftOn === null) ?? [];
  const departed = data?.items.filter((p) => p.leftOn !== null) ?? [];
  const cell = (p: PersonItem, t: Training) => {
    if (!data) return null;
    const s = trainingStatus(p, t, data.today, data.refreshMonths);
    if (s.state === "not_required") return <span className={STATE_STYLE[s.state]}>n/a</span>;
    return (
      <span className={STATE_STYLE[s.state]}>
        {s.lastOn ?? "none"}
        {s.dueOn && <span className="block text-xs">next {s.dueOn}</span>}
      </span>
    );
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const dateField = (k: (typeof DATE_KEYS)[number], label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        type="date"
        className={inputCls}
        value={form[k]}
        max={data?.today}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  );

  return (
    <div className="space-y-4">
      {!info.plan.level2 && (
        <div
          role="note"
          className="flex flex-wrap items-center justify-between gap-3 rounded border border-brand-100 bg-brand-50 p-3 text-sm text-stone-800"
        >
          <p>
            <strong>Personnel records are read only on the {info.plan.name} plan.</strong> They back
            the Level 2 Awareness and Training and Personnel Security requirements; recording them
            needs the Level 2 plan.
          </p>
          {isAdmin ? (
            <button type="button" className={btnCls} onClick={onUpgrade}>
              See Level 2 plans
            </button>
          ) : (
            <span className="text-xs text-stone-600">
              Ask an admin of this organization to upgrade.
            </span>
          )}
        </div>
      )}
      {importing && data && (
        <PeopleImport orgId={orgId} today={data.today} onClose={() => setImporting(false)} />
      )}
      <Card
        title="People and training"
        actions={
          <div className="flex flex-wrap gap-2">
            {canRecord && !importing && (
              <button type="button" className={btnGhostCls} onClick={() => setImporting(true)}>
                Import roster or completions
              </button>
            )}
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/people/export.csv`}>
              Export CSV
            </a>
          </div>
        }
      >
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          Everyone who uses the systems in scope, when they were screened, when they last took each
          training and, when they leave or transfer, when their access was removed. This is the
          record an assessor asks for under 3.2 and 3.9. Record names, roles and dates only, never
          background check results.
        </p>
        {data && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
            <span>Training is repeated every</span>
            <select
              aria-label="Refresher interval"
              className="rounded border border-stone-300 px-1 py-0.5"
              value={data.refreshMonths}
              disabled={!isAdmin || !info.plan.level2 || interval.isPending}
              onChange={(e) => interval.mutate(Number(e.target.value))}
            >
              {data.refreshChoices.map((m) => (
                <option key={m} value={m}>
                  {m} months
                </option>
              ))}
            </select>
            <span>{data.refreshNote}</span>
            <ErrorText error={interval.error} />
          </div>
        )}
        {data && (
          <ul className="mb-3 space-y-1 text-sm">
            {data.check.requirements.map((r) => (
              <li key={r.controlId}>
                <strong>{r.controlId}</strong>{" "}
                <span className="text-stone-600">
                  {r.applies > 0 && r.covered === r.applies ? "✓ " : ""}
                  {r.reading}
                </span>
                <p className="text-xs text-stone-500">
                  <q>{r.text}</q>
                </p>
              </li>
            ))}
          </ul>
        )}
        {data && (
          <p className="mb-3 text-xs text-stone-500">
            These counts read your records; they are not an assessment result. Set each
            requirement's status yourself on the Controls page.
          </p>
        )}
        {data && data.check.issues.length > 0 && (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {data.check.issues.map((i) => (
              <li key={`${i.personId ?? "all"}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {active.length > 0 && data && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Person</th>
                  <th className="pr-2">Screened</th>
                  {data.trainings.map((t) => (
                    <th key={t.key} className="pr-2" title={t.who}>
                      {t.label} ({t.controlId.slice(-5)})
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {active.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="py-2 pr-2">
                      {p.name}
                      <p className="text-xs text-stone-500">
                        {[p.jobTitle, p.securityDuties ? "security duties" : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </td>
                    <td className="pr-2">
                      {p.cuiAccess
                        ? (p.screenedOn ?? <span className="text-red-700">none</span>)
                        : "no CUI access"}
                    </td>
                    {data.trainings.map((t) => (
                      <td key={t.key} className="pr-2">
                        {cell(p, t.key)}
                      </td>
                    ))}
                    <td className="space-x-2 whitespace-nowrap">
                      {canRecord && (
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => {
                            setEditing(p.id);
                            setForm(toForm(p));
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {info.role !== "viewer" && (
                        <button
                          type="button"
                          className="text-xs text-red-700 underline"
                          onClick={() => remove.mutate(p.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {departed.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setShowLeft(!showLeft)}
            >
              {showLeft ? "Hide" : "Show"} people who left or transferred ({departed.length})
            </button>
            {showLeft && (
              <ul className="mt-2 space-y-1 text-sm">
                {departed.map((p) => (
                  <li key={p.id}>
                    {`${p.name}: ${p.departureKind === "transfer" ? "transferred" : "left"} ${p.leftOn}; access removed `}
                    {p.accessRemovedOn ?? <span className="text-red-700">not recorded</span>}
                    {canRecord && (
                      <button
                        type="button"
                        className="ml-2 text-xs underline"
                        onClick={() => {
                          setEditing(p.id);
                          setForm(toForm(p));
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
      {canRecord && data && (
        <Card title={editing ? "Edit person" : "Add a person"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Name">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </Field>
            <Field label="Job title">
              <input
                className={inputCls}
                value={form.jobTitle}
                placeholder="Machinist, office manager, owner…"
                onChange={(e) => set("jobTitle", e.target.value)}
              />
            </Field>
            <Field label="Email" hint="Optional.">
              <input
                type="email"
                className={inputCls}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Access">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.cuiAccess}
                  onChange={(e) => set("cuiAccess", e.target.checked)}
                />
                Has access to systems containing CUI
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.securityDuties}
                  onChange={(e) => set("securityDuties", e.target.checked)}
                />
                Carries information security duties
              </label>
            </Field>
            {form.securityDuties && (
              <Field label="Security duties" hint="What they are responsible for (3.2.2).">
                <input
                  className={inputCls}
                  value={form.dutiesDescription}
                  placeholder="Firewall rules, user accounts, backups…"
                  onChange={(e) => set("dutiesDescription", e.target.value)}
                />
              </Field>
            )}
            {dateField(
              "screenedOn",
              "Screened on",
              "Before access to systems containing CUI (3.9.1).",
            )}
            <Field label="How they were screened" hint="The method, never the result.">
              <input
                className={inputCls}
                value={form.screeningMethod}
                placeholder="Reference and background check by …"
                onChange={(e) => set("screeningMethod", e.target.value)}
              />
            </Field>
            {dateField("accessGrantedOn", "Access granted on")}
            {data.trainings.map((t) =>
              t.key === "roleBased" && !form.securityDuties ? null : (
                <div key={t.key}>
                  {dateField(
                    t.key === "awareness"
                      ? "awarenessOn"
                      : t.key === "roleBased"
                        ? "roleBasedOn"
                        : "insiderThreatOn",
                    `${t.label} (${t.controlId})`,
                    t.who,
                  )}
                </div>
              ),
            )}
            {dateField("leftOn", "Left or transferred on", "Leave blank while they are here.")}
            {form.leftOn && (
              <Field label="Departure">
                <select
                  className={inputCls}
                  value={form.departureKind}
                  onChange={(e) => set("departureKind", e.target.value)}
                  required
                >
                  <option value="">Choose…</option>
                  {data.departureKinds.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {form.leftOn &&
              dateField("accessRemovedOn", "Access and credentials removed on", "3.9.2.")}
            <Field label="Notes">
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 space-x-2">
              <ErrorText error={save.error} />
              <button type="submit" className={btnCls} disabled={save.isPending}>
                {editing ? "Save" : "Add"}
              </button>
              {editing && (
                <button
                  type="button"
                  className={btnGhostCls}
                  onClick={() => {
                    setEditing(null);
                    setForm(EMPTY);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
