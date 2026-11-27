// The certified payroll page's California part: the same week as a DIR eCPR XML file (schema 2.0,
// src/shared/ca-ecpr.ts) for the Public Works portal. Built in the browser and downloaded; the
// workers' SSNs and ITINs are held in memory only, never in the saved draft and never sent to us.
import {
  buildEcpr,
  ECPR_FRINGE_CATEGORIES,
  ECPR_FRINGE_LABELS,
  ECPR_NOTICE,
  type EcprFringeCategory,
  type EcprId,
  type EcprJobInput,
  type EcprRowInput,
  type EcprWorkerInput,
  ecprFileName,
  guessFringeCategory,
  periodFromLevel,
} from "@shared/ca-ecpr";
import type { CertifiedPayroll } from "@shared/certified-payroll";
import { useMemo } from "react";
import { HoursCell } from "./hours-cell";
import { MoneyInput } from "./money-input";

export type EcprDraftJob = EcprJobInput & { on?: boolean };

interface WorkerView {
  uid?: string;
  lastName: string;
  firstName: string;
  rows: { classification: string; status: "J" | "RA"; apprenticeLevel?: string }[];
  ca?: EcprWorkerInput;
}

function F(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, inside the label
    <label className={`grid gap-1 text-sm ${props.className ?? ""}`}>
      <span className="text-slate-600">{props.label}</span>
      {props.children}
    </label>
  );
}

