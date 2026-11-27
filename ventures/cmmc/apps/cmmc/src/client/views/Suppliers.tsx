// Subcontractors and suppliers: the CMMC level flowed down to each, the status checked before award,
// and whether it is still current under DFARS 252.204-7021's definition. Checks run on the server
// (@shared/suppliers); this view shows them and edits the rows.
import {
  type Currency,
  type InfoFlowed,
  SUPPLIER_LEVEL_LABEL,
  type SupplierCheck,
  type SupplierIssue,
  type SupplierLevel,
  type SupplierStatus,
  suggestFlowdownLevel,
} from "@shared/suppliers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { OrgInfo } from "../lib/types";
import { btnCls, btnGhostCls, Card, ErrorText, Field, inputCls } from "../ui";

export interface SupplierItem {
  id: string;
  name: string;
  supplies: string;
  infoFlowed: InfoFlowed;
  cots: boolean;
  requiredLevel: SupplierLevel | null;
  status: SupplierStatus | null;
  statusDate: string | null;
  affirmedOn: string | null;
  cmmcUids: string;
  clauseFlowedDown: boolean;
  subcontractRef: string;
  checkedOn: string | null;
  awardedOn: string | null;
  evidenceRef: string;
  notes: string;
  currency: Currency;
  issues: SupplierIssue[];
}

export interface SuppliersResponse {
  today: string;
  items: SupplierItem[];
  check: SupplierCheck;
  infoOptions: { key: InfoFlowed; label: string }[];
  levels: { key: SupplierLevel; label: string }[];
  statuses: { key: SupplierStatus; label: string }[];
  quotes: { flowdown: string; beforeAward: string; insert: string; insertWhen: string };
  verification: { source: string; url: string; readOn: string; note: string };
}

const EMPTY = {
  name: "",
  supplies: "",
  infoFlowed: "cui" as InfoFlowed,
  cots: false,
  requiredLevel: null as SupplierLevel | null,
  status: null as SupplierStatus | null,
  statusDate: null as string | null,
  affirmedOn: null as string | null,
  cmmcUids: "",
  clauseFlowedDown: false,
  subcontractRef: "",
  checkedOn: null as string | null,
  awardedOn: null as string | null,
  evidenceRef: "",
  notes: "",
};

const CURRENCY_TONE: Record<Currency["state"], string> = {
  current: "bg-green-50 text-green-800",
  due_soon: "bg-amber-50 text-amber-900",
  not_current: "bg-red-50 text-red-800",
  unknown: "bg-stone-100 text-stone-700",
};

function currencyText(c: Currency) {
  if (c.state === "unknown") return "Not known";
  if (c.state === "not_current") return `Not current (ended ${c.through})`;
  return `Current through ${c.through}`;
}

const blankToNull = (v: string) => (v === "" ? null : v);

