// The certified payroll page's New York part: the same week as the NYSDOL Certified Payroll portal's
// bulk-upload XML file (src/shared/ny-cpr.ts). Built in the browser and downloaded; a worker's date
// of birth is held in memory only, never in the saved draft and never sent to us.
import type { CertifiedPayroll } from "@shared/certified-payroll";
import { NY_CLASSIFICATIONS } from "@shared/ny-classifications";
import {
  buildNyCpr,
  guessSupplementType,
  matchNyClassification,
  NY_CPR_NOTICE,
  NY_SUPPLEMENT_TYPES,
  type NyId,
  type NyJobInput,
  type NySupplementType,
  type NyWorkerInput,
  nyCprFileName,
} from "@shared/ny-cpr";
import { useMemo } from "react";
import { MoneyInput } from "./money-input";

export type NyDraftJob = NyJobInput & { on?: boolean };

interface WorkerView {
  uid?: string;
  lastName: string;
  firstName: string;
  idNo?: string;
  rows: { classification: string; status: "J" | "RA" }[];
  ny?: NyWorkerInput;
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

const idKey = (w: { uid?: string }, wi: number) => w.uid ?? `i${wi}`;
const LIST_ID = "ny-classifications";

export function NyCprSection(props: {
  job: NyDraftJob | undefined;
  onJob: (job: NyDraftJob) => void;
  workers: readonly WorkerView[];
  onWorker: (wi: number, ny: NyWorkerInput) => void;
  plans: readonly { name: string; type?: string }[];
  /** The WH-347 payroll as parsed, or null while its own fields are incomplete. */
  payroll: CertifiedPayroll | null;
  ids: Record<string, NyId>;
  onId: (key: string, id: NyId) => void;
}) {
  const job = props.job ?? {};
  const on = job.on ?? false;
  const setJob = (patch: Partial<NyDraftJob>) => props.onJob({ ...job, ...patch });
  const result = useMemo(() => {
    if (!on || !props.payroll) return null;
    return buildNyCpr(
      props.payroll,
      job,
      props.workers.map((w) => w.ny),
      props.workers.map((w, wi) => props.ids[idKey(w, wi)]),
    );
  }, [on, props.payroll, job, props.workers, props.ids]);

  if (!on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>New York public work:</strong> also make the XML file for the NYSDOL Certified
          Payroll portal's bulk upload (required for Article 8 public work since 1 January 2026)
        </label>
      </section>
    );
  }

