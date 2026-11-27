// The certified payroll page's New Jersey part: the same week filled into NJDOL's own MW-562, the
// form the NJ Wage Hub reads when it is dropped into its upload window (src/shared/nj-cpr.ts). The
// contractor downloads the blank form from NJDOL; PayApps fills it in this browser. The form and
// the filled file never reach our server.
import type { CertifiedPayroll } from "@shared/certified-payroll";
import {
  buildNjCpr,
  mw562Problem,
  NJ_CPR_NOTICE,
  NJ_ETHNICITY,
  NJ_ETHNICITY_LABELS,
  NJ_MW562_URL,
  NJ_RACE,
  NJ_RACE_LABELS,
  NJ_ROWS,
  NJ_SEX,
  NJ_SEX_LABELS,
  NJ_WAGE_HUB_FAQ,
  type NjJobInput,
  type NjWorkerInput,
  njCprFileName,
} from "@shared/nj-cpr";
import { FormFillError, fillForm, readFormFields } from "@shared/pdf/form-fill";
import { PdfUnreadable } from "@shared/pdf/reader";
import { useMemo, useState } from "react";
import { MoneyInput } from "./money-input";

export type NjDraftJob = NjJobInput & { on?: boolean };

interface WorkerView {
  uid?: string;
  lastName: string;
  firstName: string;
  nj?: NjWorkerInput;
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

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function NjCprSection(props: {
  job: NjDraftJob | undefined;
  onJob: (job: NjDraftJob) => void;
  workers: readonly WorkerView[];
  onWorker: (wi: number, nj: NjWorkerInput) => void;
  /** The WH-347 payroll as parsed, or null while its own fields are incomplete. */
  payroll: CertifiedPayroll | null;
}) {
  const job = props.job ?? {};
  const on = job.on ?? false;
  const setJob = (patch: Partial<NjDraftJob>) => props.onJob({ ...job, ...patch });
  /** The blank MW-562 the contractor chose: this page's memory only. */
  const [form, setForm] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => {
    if (!on || !props.payroll) return null;
    return buildNjCpr(
      props.payroll,
      job,
      props.workers.map((w) => w.nj),
      todayIso(),
    );
  }, [on, props.payroll, job, props.workers]);

  if (!on) {
    return (
      <section className="card grid gap-2">
        <label className="text-sm">
          <input type="checkbox" checked={false} onChange={() => setJob({ on: true })} />{" "}
          <strong>New Jersey public works:</strong> also fill NJDOL's MW-562 for the NJ Wage Hub
          (certified payroll must be submitted online through the Wage Hub)
        </label>
      </section>
    );
  }

