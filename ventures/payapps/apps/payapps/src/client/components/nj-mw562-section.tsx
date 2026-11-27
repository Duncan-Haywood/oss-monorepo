// The certified payroll page's New Jersey part: the same week written into the contractor's own copy
// of NJDOL's fillable MW-562 (src/shared/nj-mw562.ts), which the NJ Wage Hub reads on upload. The
// blank form is NJDOL's file: the contractor picks it once (it is kept in this browser), and the
// filled copy is made here and downloaded. Nothing on this card is sent to PayApps.
import type { CertifiedPayroll } from "@shared/certified-payroll";
import {
  buildMw562,
  guessNjBenefitType,
  MW562_REVISION,
  MW562_SOURCE_URL,
  mw562FileName,
  NJ_BENEFIT_LABELS,
  NJ_BENEFIT_TYPES,
  NJ_ETHNICITY,
  NJ_MW562_NOTICE,
  NJ_RACE,
  NJ_SEX,
  type NjBenefitType,
  type NjJobInput,
  type NjWorkerInput,
} from "@shared/nj-mw562";
import { mw562FieldNames } from "@shared/nj-mw562-fields";
import { FormFillError, fillForm, readFormFields } from "@shared/pdf/form-fill";
import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "./money-input";

export type NjDraftJob = NjJobInput & { on?: boolean };

interface WorkerView {
  uid?: string;
  lastName: string;
  firstName: string;
  nj?: NjWorkerInput;
}

const BLANK_KEY = "payapps:mw562-blank";

