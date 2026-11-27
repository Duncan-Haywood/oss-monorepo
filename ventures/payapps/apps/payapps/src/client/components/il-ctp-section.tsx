// The certified payroll page's Illinois part: the same week as the CSV the Illinois Department of
// Labor's Certified Transcript of Payroll portal takes by Full Import (src/shared/il-ctp.ts). Built in
// the browser and downloaded; a worker's race, ethnicity, gender and veteran status are held in
// memory only, never in the saved draft and never sent to us.
import type { CertifiedPayroll } from "@shared/certified-payroll";
import { formatHours, parseHours } from "@shared/certified-payroll";
import {
  buildIlCtp,
  guessFringeKind,
  IL_CLASS_TYPES,
  IL_CTP_NOTICE,
  IL_FRINGE_KINDS,
  IL_FRINGE_LABELS,
  IL_GEOGRAPHIC_DIVISIONS,
  type IlFringeKind,
  type IlId,
  type IlJobInput,
  type IlRowInput,
  type IlWorkerInput,
  ilCtpFileName,
} from "@shared/il-ctp";
import { useMemo } from "react";
import { MoneyInput } from "./money-input";

export type IlDraftJob = IlJobInput & { on?: boolean };

interface WorkerView {
  uid?: string;
  lastName: string;
  firstName: string;
  idNo?: string;
  rows: { classification: string; status: "J" | "RA" }[];
  il?: IlWorkerInput;
}

type Address = {
  address?: string;
  county?: string;
  fips?: string;
  city?: string;
  state?: string;
  zip?: string;
};

function F(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, inside the label
    <label className={`grid gap-1 text-sm ${props.className ?? ""}`}>
      <span className="text-slate-600">{props.label}</span>
      {props.children}
    </label>
  );
}

function T(props: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  inputMode?: "numeric" | "tel" | "email";
  maxLength?: number;
}) {
  return (
    <F label={props.label} className={props.className}>
      <input
        className="input"
        autoComplete="off"
        inputMode={props.inputMode}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        value={props.value ?? ""}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </F>
  );
}

function AddressFields(props: {
  value: Address | undefined;
  onChange: (a: Address) => void;
  county?: boolean;
}) {
  const a = props.value ?? {};
  const set = (patch: Partial<Address>) => props.onChange({ ...a, ...patch });
  return (
    <>
      <T
        label="Street"
        className="md:col-span-2"
        value={a.address}
        onChange={(v) => set({ address: v })}
      />
      <T label="City" value={a.city} onChange={(v) => set({ city: v })} />
      {props.county !== false && (
        <T label="County" value={a.county} onChange={(v) => set({ county: v })} />
      )}
      <T label="State" placeholder="IL" value={a.state} onChange={(v) => set({ state: v })} />
      <T label="ZIP" inputMode="numeric" value={a.zip} onChange={(v) => set({ zip: v })} />
      <T
        label="County FIPS (optional)"
        inputMode="numeric"
        maxLength={5}
        value={a.fips}
        onChange={(v) => set({ fips: v })}
      />
    </>
  );
}