  const choose = async (file: File | undefined) => {
    setFormError(null);
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const problem = mw562Problem(await readFormFields(bytes));
      if (problem) {
        setForm(null);
        setFormError(problem);
      } else setForm({ name: file.name, bytes });
    } catch (e) {
      setForm(null);
      setFormError(
        e instanceof PdfUnreadable
          ? `This PDF ${e.message}.`
          : "This file could not be read as a PDF form. Download the blank MW-562 again and choose it.",
      );
    }
  };

  const fill = async () => {
    if (!form || !result?.values || !props.payroll) return;
    setBusy(true);
    setFormError(null);
    try {
      download(await fillForm(form.bytes, result.values), njCprFileName(props.payroll.weekEnding));
    } catch (e) {
      setFormError(
        e instanceof FormFillError || e instanceof PdfUnreadable
          ? `The form could not be filled: ${e.message}.`
          : "The form could not be filled.",
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
        The NJ Wage Hub takes "an electronically filled out MW-562" dropped into its upload window
        (Add Certified Payroll). PayApps fills NJDOL's own form with this week: download the blank
        form from{" "}
        <a className="link" href={NJ_MW562_URL} target="_blank" rel="noreferrer">
          NJDOL
        </a>{" "}
        (linked from its{" "}
        <a className="link" href={NJ_WAGE_HUB_FAQ} target="_blank" rel="noreferrer">
          Wage Hub FAQ
        </a>
        ), choose it below, and PayApps fills it in this browser. The MW-562 asks for more than the
        WH-347: your FEIN and NJ public works registration number, the date wages were paid, each
        worker's address, sex, race and ethnicity, and the NJ income tax apart from federal
        withholding. It has {NJ_ROWS} rows (one per worker and classification) and its days run
        Sunday to Saturday.
      </p>
      <div className="grid gap-3 md:grid-cols-4">
        <F label="FEIN">
          <input
            className="input"
            inputMode="numeric"
            placeholder="12-3456789"
            value={job.fein ?? ""}
            onChange={(e) => setJob({ fein: e.target.value })}
          />
        </F>
        <F label="NJ public works contractor registration #">
          <input
            className="input"
            value={job.registration ?? ""}
            onChange={(e) => setJob({ registration: e.target.value })}
          />
        </F>
        <F label="Contract or project ID, if not the project number">
          <input
            className="input"
            placeholder={props.payroll?.projectNumber ?? ""}
            value={job.projectId ?? ""}
            onChange={(e) => setJob({ projectId: e.target.value })}
          />
        </F>
        <F label="Date wages due and paid">
          <input
            className="input"
            type="date"
            value={job.wagesPaid ?? ""}
            onChange={(e) => setJob({ wagesPaid: e.target.value })}
          />
        </F>
        <label className="text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={job.noWork ?? false}
            onChange={(e) => setJob({ noWork: e.target.checked })}
          />{" "}
          No work on this project this week (ticks the form's "No Work Week")
        </label>
        <label className="text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={job.sign ?? false}
            onChange={(e) => setJob({ sign: e.target.checked })}
          />{" "}
          I am the certifying official named above and sign electronically (ticks the MW-562's
          signature box with my name and today's date). Leave it unticked to sign in the PDF.
        </label>
      </div>

      {!job.noWork &&
        props.workers.map((w, wi) => {
          const nj = w.nj ?? {};
          const set = (patch: Partial<NjWorkerInput>) => props.onWorker(wi, { ...nj, ...patch });
          return (
            <div key={w.uid ?? `i${wi}`} className="grid gap-2 rounded border border-slate-200 p-3">
              <p className="font-semibold">
                {wi + 1}. {w.firstName} {w.lastName}
              </p>
              <div className="grid gap-2 md:grid-cols-6">
                <F label="Address" className="md:col-span-2">
                  <input
                    className="input"
                    autoComplete="off"
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
                    <option value="">Not given</option>
                    {NJ_SEX.map((x) => (
                      <option key={x} value={x}>
                        {NJ_SEX_LABELS[x]}
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
                    <option value="">Not given</option>
                    {NJ_RACE.map((x) => (
                      <option key={x} value={x}>
                        {NJ_RACE_LABELS[x]}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="Ethnicity">
                  <select
                    className="input"
                    value={nj.ethnicity ?? ""}
                    onChange={(e) =>
                      set({ ethnicity: e.target.value as NjWorkerInput["ethnicity"] })
                    }
                  >
                    <option value="">Not given</option>
                    {NJ_ETHNICITY.map((x) => (
                      <option key={x} value={x}>
                        {NJ_ETHNICITY_LABELS[x]}
                      </option>
                    ))}
                  </select>
                </F>
                <F label="NJ income tax (part of the withholding)">
                  <MoneyInput
                    label={`Worker ${wi + 1} NJ income tax`}
                    value={nj.stateTaxCents ?? 0}
                    min={0}
                    onChange={(c) => set({ stateTaxCents: c })}
                  />
                </F>
                <F label="Job title, if not journeyman or apprentice" className="md:col-span-2">
                  <input
                    className="input"
                    placeholder="e.g. foreman"
                    value={nj.jobTitle ?? ""}
                    onChange={(e) => set({ jobTitle: e.target.value })}
                  />
                </F>
              </div>
            </div>
          );
        })}

      <F label="The blank MW-562 from NJDOL (stays in this browser)">
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="text-sm"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
      </F>
      {form && <p className="text-sm text-green-800">Ready: {form.name} is NJDOL's MW-562.</p>}
      {formError && <p className="text-sm text-red-700">{formError}</p>}

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
      <div>
        <button
          type="button"
          className="btn"
          disabled={!result?.values || !form || busy}
          onClick={() => void fill()}
        >
          {busy ? "Filling…" : "Download filled MW-562"}
        </button>
      </div>
      <p className="text-xs text-slate-500">{NJ_CPR_NOTICE}</p>
    </section>
  );
}