function download(xml: string, name: string) {
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const idKey = (w: { uid?: string }, wi: number) => w.uid ?? `i${wi}`;

export function CaEcprSection(props: {
  job: EcprDraftJob | undefined;
  onJob: (job: EcprDraftJob) => void;
  workers: readonly WorkerView[];
  onWorker: (wi: number, ca: EcprWorkerInput) => void;
  plans: readonly { name: string; type?: string }[];
  days: { iso: string; letter: string; label: string }[];
  /** The WH-347 payroll as parsed, or null while its own fields are incomplete. */
  payroll: CertifiedPayroll | null;
  ids: Record<string, EcprId>;
  onId: (key: string, id: EcprId) => void;
}) {
  const job = props.job ?? {};
  const on = job.on ?? false;
  const setJob = (patch: Partial<EcprDraftJob>) => props.onJob({ ...job, ...patch });
  const result = useMemo(() => {
    if (!on || !props.payroll) return null;
    return buildEcpr(
      props.payroll,
      job,
      props.workers.map((w) => w.ca),
      props.workers.map((w, wi) => props.ids[idKey(w, wi)]),
    );
  }, [on, props.payroll, job, props.workers, props.ids]);

  if (!on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>California public work:</strong> also make the DIR eCPR XML file for the Public
          Works portal (Labor Code § 1776)
        </label>
      </section>
    );
  }

  const categories = props.plans.map(
    (p, k) => job.planCategories?.[k] ?? guessFringeCategory(`${p.type ?? ""} ${p.name}`),
  );

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">California public works: DIR eCPR (XML, schema 2.0)</h2>
        <button type="button" className="link text-sm" onClick={() => setJob({ on: false })}>
          Hide
        </button>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        The same week as the file DIR's Public Works portal takes (version 2.0; DIR stops taking
        version 1 files on 13 January 2027). DIR asks for more than the WH-347: each worker's home
        address and full SSN or ITIN, the craft, the check number and the deductions by kind. The
        file is made in this browser. SSNs and ITINs are kept only until you leave or reload this
        page: they are not saved with the draft and never sent to PayApps.
      </p>
      <div className="grid gap-3 md:grid-cols-4">
        <F label="Contractor PWCR (10 digits)">
          <input
            className="input"
            inputMode="numeric"
            value={job.pwcr ?? ""}
            onChange={(e) => setJob({ pwcr: e.target.value })}
          />
        </F>
        <F label="DIR project ID">
          <input
            className="input"
            inputMode="numeric"
            value={job.projectId ?? ""}
            onChange={(e) => setJob({ projectId: e.target.value })}
          />
        </F>
        <F label="Awarding body (optional)" className="md:col-span-2">
          <input
            className="input"
            value={job.awardingBody ?? ""}
            onChange={(e) => setJob({ awardingBody: e.target.value })}
          />
        </F>
        <label className="text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={job.nonPerformance ?? false}
            onChange={(e) => setJob({ nonPerformance: e.target.checked })}
          />{" "}
          No work this week (statement of non-performance)
        </label>
        <label className="text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={job.noFringeIsPaidToEmployee ?? false}
            onChange={(e) => setJob({ noFringeIsPaidToEmployee: e.target.checked })}
          />{" "}
          No fringe recorded means it is paid to the worker in the wage
        </label>
      </div>

      {props.plans.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Fringe plans by DIR category</h3>
          {props.plans.map((p, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: follows the plan list above by position
            <F key={k} label={p.name || `Plan ${k + 1}`}>
              <select
                className="input w-fit"
                value={categories[k]}
                onChange={(e) => {
                  const next = props.plans.map((_, i) => job.planCategories?.[i] ?? null);
                  next[k] = e.target.value as EcprFringeCategory;
                  setJob({ planCategories: next });
                }}
              >
                {ECPR_FRINGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ECPR_FRINGE_LABELS[c]}
                  </option>
                ))}
              </select>
            </F>
          ))}
          <p className="text-xs text-slate-500">
            Cash paid in lieu of fringe is reported under "Other", paid to the employee.
          </p>
        </div>
      )}

      {!job.nonPerformance &&
        props.workers.map((w, wi) => {
          const ca = w.ca ?? {};
          const set = (patch: Partial<EcprWorkerInput>) => props.onWorker(wi, { ...ca, ...patch });
          const setRow = (ri: number, patch: Partial<EcprRowInput>) => {
            const rows = w.rows.map((_, i) => ca.rows?.[i] ?? {});
            rows[ri] = { ...rows[ri], ...patch };
            set({ rows });
          };
          const key = idKey(w, wi);
          const id = props.ids[key] ?? { ssn: "", itin: "" };
          return (
            <div key={key} className="grid gap-2 rounded border border-slate-200 p-3">
              <p className="font-semibold">
                {wi + 1}. {w.firstName} {w.lastName}
              </p>
              <div className="grid gap-2 md:grid-cols-6">
                <F label="Middle name">
                  <input
                    className="input"
                    value={ca.middleName ?? ""}
                    onChange={(e) => set({ middleName: e.target.value })}
                  />
                </F>
                <F label="Street" className="md:col-span-2">
                  <input
                    className="input"
                    autoComplete="off"
                    value={ca.street ?? ""}
                    onChange={(e) => set({ street: e.target.value })}
                  />
                </F>
                <F label="City">
                  <input
                    className="input"
                    autoComplete="off"
                    value={ca.city ?? ""}
                    onChange={(e) => set({ city: e.target.value })}
                  />
                </F>
                <F label="State">
                  <input
                    className="input w-16"
                    maxLength={2}
                    value={ca.state ?? ""}
                    onChange={(e) => set({ state: e.target.value.toUpperCase() })}
                  />
                </F>
                <F label="ZIP">
                  <input
                    className="input"
                    inputMode="numeric"
                    value={ca.zip ?? ""}
                    onChange={(e) => set({ zip: e.target.value })}
                  />
                </F>
                <F label="SSN (not saved)">
                  <input
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    value={id.ssn}
                    onChange={(e) => props.onId(key, { ...id, ssn: e.target.value })}
                  />
                </F>
                <F label="or ITIN (not saved)">
                  <input
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    value={id.itin}
                    onChange={(e) => props.onId(key, { ...id, itin: e.target.value })}
                  />
                </F>
                <F label="Check no. or CASH">
                  <input
                    className="input"
                    maxLength={20}
                    value={ca.checkNum ?? ""}
                    onChange={(e) => set({ checkNum: e.target.value })}
                  />
                </F>
                <F label="Travel and subsistence">
                  <MoneyInput
                    label="Travel and subsistence"
                    min={0}
                    value={ca.travelSubsCents ?? 0}
                    onChange={(c) => set({ travelSubsCents: c })}
                  />
                </F>
                <F label="Notes (optional)" className="md:col-span-2">
                  <input
                    className="input"
                    maxLength={256}
                    value={ca.notes ?? ""}
                    onChange={(e) => set({ notes: e.target.value })}
                  />
                </F>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                <F label="State tax (of withholding)">
                  <MoneyInput
                    label="State income tax"
                    min={0}
                    value={ca.stateTaxCents ?? 0}
                    onChange={(c) => set({ stateTaxCents: c })}
                  />
                </F>
                <F label="SDI (of other)">
                  <MoneyInput
                    label="SDI"
                    min={0}
                    value={ca.sdiCents ?? 0}
                    onChange={(c) => set({ sdiCents: c })}
                  />
                </F>
                <F label="Fund admin (of other)">
                  <MoneyInput
                    label="Fund administration"
                    min={0}
                    value={ca.fundAdminCents ?? 0}
                    onChange={(c) => set({ fundAdminCents: c })}
                  />
                </F>
                <F label="Savings (of other)">
                  <MoneyInput
                    label="Savings"
                    min={0}
                    value={ca.savingsCents ?? 0}
                    onChange={(c) => set({ savingsCents: c })}
                  />
                </F>
                <F label="Dues (of other)">
                  <MoneyInput
                    label="Dues"
                    min={0}
                    value={ca.duesCents ?? 0}
                    onChange={(c) => set({ duesCents: c })}
                  />
                </F>
              </div>
              {w.rows.map((r, ri) => {
                const cr = ca.rows?.[ri] ?? {};
                const dt = cr.dt ?? [0, 0, 0, 0, 0, 0, 0];
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: follows the worker's rows above by position
                  <div key={ri} className="flex flex-wrap items-end gap-2">
                    <span className="text-sm text-slate-600">
                      {r.classification || `Row ${ri + 1}`}
                    </span>
                    <F label="Craft">
                      <input
                        className="input"
                        placeholder="e.g. Carpenter"
                        value={cr.craft ?? ""}
                        onChange={(e) => setRow(ri, { craft: e.target.value })}
                      />
                    </F>
                    {r.status === "RA" && (
                      <F label="Apprentice period (1-10)">
                        <input
                          className="input w-16"
                          inputMode="numeric"
                          value={
                            cr.apprenticePeriod ?? periodFromLevel(r.apprenticeLevel ?? "") ?? ""
                          }
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setRow(ri, {
                              apprenticePeriod: Number.isInteger(n) && n >= 1 && n <= 10 ? n : null,
                            });
                          }}
                        />
                      </F>
                    )}
                    <div className="grid gap-1 text-sm">
                      <span className="text-slate-600">Doubletime hours</span>
                      <div className="flex gap-1">
                        {props.days.map((d, di) => (
                          <HoursCell
                            key={d.iso}
                            label={`Doubletime ${d.label}`}
                            value={dt[di] ?? 0}
                            onChange={(h) =>
                              setRow(ri, { dt: dt.map((x, i) => (i === di ? h : x)) })
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <F label="DT rate">
                      <MoneyInput
                        label="Doubletime rate"
                        min={0}
                        value={cr.dtRateCents ?? 0}
                        onChange={(c) => setRow(ri, { dtRateCents: c })}
                      />
                    </F>
                  </div>
                );
              })}
            </div>
          );
        })}

      {!props.payroll && (
        <p className="text-sm text-amber-800">
          Fill in the payroll fields above first; the file is built from them.
        </p>
      )}
      {result && result.issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm">
          {result.issues.map((i, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a computed list with no other identity
            <li key={k} className={i.level === "error" ? "text-red-700" : "text-amber-800"}>
              <strong>{i.where}:</strong> {i.message}
            </li>
          ))}
        </ul>
      )}
      <div>
        <button
          type="button"
          className="btn"
          disabled={!result?.xml}
          onClick={() => {
            if (result?.xml && props.payroll) {
              download(result.xml, ecprFileName(job.projectId ?? "", props.payroll.weekEnding));
            }
          }}
        >
          Download eCPR XML
        </button>
      </div>
      <p className="text-xs text-slate-500">{ECPR_NOTICE}</p>
    </section>
  );
}