  const types = props.plans.map(
    (p, k) => job.planTypes?.[k] ?? guessSupplementType(`${p.type ?? ""} ${p.name}`),
  );

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">New York public work: NYSDOL certified payroll (XML)</h2>
        <button type="button" className="link text-sm" onClick={() => setJob({ on: false })}>
          Hide
        </button>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        The same week as the file the NYSDOL Certified Payroll portal takes by bulk upload (one
        project and one week per file, up to 500 workers). NYSDOL asks for more than the WH-347:
        each worker's home address, the last four digits of the SSN (or else the date of birth),
        whether the worker is a New York registered apprentice, a classification from NYSDOL's own
        list, and the deductions and supplements by type. The file is made in this browser. Dates of
        birth are kept only until you leave or reload this page: they are not saved with the draft
        and never sent to PayApps.
      </p>
      <datalist id={LIST_ID}>
        {NY_CLASSIFICATIONS.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="grid gap-3 md:grid-cols-4">
        <F label="PRC number (prevailing rate case, 10 characters)">
          <input
            className="input"
            value={job.prcNumber ?? ""}
            onChange={(e) => setJob({ prcNumber: e.target.value })}
          />
        </F>
      </div>

      {props.plans.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Fringe plans as NYSDOL supplement types</h3>
          {props.plans.map((p, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: follows the plan list above by position
            <div key={k} className="flex flex-wrap items-end gap-3">
              <F label={p.name || `Plan ${k + 1}`}>
                <select
                  className="input w-fit"
                  value={types[k]}
                  onChange={(e) => {
                    const next = props.plans.map((_, i) => job.planTypes?.[i] ?? null);
                    next[k] = e.target.value as NySupplementType;
                    setJob({ planTypes: next });
                  }}
                >
                  {NY_SUPPLEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </F>
              <label className="text-sm">
                <input
                  type="checkbox"
                  checked={job.planOtTimeAndHalf?.[k] ?? false}
                  onChange={(e) => {
                    const next = props.plans.map((_, i) => job.planOtTimeAndHalf?.[i] ?? false);
                    next[k] = e.target.checked;
                    setJob({ planOtTimeAndHalf: next });
                  }}
                />{" "}
                Paid at time and a half on overtime hours (as the rate schedule says)
              </label>
            </div>
          ))}
          <p className="text-xs text-slate-500">
            Cash paid in lieu of supplements is reported as "Other Benefit (Type)" with that
            explanation.
          </p>
        </div>
      )}

      {props.workers.map((w, wi) => {
        const ny = w.ny ?? {};
        const set = (patch: Partial<NyWorkerInput>) => props.onWorker(wi, { ...ny, ...patch });
        const key = idKey(w, wi);
        const id = props.ids[key] ?? { dob: "" };
        const fromIdNo = /^\d{4}$/.test((w.idNo ?? "").trim());
        return (
          <div key={key} className="grid gap-2 rounded border border-slate-200 p-3">
            <p className="font-semibold">
              {wi + 1}. {w.firstName} {w.lastName}
            </p>
            <div className="grid gap-2 md:grid-cols-6">
              <F label="Middle name">
                <input
                  className="input"
                  value={ny.middleName ?? ""}
                  onChange={(e) => set({ middleName: e.target.value })}
                />
              </F>
              <F label="Street" className="md:col-span-2">
                <input
                  className="input"
                  autoComplete="off"
                  maxLength={42}
                  value={ny.address1 ?? ""}
                  onChange={(e) => set({ address1: e.target.value })}
                />
              </F>
              <F label="Apt, suite">
                <input
                  className="input"
                  autoComplete="off"
                  maxLength={42}
                  value={ny.address2 ?? ""}
                  onChange={(e) => set({ address2: e.target.value })}
                />
              </F>
              <F label="City">
                <input
                  className="input"
                  autoComplete="off"
                  maxLength={40}
                  value={ny.city ?? ""}
                  onChange={(e) => set({ city: e.target.value })}
                />
              </F>
              <F label="State">
                <input
                  className="input"
                  placeholder="NY"
                  value={ny.state ?? ""}
                  onChange={(e) => set({ state: e.target.value })}
                />
              </F>
              <F label="ZIP">
                <input
                  className="input"
                  inputMode="numeric"
                  value={ny.zip ?? ""}
                  onChange={(e) => set({ zip: e.target.value })}
                />
              </F>
              <F label={fromIdNo ? "SSN last four (from ID no.)" : "SSN last four"}>
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="off"
                  placeholder={fromIdNo ? (w.idNo ?? "").trim() : ""}
                  value={ny.ssnLast4 ?? ""}
                  onChange={(e) => set({ ssnLast4: e.target.value })}
                />
              </F>
              {!fromIdNo && !ny.ssnLast4 && (
                <F label="or date of birth (not saved)">
                  <input
                    className="input"
                    type="date"
                    autoComplete="off"
                    value={id.dob}
                    onChange={(e) => props.onId(key, { dob: e.target.value })}
                  />
                </F>
              )}
              <label className="text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={ny.nysApprentice ?? w.rows.some((r) => r.status === "RA")}
                  onChange={(e) => set({ nysApprentice: e.target.checked })}
                />{" "}
                New York registered apprentice
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <F label="State tax (of withholding)">
                <MoneyInput
                  label="New York State income tax"
                  min={0}
                  value={ny.stateTaxCents ?? 0}
                  onChange={(c) => set({ stateTaxCents: c })}
                />
              </F>
              <F label="Local tax (of withholding)">
                <MoneyInput
                  label="Local income tax"
                  min={0}
                  value={ny.localTaxCents ?? 0}
                  onChange={(c) => set({ localTaxCents: c })}
                />
              </F>
              <F label="Disability / PFL (of other)">
                <MoneyInput
                  label="Disability and paid family leave"
                  min={0}
                  value={ny.disabilityPflCents ?? 0}
                  onChange={(c) => set({ disabilityPflCents: c })}
                />
              </F>
              <F label="Union dues (of other)">
                <MoneyInput
                  label="Union dues"
                  min={0}
                  value={ny.duesCents ?? 0}
                  onChange={(c) => set({ duesCents: c })}
                />
              </F>
            </div>
            {w.rows.map((r, ri) => {
              const chosen = ny.rows?.[ri]?.category ?? "";
              const matched = matchNyClassification(chosen || r.classification);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: follows the worker's rows above by position
                <div key={ri} className="flex flex-wrap items-end gap-2">
                  <F label={`NYSDOL classification for "${r.classification || `row ${ri + 1}`}"`}>
                    <input
                      className="input min-w-72"
                      list={LIST_ID}
                      placeholder={matched ?? "Pick from NYSDOL's list"}
                      value={chosen}
                      onChange={(e) => {
                        const rows = w.rows.map((_, i) => ny.rows?.[i] ?? {});
                        rows[ri] = { category: e.target.value };
                        set({ rows });
                      }}
                    />
                  </F>
                  <span className={`text-xs ${matched ? "text-slate-500" : "text-red-700"}`}>
                    {matched ? `In the file as "${matched}"` : "Not on NYSDOL's list"}
                  </span>
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
              download(result.xml, nyCprFileName(job.prcNumber ?? "", props.payroll.weekEnding));
            }
          }}
        >
          Download NYSDOL XML
        </button>
      </div>
      <p className="text-xs text-slate-500">{NY_CPR_NOTICE}</p>
    </section>
  );
}