function download(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const idKey = (w: { uid?: string }, wi: number) => w.uid ?? `i${wi}`;
const CLASS_CODES = Array.from({ length: 14 }, (_, i) => i + 1);
const blankId: IlId = { race: "", ethnicity: "", gender: "", veteran: null };

export function IlCtpSection(props: {
  job: IlDraftJob | undefined;
  onJob: (job: IlDraftJob) => void;
  workers: readonly WorkerView[];
  onWorker: (wi: number, il: IlWorkerInput) => void;
  plans: readonly { name: string; type?: string }[];
  /** The week's seven days, oldest first, as the page shows them. */
  days: readonly { iso: string; label: string }[];
  payroll: CertifiedPayroll | null;
  ids: Record<string, IlId>;
  onId: (key: string, id: IlId) => void;
}) {
  const job = props.job ?? {};
  const on = job.on ?? false;
  const setJob = (patch: Partial<IlDraftJob>) => props.onJob({ ...job, ...patch });
  const result = useMemo(() => {
    if (!on || !props.payroll) return null;
    return buildIlCtp(
      props.payroll,
      job,
      props.workers.map((w) => w.il),
      props.workers.map((w, wi) => props.ids[idKey(w, wi)]),
    );
  }, [on, props.payroll, job, props.workers, props.ids]);

  if (!on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>Illinois public works:</strong> also make the CSV for the Illinois Department of
          Labor's Certified Transcript of Payroll portal (Full Import)
        </label>
      </section>
    );
  }

  const kinds = props.plans.map(
    (p, k) => job.planKinds?.[k] ?? guessFringeKind(`${p.type ?? ""} ${p.name}`),
  );

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          Illinois public works: IDOL certified transcript of payroll (CSV)
        </h2>
        <button type="button" className="link text-sm" onClick={() => setJob({ on: false })}>
          Hide
        </button>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        The same week in the columns of IDOL's upload template, one project per file and one row per
        worker per classification. IDOL asks for more than the WH-347: the public body, a contact
        person, each worker's home address and phone, the class type and region from the county's
        prevailing rate schedule, hours on other projects that week, and the worker's race,
        ethnicity, gender and veteran status (the Prevailing Wage Act asks for them; IDOL's FAQ says
        to ask the worker). Those four are kept only until you leave or reload this page: they are
        not saved with the draft and never sent to PayApps.
      </p>

      <h3 className="text-sm font-semibold">Project</h3>
      <div className="grid gap-2 md:grid-cols-6">
        <T
          label="Project number"
          placeholder={props.payroll?.projectNumber || ""}
          value={job.projectNumber}
          onChange={(v) => setJob({ projectNumber: v })}
        />
        <T
          label="Contract number"
          value={job.contractNumber}
          onChange={(v) => setJob({ contractNumber: v })}
        />
        <AddressFields value={job.project} onChange={(a) => setJob({ project: a })} />
        <label className="text-sm md:col-span-3">
          <input
            type="checkbox"
            checked={job.stateCapitalFunds ?? false}
            onChange={(e) => setJob({ stateCapitalFunds: e.target.checked })}
          />{" "}
          State capital funds or Rebuild Illinois project (IDOL: assume yes for any contract with a
          state agency such as IDOT or CDB)
        </label>
      </div>

      <h3 className="text-sm font-semibold">Contractor contact (IDOL emails the filed PDF here)</h3>
      <div className="grid gap-2 md:grid-cols-6">
        <T
          label="First name"
          value={job.contactFirstName}
          onChange={(v) => setJob({ contactFirstName: v })}
        />
        <T
          label="Middle"
          value={job.contactMiddleName}
          onChange={(v) => setJob({ contactMiddleName: v })}
        />
        <T
          label="Last name"
          value={job.contactLastName}
          onChange={(v) => setJob({ contactLastName: v })}
        />
        <T
          label="Phone"
          inputMode="tel"
          value={job.phone1}
          onChange={(v) => setJob({ phone1: v })}
        />
        <T
          label="Second phone"
          inputMode="tel"
          value={job.phone2}
          onChange={(v) => setJob({ phone2: v })}
        />
        <T
          label="Email"
          inputMode="email"
          value={job.email1}
          onChange={(v) => setJob({ email1: v })}
        />
        <T
          label="Second email"
          inputMode="email"
          value={job.email2}
          onChange={(v) => setJob({ email2: v })}
        />
        <AddressFields
          county={false}
          value={job.contractor}
          onChange={(a) => setJob({ contractor: a })}
        />
      </div>

      <h3 className="text-sm font-semibold">Public body</h3>
      <div className="grid gap-2 md:grid-cols-6">
        <T
          label="Name"
          className="md:col-span-2"
          value={job.publicBodyName}
          onChange={(v) => setJob({ publicBodyName: v })}
        />
        <T
          label="Contact first name"
          value={job.publicBodyContactFirstName}
          onChange={(v) => setJob({ publicBodyContactFirstName: v })}
        />
        <T
          label="Contact last name"
          value={job.publicBodyContactLastName}
          onChange={(v) => setJob({ publicBodyContactLastName: v })}
        />
        <T
          label="Phone"
          inputMode="tel"
          value={job.publicBodyPhone1}
          onChange={(v) => setJob({ publicBodyPhone1: v })}
        />
        <AddressFields value={job.publicBody} onChange={(a) => setJob({ publicBody: a })} />
      </div>

      {props.plans.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Fringe plans as IDOL's hourly columns</h3>
          {props.plans.map((p, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: follows the plan list above by position
            <F key={k} label={p.name || `Plan ${k + 1}`}>
              <select
                className="input w-fit"
                value={kinds[k]}
                onChange={(e) => {
                  const next = props.plans.map((_, i) => job.planKinds?.[i] ?? null);
                  next[k] = e.target.value as IlFringeKind;
                  setJob({ planKinds: next });
                }}
              >
                {IL_FRINGE_KINDS.map((t) => (
                  <option key={t} value={t}>
                    {IL_FRINGE_LABELS[t]}
                  </option>
                ))}
              </select>
            </F>
          ))}
          <label className="text-sm">
            <input
              type="checkbox"
              checked={job.jointlyManaged ?? false}
              onChange={(e) => setJob({ jointlyManaged: e.target.checked })}
            />{" "}
            The fund is jointly managed (labor and management trustees)
          </label>
          <div className="flex flex-wrap gap-3">
            <F label="AddOT15 (if the schedule owes it)">
              <MoneyInput
                label="AddOT15"
                min={0}
                value={job.addOt15Cents ?? 0}
                onChange={(c) => setJob({ addOt15Cents: c })}
              />
            </F>
            <F label="AddOT20 (if the schedule owes it)">
              <MoneyInput
                label="AddOT20"
                min={0}
                value={job.addOt20Cents ?? 0}
                onChange={(c) => setJob({ addOt20Cents: c })}
              />
            </F>
          </div>
        </div>
      )}

      {props.workers.map((w, wi) => {
        const il = w.il ?? {};
        const set = (patch: Partial<IlWorkerInput>) => props.onWorker(wi, { ...il, ...patch });
        const key = idKey(w, wi);
        const id = props.ids[key] ?? blankId;
        const setId = (patch: Partial<IlId>) => props.onId(key, { ...id, ...patch });
        const fromIdNo = /^\d{4}$/.test((w.idNo ?? "").trim());
        const other = il.otherHours ?? [0, 0, 0, 0, 0, 0, 0];
        return (
          <div key={key} className="grid gap-2 rounded border border-slate-200 p-3">
            <p className="font-semibold">
              {wi + 1}. {w.firstName} {w.lastName}
            </p>
            <div className="grid gap-2 md:grid-cols-6">
              <T
                label="Middle name"
                value={il.middleName}
                onChange={(v) => set({ middleName: v })}
              />
              <T
                label={fromIdNo ? "SSN last four (from ID no.)" : "SSN last four"}
                inputMode="numeric"
                maxLength={4}
                placeholder={fromIdNo ? (w.idNo ?? "").trim() : ""}
                value={il.ssnLast4}
                onChange={(v) => set({ ssnLast4: v })}
              />
              <T
                label="Phone"
                inputMode="tel"
                value={il.phone1}
                onChange={(v) => set({ phone1: v })}
              />
              <AddressFields value={il} onChange={(a) => set(a)} />
            </div>
            <div className="grid gap-2 md:grid-cols-6">
              <T label="Race (not saved)" value={id.race} onChange={(v) => setId({ race: v })} />
              <T
                label="Ethnicity (not saved)"
                value={id.ethnicity}
                onChange={(v) => setId({ ethnicity: v })}
              />
              <T
                label="Gender (not saved)"
                value={id.gender}
                onChange={(v) => setId({ gender: v })}
              />
              <F label="Veteran (not saved)">
                <select
                  className="input"
                  value={id.veteran === null ? "" : id.veteran ? "1" : "0"}
                  onChange={(e) =>
                    setId({ veteran: e.target.value === "" ? null : e.target.value === "1" })
                  }
                >
                  <option value="">Choose</option>
                  <option value="1">Yes</option>
                  <option value="0">No</option>
                </select>
              </F>
            </div>
            {w.rows.map((r, ri) => {
              const ilr: IlRowInput = il.rows?.[ri] ?? {};
              const setRow = (patch: Partial<IlRowInput>) => {
                const rows = w.rows.map((_, i) => il.rows?.[i] ?? {});
                rows[ri] = { ...ilr, ...patch };
                set({ rows });
              };
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: follows the worker's rows above by position
                <div key={ri} className="flex flex-wrap items-end gap-2">
                  <T
                    label={`IDOL classification for "${r.classification || `row ${ri + 1}`}"`}
                    placeholder={r.classification}
                    value={ilr.classification}
                    onChange={(v) => setRow({ classification: v })}
                  />
                  <F label="Region">
                    <select
                      className="input w-fit"
                      value={ilr.region ?? "ALL"}
                      onChange={(e) => setRow({ region: e.target.value as IlRowInput["region"] })}
                    >
                      {IL_GEOGRAPHIC_DIVISIONS.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </F>
                  <F label="Class type">
                    <select
                      className="input w-fit"
                      value={ilr.classType ?? "ALL"}
                      onChange={(e) =>
                        setRow({ classType: e.target.value as IlRowInput["classType"] })
                      }
                    >
                      {IL_CLASS_TYPES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </F>
                  <F label="Class code">
                    <select
                      className="input w-fit"
                      value={ilr.classCode ?? ""}
                      onChange={(e) =>
                        setRow({ classCode: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value="">None</option>
                      {CLASS_CODES.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </F>
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      checked={ilr.foreman ?? false}
                      onChange={(e) => setRow({ foreman: e.target.checked })}
                    />{" "}
                    Foreman
                  </label>
                  <T
                    label="Of the overtime, double-time hours"
                    inputMode="numeric"
                    value={ilr.dtHundredths ? formatHours(ilr.dtHundredths) : ""}
                    onChange={(v) => setRow({ dtHundredths: parseHours(v) ?? 0 })}
                  />
                  {(ilr.dtHundredths ?? 0) > 0 && (
                    <F label="Double-time rate">
                      <MoneyInput
                        label="Double-time rate"
                        min={0}
                        value={ilr.dtRateCents ?? 0}
                        onChange={(c) => setRow({ dtRateCents: c })}
                      />
                    </F>
                  )}
                </div>
              );
            })}
            <details>
              <summary className="cursor-pointer text-sm">
                Hours on other projects this week (IDOL's "non-prevailing" hours)
              </summary>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {other.map((h, d) => (
                  <F
                    // biome-ignore lint/suspicious/noArrayIndexKey: the seven days of the week
                    key={d}
                    label={props.days[d]?.label ?? `Day ${d + 1}`}
                  >
                    <input
                      className="input w-16"
                      inputMode="decimal"
                      value={h ? formatHours(h) : ""}
                      onChange={(e) => {
                        const next = [...other];
                        next[d] = parseHours(e.target.value) ?? 0;
                        set({ otherHours: next });
                      }}
                    />
                  </F>
                ))}
                <T
                  label="Of these, overtime"
                  inputMode="numeric"
                  value={il.otherOtHundredths ? formatHours(il.otherOtHundredths) : ""}
                  onChange={(v) => set({ otherOtHundredths: parseHours(v) ?? 0 })}
                />
                <F label="Rate">
                  <MoneyInput
                    label="Other-project straight-time rate"
                    min={0}
                    value={il.otherStRateCents ?? 0}
                    onChange={(c) => set({ otherStRateCents: c })}
                  />
                </F>
                <F label="OT rate">
                  <MoneyInput
                    label="Other-project overtime rate"
                    min={0}
                    value={il.otherOtRateCents ?? 0}
                    onChange={(c) => set({ otherOtRateCents: c })}
                  />
                </F>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Their gross is gross for all work (7B) less this project's. Net is split between the
                two in proportion to gross unless you type this project's net:
              </p>
              <F label="This project's net (optional)">
                <MoneyInput
                  label="This project's net pay"
                  min={0}
                  value={il.prevailingNetCents ?? 0}
                  onChange={(c) => set({ prevailingNetCents: c || null })}
                />
              </F>
            </details>
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
          disabled={!result?.csv}
          onClick={() => {
            if (result?.csv && props.payroll) {
              download(
                result.csv,
                ilCtpFileName(
                  job.projectNumber || props.payroll.projectNumber,
                  props.payroll.weekEnding,
                ),
              );
            }
          }}
        >
          Download IDOL CSV
        </button>
      </div>
      <p className="text-xs text-slate-500">{IL_CTP_NOTICE}</p>
    </section>
  );
}