export function SuppliersView({
  orgId,
  info,
  onUpgrade,
}: {
  orgId: string;
  info: OrgInfo;
  onUpgrade: () => void;
}) {
  const qc = useQueryClient();
  const canEdit = info.role !== "viewer";
  const isAdmin = info.role === "owner" || info.role === "admin";
  const list = useQuery({
    queryKey: ["suppliers", orgId],
    queryFn: () => api<SuppliersResponse>(`/api/orgs/${orgId}/suppliers`),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["suppliers", orgId] });
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  // The level in the associated prime contract: only an input to the 32 CFR 170.23 suggestion, not saved.
  const [primeLevel, setPrimeLevel] = useState<SupplierLevel | null>(null);
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
  };
  const save = useMutation({
    mutationFn: () =>
      editing
        ? api(`/api/orgs/${orgId}/suppliers/${editing}`, { method: "PATCH", json: form })
        : api(`/api/orgs/${orgId}/suppliers`, { method: "POST", json: form }),
    onSuccess: () => {
      reset();
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/orgs/${orgId}/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const data = list.data;
  const startEdit = (s: SupplierItem) => {
    setEditing(s.id);
    const { id: _id, currency: _c, issues: _i, ...rest } = s;
    setForm({ ...EMPTY, ...rest });
  };
  // Mirrors the server's gate (services/suppliers): CUI or a Level 2/3 requirement needs Level 2.
  const needsLevel2 =
    form.infoFlowed === "cui" || (form.requiredLevel !== null && form.requiredLevel !== "l1_self");
  const blocked = needsLevel2 && !info.plan.level2;
  const date = (key: "statusDate" | "affirmedOn" | "checkedOn" | "awardedOn") => (
    <input
      type="date"
      className={inputCls}
      max={data?.today}
      value={form[key] ?? ""}
      onChange={(e) => setForm({ ...form, [key]: blankToNull(e.target.value) })}
    />
  );
  const gaps = data?.check.issues.filter((i) => i.kind === "gap") ?? [];
  const soon = data?.check.issues.filter((i) => i.kind === "soon") ?? [];
  const notes = data?.check.issues.filter((i) => i.kind === "note") ?? [];
  return (
    <div className="space-y-4">
      <Card
        title="Subcontractors and suppliers"
        actions={
          data && data.items.length > 0 ? (
            <a className={btnGhostCls} href={`/api/orgs/${orgId}/suppliers/export.csv`}>
              Download CSV
            </a>
          ) : null
        }
      >
        <ErrorText error={list.error} />
        <p className="mb-3 text-sm text-stone-700">
          The shops you send drawings, specs or contract information to: platers, heat treaters,
          machinists you sub work to. For each one, the CMMC level you flow down, the status you
          checked before award, and whether it is still current. Primes ask for this list; keep it
          ready.
        </p>
        {data && (
          <div className="mb-3 space-y-1 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
            <p>
              <q>{data.quotes.flowdown}</q> (252.204-7021(d)(1)(ii))
            </p>
            <p>
              <q>{data.quotes.beforeAward}</q> (252.204-7021(f)(2))
            </p>
            <p>
              {data.verification.note}{" "}
              <a
                className="underline"
                href={data.verification.url}
                target="_blank"
                rel="noreferrer"
              >
                Read DFARS 252.204-7021
              </a>
            </p>
          </div>
        )}
        {data && data.check.flowdown > 0 && (
          <p className="mb-2 text-sm font-medium text-stone-800">
            {data.check.ready} of {data.check.flowdown} suppliers that get FCI or CUI have no open
            gaps.
          </p>
        )}
        {gaps.length > 0 && (
          <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {gaps.map((i) => (
              <li key={`${i.supplierId}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {soon.length > 0 && (
          <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {soon.map((i) => (
              <li key={`${i.supplierId}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {notes.length > 0 && (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {notes.map((i) => (
              <li key={`${i.supplierId}-${i.message}`}>{i.message}</li>
            ))}
          </ul>
        )}
        {data && data.items.length === 0 && (
          <p className="text-sm text-stone-600">No suppliers recorded yet.</p>
        )}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-stone-500">
                <tr>
                  <th className="py-1 pr-2">Supplier</th>
                  <th className="pr-2">Gets</th>
                  <th className="pr-2">Level flowed</th>
                  <th className="pr-2">Status</th>
                  <th className="pr-2">Current?</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.items.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="py-2 pr-2">
                      {s.name}
                      {s.supplies && <p className="text-xs text-stone-500">{s.supplies}</p>}
                    </td>
                    <td className="pr-2 text-xs">
                      {s.infoFlowed === "none" ? "Neither" : s.infoFlowed.toUpperCase()}
                      {s.cots && " (COTS)"}
                    </td>
                    <td className="pr-2 text-xs">
                      {data.levels.find((l) => l.key === s.requiredLevel)?.label ?? "—"}
                    </td>
                    <td className="pr-2 text-xs">
                      {data.statuses.find((l) => l.key === s.status)?.label ?? "—"}
                      {s.statusDate && <span className="block text-stone-500">{s.statusDate}</span>}
                    </td>
                    <td className="pr-2 text-xs">
                      {s.infoFlowed !== "none" && !s.cots && (
                        <span
                          className={`rounded px-1.5 py-0.5 ${CURRENCY_TONE[s.currency.state]}`}
                        >
                          {currencyText(s.currency)}
                        </span>
                      )}
                    </td>
                    <td className="space-x-2 whitespace-nowrap">
                      {canEdit && (
                        <button
                          type="button"
                          className="text-xs underline"
                          onClick={() => startEdit(s)}
                        >
                          Edit
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          className="text-xs text-red-700 underline"
                          onClick={() => remove.mutate(s.id)}
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
      </Card>
      {canEdit && data && (
        <Card title={editing ? "Edit supplier" : "Add a supplier"}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Supplier">
              <input
                className={inputCls}
                value={form.name}
                placeholder="Acme Anodizing"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="What they supply">
              <input
                className={inputCls}
                value={form.supplies}
                placeholder="Type II anodize, heat treat, 5-axis machining…"
                onChange={(e) => setForm({ ...form, supplies: e.target.value })}
              />
            </Field>
            <Field
              label="What the order sends them"
              hint="Drawings or specs marked CUI count as CUI. Neither means nothing from the contract goes with the order."
            >
              <select
                className={inputCls}
                value={form.infoFlowed}
                onChange={(e) => setForm({ ...form, infoFlowed: e.target.value as InfoFlowed })}
              >
                {data.infoOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="CMMC level you flow down"
              hint="32 CFR 170.23 sets the minimum from what you send and your prime contract's level (suggested below). You choose; the app checks the status against it."
            >
              <select
                className={inputCls}
                value={form.requiredLevel ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    requiredLevel: blankToNull(e.target.value) as SupplierLevel | null,
                  })
                }
              >
                <option value="">Not chosen yet</option>
                {data.levels.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Level in the prime contract"
              hint="The CMMC status your prime contract requires (yours, or your customer's if you are a subcontractor). Only used for the suggestion below; not saved."
            >
              <select
                className={inputCls}
                value={primeLevel ?? ""}
                onChange={(e) => setPrimeLevel(blankToNull(e.target.value) as SupplierLevel | null)}
              >
                <option value="">Not known</option>
                {data.levels.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {(() => {
              const g = suggestFlowdownLevel(form, primeLevel);
              return (
                <div
                  className="rounded border border-stone-200 bg-stone-50 p-3 text-sm sm:col-span-2"
                  data-testid="level-suggestion"
                >
                  <p>
                    <span className="font-medium">
                      {g.level
                        ? `Suggested: at least ${SUPPLIER_LEVEL_LABEL[g.level]}`
                        : "No level to flow down"}
                    </span>{" "}
                    ({g.cite}). {g.reason}
                  </p>
                  {g.quote && (
                    <blockquote className="mt-1 border-l-2 border-stone-300 pl-2 text-xs text-stone-600">
                      “{g.quote}”
                    </blockquote>
                  )}
                  {g.level && form.requiredLevel !== g.level && (
                    <button
                      type="button"
                      className={`${btnGhostCls} mt-2`}
                      onClick={() => setForm({ ...form, requiredLevel: g.level })}
                    >
                      Use {SUPPLIER_LEVEL_LABEL[g.level]}
                    </button>
                  )}
                  <p className="mt-1 text-xs text-stone-500">
                    A suggestion from the rule's words, not legal advice. Your prime contract and
                    DoD's own guidance can ask for more (170.23(b)).
                  </p>
                </div>
              );
            })()}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.cots}
                onChange={(e) => setForm({ ...form, cots: e.target.checked })}
              />
              Commercially available off-the-shelf items only (the clause leaves these out,
              252.204-7021(f)(1))
            </label>
            <Field label="Their CMMC status">
              <select
                className={inputCls}
                value={form.status ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: blankToNull(e.target.value) as SupplierStatus | null,
                  })
                }
              >
                <option value="">Not known yet</option>
                {data.statuses.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="CMMC Status Date">{date("statusDate")}</Field>
            <Field
              label="Their latest affirmation"
              hint="Current for one year (252.204-7021(a), 'Current')."
            >
              {date("affirmedOn")}
            </Field>
            <Field label="CMMC UIDs" hint="10 letters and digits each, from SPRS; commas between.">
              <input
                className={inputCls}
                value={form.cmmcUids}
                onChange={(e) => setForm({ ...form, cmmcUids: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={form.clauseFlowedDown}
                onChange={(e) => setForm({ ...form, clauseFlowedDown: e.target.checked })}
              />
              The subcontract or PO terms carry the substance of DFARS 252.204-7021
            </label>
            <Field label="Subcontract or PO">
              <input
                className={inputCls}
                value={form.subcontractRef}
                placeholder="PO 1042, terms rev C"
                onChange={(e) => setForm({ ...form, subcontractRef: e.target.value })}
              />
            </Field>
            <Field label="Date you checked their status">{date("checkedOn")}</Field>
            <Field label="Award date">{date("awardedOn")}</Field>
            <Field
              label="Where the proof is kept"
              hint="SPRS screenshot, their letter, an evidence title."
            >
              <input
                className={inputCls}
                value={form.evidenceRef}
                onChange={(e) => setForm({ ...form, evidenceRef: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button type="submit" className={btnCls} disabled={save.isPending || blocked}>
                {editing ? "Save changes" : "Add supplier"}
              </button>
              {editing && (
                <button type="button" className={btnGhostCls} onClick={reset}>
                  Cancel
                </button>
              )}
              {blocked && (
                <span className="text-xs text-stone-700">
                  Suppliers that get CUI or a Level 2 requirement need the Level 2 plan.{" "}
                  {isAdmin ? (
                    <button type="button" className="underline" onClick={onUpgrade}>
                      See Level 2 plans
                    </button>
                  ) : (
                    "Ask an admin of this organization to upgrade."
                  )}
                </span>
              )}
            </div>
            <ErrorText error={save.error} />
          </form>
        </Card>
      )}
    </div>
  );
}