function F(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, inside the label
    <label className={`grid gap-1 text-sm ${props.className ?? ""}`}>
      <span className="text-slate-600">{props.label}</span>
      {props.children}
    </label>
  );
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const toB64 = (b: Uint8Array) => {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function loadBlank(): Uint8Array | null {
  try {
    const s = localStorage.getItem(BLANK_KEY);
    return s ? fromB64(s) : null;
  } catch {
    return null;
  }
}
function saveBlank(b: Uint8Array | null) {
  try {
    if (b) localStorage.setItem(BLANK_KEY, toB64(b));
    else localStorage.removeItem(BLANK_KEY);
  } catch {
    // Storage full or blocked: the form is still used for this visit.
  }
}

/** Every field the builder sets must be on the chosen form, or it is another revision. */
async function checkBlank(bytes: Uint8Array, names: readonly string[]): Promise<string | null> {
  try {
    const fields = await readFormFields(bytes);
    const missing = names.filter((n) => !fields.has(n));
    if (missing.length) {
      return `This PDF is not NJDOL's ${MW562_REVISION}: ${missing.length} of its fields are missing. Download the current form from NJDOL and pick it again.`;
    }
    return null;
  } catch (e) {
    return e instanceof FormFillError ? `This PDF ${e.message}.` : "This file could not be read.";
  }
}

const idKey = (w: { uid?: string }, wi: number) => w.uid ?? `i${wi}`;

export function NjMw562Section(props: {
  job: NjDraftJob | undefined;
  onJob: (job: NjDraftJob) => void;
  workers: readonly WorkerView[];
  onWorker: (wi: number, nj: NjWorkerInput) => void;
  plans: readonly { name: string; type?: string }[];
  /** The WH-347 payroll as parsed, or null while its own fields are incomplete. */
  payroll: CertifiedPayroll | null;
}) {
  const job = props.job ?? {};
  const on = job.on ?? false;
  const setJob = (patch: Partial<NjDraftJob>) => props.onJob({ ...job, ...patch });
  const [blank, setBlank] = useState<Uint8Array | null>(null);
  const [blankError, setBlankError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);

  useEffect(() => {
    if (on && !blank) setBlank(loadBlank());
  }, [on, blank]);

  const result = useMemo(() => {
    if (!on || !props.payroll) return null;
    return buildMw562(
      props.payroll,
      job,
      props.workers.map((w) => w.nj),
    );
  }, [on, props.payroll, job, props.workers]);

  if (!on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>New Jersey public works:</strong> also fill NJDOL's form MW-562 for upload to the
          NJ Wage Hub (certified payroll is filed there for pay periods ending on or after 15 August
          2024)
        </label>
      </section>
    );
  }

  const types = props.plans.map(
    (p, k) => job.planTypes?.[k] ?? guessNjBenefitType(`${p.type ?? ""} ${p.name}`),
  );
  const hasErrors = !result || result.issues.some((i) => i.level === "error");
  const sheets = result?.sheets ?? [];

  const pick = async (file: File | undefined) => {
    setBlankError(null);
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const names = mw562FieldNames();
    const problem = await checkBlank(bytes, names);
    if (problem) {
      setBlankError(problem);
      return;
    }
    setBlank(bytes);
    saveBlank(bytes);
  };

  const fillAll = async () => {
    if (!blank || !props.payroll || !result) return;
    setBusy(true);
    setFillError(null);
    try {
      for (let s = 0; s < sheets.length; s++) {
        const out = await fillForm(blank, sheets[s] as Record<string, string | boolean>, {
          clearOthers: true,
        });
        download(
          out,
          mw562FileName(props.payroll.payrollNo, props.payroll.weekEnding, s + 1, sheets.length),
        );
      }
    } catch (e) {
      setFillError(
        e instanceof FormFillError
          ? `The saved MW-562 ${e.message}.`
          : "The MW-562 could not be filled.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">New Jersey public works: MW-562 for the NJ Wage Hub</h2>
        <button type="button" className="link text-sm" onClick={() => setJob({ on: false })}>
          Hide
        </button>
      </div>
      <p className="max-w-3xl text-sm text-slate-600">
        The same week written into NJDOL's own fillable form, {MW562_REVISION}. In the Wage Hub,
        click "Add Certified Payroll" and drag the file in: it fills steps 1 to 4 for you to review.
        The MW-562 asks for more than the WH-347: the FEIN, your New Jersey public works contractor
        registration number, each worker's address, sex, race and ethnicity, and state tax as its
        own deduction. The form is filled in this browser; nothing on this card is sent to PayApps.
      </p>

      <div className="grid gap-2 rounded border border-slate-200 p-3 text-sm">
        <p>
          <strong>1. The blank form.</strong> Download the MW-562 from{" "}
          <a className="link" href={MW562_SOURCE_URL} target="_blank" rel="noreferrer">
            NJDOL's prevailing wage updates page
          </a>{" "}
          ("Payroll Certification for Public Works Projects (MW-562)") and pick it here once; it is
          kept in this browser for next week.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Blank MW-562 PDF"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          {blank && (
            <>
              <span className="text-green-800">MW-562 ready.</span>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setBlank(null);
                  saveBlank(null);
                }}
              >
                Forget it
              </button>
            </>
          )}
        </div>
        {blankError && <p className="text-red-700">{blankError}</p>}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <F label="FEIN">
          <input
            className="input"
            value={job.fein ?? ""}
            onChange={(e) => setJob({ fein: e.target.value })}
          />
        </F>
        <F label="NJ public works contractor registration #">
          <input
            className="input"
            value={job.registrationNo ?? ""}
            onChange={(e) => setJob({ registrationNo: e.target.value })}
          />
        </F>
        <F label="Date wages due & paid">
          <input
            className="input"
            type="date"
            value={job.datePaid ?? ""}
            onChange={(e) => setJob({ datePaid: e.target.value })}
          />
        </F>
      </div>

      {props.plans.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">
            Fringe plans by the MW-562's benefit types, 4(c)
          </h3>
          {props.plans.map((p, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: follows the plan list above by position
            <F key={k} label={p.name || `Plan ${k + 1}`}>
              <select
                className="input w-fit"
                value={types[k]}
                onChange={(e) => {
                  const next = props.plans.map((_, i) => job.planTypes?.[i] ?? null);
                  next[k] = e.target.value as NjBenefitType;
                  setJob({ planTypes: next });
                }}
              >
                {NJ_BENEFIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {NJ_BENEFIT_LABELS[t]}
                  </option>
                ))}
              </select>
            </F>
          ))}
        </div>
      )}

      {props.workers.map((w, wi) => {
        const nj = w.nj ?? {};
        const set = (patch: Partial<NjWorkerInput>) => props.onWorker(wi, { ...nj, ...patch });
        return (
          <div key={idKey(w, wi)} className="grid gap-2 rounded border border-slate-200 p-3">
            <p className="font-semibold">
              {wi + 1}. {w.firstName} {w.lastName}
            </p>
            <div className="grid gap-2 md:grid-cols-6">
              <F label="Address" className="md:col-span-3">
                <input
                  className="input"
                  autoComplete="off"
                  maxLength={200}
                  value={nj.address ?? ""}
                  onChange={(e) => set({ address: e.target.value })}
                />
              </F>
              <F label="Sex">
                <select
                  className="input"
                  value={nj.sex ?? ""}
                  onChange={(e) => set({ sex: e.target.value as NjWorkerInput["sex"] })}
                >
                  <option value="">-</option>
                  {Object.entries(NJ_SEX).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} = {v}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Race">
                <select
                  className="input"
                  value={nj.race ?? ""}
                  onChange={(e) => set({ race: e.target.value as NjWorkerInput["race"] })}
                >
                  <option value="">-</option>
                  {Object.entries(NJ_RACE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} = {v}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Ethnicity">
                <select
                  className="input"
                  value={nj.ethnicity ?? ""}
                  onChange={(e) => set({ ethnicity: e.target.value as NjWorkerInput["ethnicity"] })}
                >
                  <option value="">-</option>
                  {Object.entries(NJ_ETHNICITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} = {v}
                    </option>
                  ))}
                </select>
              </F>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              <F label="NJ state tax (of withholding)">
                <MoneyInput
                  label="New Jersey state income tax"
                  min={0}
                  value={nj.stateTaxCents ?? 0}
                  onChange={(c) => set({ stateTaxCents: c })}
                />
              </F>
              <F label="NJ UI/DI/FLI (of other)">
                <MoneyInput
                  label="New Jersey unemployment, disability and family leave contributions"
                  min={0}
                  value={nj.njContribCents ?? 0}
                  onChange={(c) => set({ njContribCents: c })}
                />
              </F>
            </div>
          </div>
        );
      })}

      <label className="text-sm">
        <input
          type="checkbox"
          checked={job.eSign ?? false}
          onChange={(e) => setJob({ eSign: e.target.checked })}
        />{" "}
        Tick the form's electronic signature box for{" "}
        {props.payroll?.certifierName || "the certifier named above"} (only the person certifying
        should tick this)
      </label>
      {job.eSign && (
        <F label="Signature date" className="w-fit">
          <input
            className="input"
            type="date"
            value={job.signDate ?? ""}
            onChange={(e) => setJob({ signDate: e.target.value })}
          />
        </F>
      )}

      {!props.payroll && (
        <p className="text-sm text-amber-800">
          Fill in the payroll fields above first; the form is filled from them.
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
      {fillError && <p className="text-sm text-red-700">{fillError}</p>}
      <div>
        <button
          type="button"
          className="btn"
          disabled={!blank || hasErrors || busy}
          onClick={() => void fillAll()}
        >
          {sheets.length > 1 ? `Download ${sheets.length} MW-562 sheets` : "Download filled MW-562"}
        </button>
        {!blank && <span className="ml-3 text-sm text-slate-500">Pick the blank form first.</span>}
      </div>
      <p className="text-xs text-slate-500">{NJ_MW562_NOTICE}</p>
    </section>
  );
}
