// The certified payroll page's Washington part: the same week as the XML file L&I's PWIA system
// takes ("Submit Payroll in XML File", src/shared/wa-cpr.ts). Built in the browser and downloaded;
// workers' full Social Security numbers are held in memory only, never in the saved draft and never
// sent to us.
import type { CertifiedPayroll } from "@shared/certified-payroll";
import { WA_COUNTIES, WA_TRADES } from "@shared/wa-codes";
import {
  buildWaCpr,
  guessWaBenefitType,
  WA_APPRENTICE_STATES,
  WA_BENEFIT_LABELS,
  WA_BENEFIT_TYPES,
  WA_CPR_NOTICE,
  WA_ETHNICITIES,
  type WaBenefitType,
  type WaId,
  type WaJobInput,
  type WaRowInput,
  type WaWorkerInput,
  waCprFileName,
} from "@shared/wa-cpr";
import { useMemo } from "react";

export type WaDraftJob = WaJobInput & { on?: boolean };

interface WorkerView {
  uid?: string;
  lastName: string;
  firstName: string;
  rows: { classification: string; status: "J" | "RA" }[];
  wa?: WaWorkerInput;
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
const COUNTY_LIST = "wa-counties";
const intOrNull = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null);

export function WaCprSection(props: {
  job: WaDraftJob | undefined;
  onJob: (job: WaDraftJob) => void;
  workers: readonly WorkerView[];
  onWorker: (wi: number, wa: WaWorkerInput) => void;
  plans: readonly { name: string; type?: string }[];
  /** The WH-347 payroll as parsed, or null while its own fields are incomplete. */
  payroll: CertifiedPayroll | null;
  ids: Record<string, WaId>;
  onId: (key: string, id: WaId) => void;
}) {
  const job = props.job ?? {};
  const on = job.on ?? false;
  const setJob = (patch: Partial<WaDraftJob>) => props.onJob({ ...job, ...patch });
  const result = useMemo(() => {
    if (!on || !props.payroll) return null;
    return buildWaCpr(
      props.payroll,
      job,
      props.workers.map((w) => w.wa),
      props.workers.map((w, wi) => props.ids[idKey(w, wi)]),
    );
  }, [on, props.payroll, job, props.workers, props.ids]);

  if (!on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>Washington public works:</strong> also make the XML file L&amp;I's PWIA system
          takes (certified payroll must be filed online with L&amp;I at least once a month)
        </label>
      </section>
    );
  }

  const types = props.plans.map(
    (p, k) => job.planTypes?.[k] ?? guessWaBenefitType(`${p.type ?? ""} ${p.name}`),
  );

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Washington public works: L&amp;I certified payroll (XML)</h2>
        <button type="button" className="link text-sm" onClick={() => setJob({ on: false })}>
          Hide
        </button>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        The same week as the file you upload in L&amp;I's Prevailing Wage Intent and Affidavit
        (PWIA) system with "Submit Payroll in XML File" (one Intent, one week). L&amp;I asks for
        more than the WH-347: each worker's full Social Security number and home address, L&amp;I's
        four-letter trade and the county for each row, an apprentice's registration and step, and
        the fringe benefits by type. The file is made in this browser. Social Security numbers are
        kept only until you leave or reload this page: they are not saved with the draft and never
        sent to PayApps. Every week you file for the same Intent must end on the same weekday.
      </p>
      <datalist id={COUNTY_LIST}>
        {WA_COUNTIES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="grid gap-3 md:grid-cols-4">
        <F label="Intent ID (from your filed Statement of Intent)">
          <input
            className="input"
            inputMode="numeric"
            value={job.intentId ?? ""}
            onChange={(e) => setJob({ intentId: e.target.value })}
          />
        </F>
        <F label="County of the work">
          <input
            className="input"
            list={COUNTY_LIST}
            value={job.county ?? ""}
            onChange={(e) => setJob({ county: e.target.value })}
          />
        </F>
        <label className="text-sm self-end md:col-span-2">
          <input
            type="checkbox"
            checked={job.noWork ?? false}
            onChange={(e) => setJob({ noWork: e.target.checked })}
          />{" "}
          No work performed on this project this week (the file says so, with no workers)
        </label>
      </div>

      {!job.noWork && props.plans.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Fringe plans as L&amp;I benefit types</h3>
          {props.plans.map((p, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: follows the plan list above by position
            <F key={k} label={p.name || `Plan ${k + 1}`}>
              <select
                className="input w-fit"
                value={types[k]}
                onChange={(e) => {
                  const next = props.plans.map((_, i) => job.planTypes?.[i] ?? null);
                  next[k] = e.target.value as WaBenefitType;
                  setJob({ planTypes: next });
                }}
              >
                {WA_BENEFIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {WA_BENEFIT_LABELS[t]}
                  </option>
                ))}
              </select>
            </F>
          ))}
          <p className="text-xs text-slate-500">
            Plans of one type add up; "other" plans and cash paid in lieu are listed by name.
          </p>
        </div>
      )}

      {!job.noWork &&
        props.workers.map((w, wi) => {
          const wa = w.wa ?? {};
          const set = (patch: Partial<WaWorkerInput>) => props.onWorker(wi, { ...wa, ...patch });
          const setRow = (ri: number, patch: Partial<WaRowInput>) => {
            const rows = w.rows.map((_, i) => wa.rows?.[i] ?? {});
            rows[ri] = { ...rows[ri], ...patch };
            set({ rows });
          };
          const key = idKey(w, wi);
          const id = props.ids[key] ?? { ssn: "" };
          return (
            <div key={key} className="grid gap-2 rounded border border-slate-200 p-3">
              <p className="font-semibold">
                {wi + 1}. {w.firstName} {w.lastName}
              </p>
              <div className="grid gap-2 md:grid-cols-6">
                <F label="Full SSN (not saved)">
                  <input
                    className="input"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={11}
                    value={id.ssn}
                    onChange={(e) => props.onId(key, { ssn: e.target.value })}
                  />
                </F>
                <F label="Street" className="md:col-span-2">
                  <input
                    className="input"
                    autoComplete="off"
                    value={wa.address1 ?? ""}
                    onChange={(e) => set({ address1: e.target.value })}
                  />
                </F>
                <F label="Apt, suite">
                  <input
                    className="input"
                    autoComplete="off"
                    value={wa.address2 ?? ""}
                    onChange={(e) => set({ address2: e.target.value })}
                  />
                </F>
                <F label="City">
                  <input
                    className="input"
                    autoComplete="off"
                    value={wa.city ?? ""}
                    onChange={(e) => set({ city: e.target.value })}
                  />
                </F>
                <div className="grid grid-cols-2 gap-2">
                  <F label="State">
                    <input
                      className="input"
                      placeholder="WA"
                      maxLength={2}
                      value={wa.state ?? ""}
                      onChange={(e) => set({ state: e.target.value })}
                    />
                  </F>
                  <F label="ZIP">
                    <input
                      className="input"
                      inputMode="numeric"
                      value={wa.zip ?? ""}
                      onChange={(e) => set({ zip: e.target.value })}
                    />
                  </F>
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">
                  Optional: gender, ethnicity, veteran status (L&amp;I checks them if given)
                </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <F label="Gender">
                    <select
                      className="input"
                      value={wa.gender ?? ""}
                      onChange={(e) => set({ gender: e.target.value as WaWorkerInput["gender"] })}
                    >
                      <option value="">Leave out</option>
                      <option value="F">F</option>
                      <option value="M">M</option>
                      <option value="?">Prefer not to answer</option>
                    </select>
                  </F>
                  <F label="Ethnicity">
                    <select
                      className="input"
                      value={wa.ethnicity ?? ""}
                      onChange={(e) =>
                        set({ ethnicity: e.target.value as WaWorkerInput["ethnicity"] })
                      }
                    >
                      <option value="">Leave out</option>
                      {WA_ETHNICITIES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label="US veteran">
                    <select
                      className="input"
                      value={wa.veteran ?? ""}
                      onChange={(e) => set({ veteran: e.target.value as WaWorkerInput["veteran"] })}
                    >
                      <option value="">Leave out</option>
                      <option value="Y">Yes</option>
                      <option value="N">No</option>
                      <option value="?">Prefer not to answer</option>
                    </select>
                  </F>
                </div>
              </details>
              {w.rows.map((r, ri) => {
                const row = wa.rows?.[ri] ?? {};
                const label = r.classification || `row ${ri + 1}`;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: follows the worker's rows above by position
                    key={ri}
                    className="grid gap-2 border-t border-slate-100 pt-2 md:grid-cols-4"
                  >
                    <F label={`L&I trade for "${label}"`}>
                      <select
                        className="input"
                        value={(row.trade ?? "").toUpperCase()}
                        onChange={(e) => setRow(ri, { trade: e.target.value })}
                      >
                        <option value="">Pick L&amp;I's trade</option>
                        {WA_TRADES.map(([code, name]) => (
                          <option key={code} value={code}>
                            {code}: {name}
                          </option>
                        ))}
                      </select>
                    </F>
                    {r.status === "J" ? (
                      <F label="L&I job classification (as on the wage lookup)">
                        <input
                          className="input"
                          placeholder={r.classification}
                          value={row.jobClass ?? ""}
                          onChange={(e) => setRow(ri, { jobClass: e.target.value })}
                        />
                      </F>
                    ) : (
                      <F label="Apprentice ID (L&I ARTS)">
                        <input
                          className="input"
                          autoComplete="off"
                          value={row.apprenticeId ?? ""}
                          onChange={(e) => setRow(ri, { apprenticeId: e.target.value })}
                        />
                      </F>
                    )}
                    <F label="County, if not the job's">
                      <input
                        className="input"
                        list={COUNTY_LIST}
                        placeholder={job.county ?? ""}
                        value={row.county ?? ""}
                        onChange={(e) => setRow(ri, { county: e.target.value })}
                      />
                    </F>
                    <label className="text-sm self-end">
                      <input
                        type="checkbox"
                        checked={row.doubleTime ?? false}
                        onChange={(e) => setRow(ri, { doubleTime: e.target.checked })}
                      />{" "}
                      This row's overtime hours are double time
                    </label>
                    {r.status === "RA" && (
                      <>
                        <F label="Registered in">
                          <select
                            className="input"
                            value={row.apprenticeState ?? "WA"}
                            onChange={(e) => setRow(ri, { apprenticeState: e.target.value })}
                          >
                            {WA_APPRENTICE_STATES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </F>
                        <F label="Apprentice occupation (L&I lookup)">
                          <input
                            className="input"
                            value={row.apprenticeOccupation ?? ""}
                            onChange={(e) => setRow(ri, { apprenticeOccupation: e.target.value })}
                          />
                        </F>
                        <F label="Step name">
                          <input
                            className="input"
                            value={row.apprenticeStep ?? ""}
                            onChange={(e) => setRow(ri, { apprenticeStep: e.target.value })}
                          />
                        </F>
                        <div className="grid grid-cols-2 gap-2">
                          <F label="Step begins (h)">
                            <input
                              className="input"
                              inputMode="numeric"
                              value={row.stepBeginHours ?? ""}
                              onChange={(e) =>
                                setRow(ri, { stepBeginHours: intOrNull(e.target.value) })
                              }
                            />
                          </F>
                          <F label="Step ends (h)">
                            <input
                              className="input"
                              inputMode="numeric"
                              value={row.stepEndHours ?? ""}
                              onChange={(e) =>
                                setRow(ri, { stepEndHours: intOrNull(e.target.value) })
                              }
                            />
                          </F>
                        </div>
                      </>
                    )}
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
              download(result.xml, waCprFileName(job.intentId ?? "", props.payroll.weekEnding));
            }
          }}
        >
          Download L&amp;I XML
        </button>
      </div>
      <p className="text-xs text-slate-500">{WA_CPR_NOTICE}</p>
    </section>
  );
}
