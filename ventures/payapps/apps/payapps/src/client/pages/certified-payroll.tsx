// /orgs/$orgId/projects/$projectId/certified-payroll : the job's Davis-Bacon weekly certified payroll
// in the columns of Form WH-347 (src/shared/certified-payroll.ts). Typed here, checked live, printed
// by the Worker; nothing is stored on the server. The draft (crew, rates, plans) is kept in this
// browser only, so next week starts from this week's crew ("Start next week").
import type { ProjectDetailDto } from "@shared/api/types";
import { type EcprId, type EcprWorkerInput, ecprNextWeek } from "@shared/ca-ecpr";
import {
  CERTIFIED_PAYROLL_NOTICE,
  type CertifiedPayrollInput,
  type CertifiedPayrollRow,
  type CertifiedPayrollWorker,
  certifiedPayrollSchema,
  computeCertifiedPayroll,
  formatHours,
  hasErrors,
  MAX_APPRENTICESHIP_PROGRAMS,
  MAX_FRINGE_PLANS,
  weekDays,
} from "@shared/certified-payroll";
import { centsToDecimal, formatCents, parseDollarsToCents } from "@shared/money";
import { type NyId, type NyWorkerInput, nyNextWeek } from "@shared/ny-cpr";
import { type WaId, type WaWorkerInput, waNextWeek } from "@shared/wa-cpr";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CaEcprSection, type EcprDraftJob } from "../components/ca-ecpr-section";
import { ErrorText } from "../components/error";
import { HoursCell } from "../components/hours-cell";
import { meQuery } from "../components/layout";
import { MoneyInput } from "../components/money-input";
import { NyCprSection, type NyDraftJob } from "../components/ny-cpr-section";
import { TimesheetFill } from "../components/timesheet-fill";
import { TimesheetImport } from "../components/timesheet-import";
import { WaCprSection, type WaDraftJob } from "../components/wa-cpr-section";
import { api, downloadPost, projectPath } from "../lib/api";

/** Client-only `uid`s keep React's keys stable when a worker or row is removed (zod strips them). */
type DraftRow = CertifiedPayrollRow & { uid?: string };
/**
 * `ca`: the California eCPR extras (src/shared/ca-ecpr.ts), saved with the draft; never SSNs.
 * `ny`: the New York NYSDOL extras (src/shared/ny-cpr.ts), saved with the draft; never birth dates.
 * `wa`: the Washington L&I extras (src/shared/wa-cpr.ts), saved with the draft; never SSNs.
 */
type DraftWorker = Omit<CertifiedPayrollWorker, "rows"> & {
  uid?: string;
  rows: DraftRow[];
  ca?: EcprWorkerInput;
  ny?: NyWorkerInput;
  wa?: WaWorkerInput;
};
type Draft = Omit<CertifiedPayrollInput, "workers"> & {
  workers: DraftWorker[];
  ca?: EcprDraftJob;
  ny?: NyDraftJob;
  wa?: WaDraftJob;
};

let uidCounter = 0;
const uid = () => `u${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

const zeros = () => [0, 0, 0, 0, 0, 0, 0];

export function blankRow(): DraftRow {
  return {
    uid: uid(),
    classification: "",
    status: "J",
    apprenticeLevel: "",
    st: zeros(),
    ot: zeros(),
    stRateCents: 0,
    otRateCents: 0,
    cashInLieuHourlyCents: 0,
    grossProjectCents: null,
    requiredBasicCents: null,
    requiredFringeCents: null,
  };
}

export function blankWorker(): DraftWorker {
  return {
    uid: uid(),
    lastName: "",
    firstName: "",
    middleInitial: "",
    idNo: "",
    rows: [blankRow()],
    grossAllWorkCents: null,
    taxCents: 0,
    ficaCents: 0,
    otherCents: 0,
    otherNote: "",
    fringeCreditsCents: [],
  };
}

/** The Saturday on or before today, the common workweek end. */
export function lastSaturday(today = new Date()): string {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 1) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Next week's payroll from this one: payroll number + 1 (when it is a number), week ending + 7 days,
 * the same crew, classifications, rates and plans, with hours, deductions, typed grosses, remarks and
 * the final-payroll box cleared.
 */
export function nextWeek(d: Draft): Draft {
  const n = /^\d+$/.test(d.payrollNo ?? "") ? String(Number(d.payrollNo) + 1) : (d.payrollNo ?? "");
  const end = weekDays(d.weekEnding ?? "")[6];
  let weekEnding = d.weekEnding ?? "";
  if (end) {
    const t = new Date(`${end.iso}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + 7);
    weekEnding = t.toISOString().slice(0, 10);
  }
  return {
    ...d,
    payrollNo: n,
    weekEnding,
    final: false,
    remarks: "",
    workers: d.workers.map((w) => ({
      ...w,
      grossAllWorkCents: null,
      taxCents: 0,
      ficaCents: 0,
      otherCents: 0,
      otherNote: "",
      rows: w.rows.map((r) => ({ ...r, st: zeros(), ot: zeros(), grossProjectCents: null })),
      ...(w.ca ? { ca: ecprNextWeek(w.ca) } : {}),
      ...(w.ny ? { ny: nyNextWeek(w.ny) } : {}),
      ...(w.wa ? { wa: waNextWeek(w.wa) } : {}),
    })),
    ...(d.ca ? { ca: { ...d.ca, nonPerformance: false } } : {}),
    ...(d.wa ? { wa: { ...d.wa, noWork: false } } : {}),
  };
}

function storageKey(orgId: string, projectId: string) {
  return `payapps:certified-payroll:${orgId}:${projectId}`;
}
function loadDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function saveDraft(key: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d));
    else localStorage.removeItem(key);
  } catch {
    // Private windows and blocked storage: the form still works, it just is not remembered.
  }
}

/** A dollar amount that may be left blank (null). */
function OptionalMoney(props: {
  value: number | null;
  onChange: (c: number | null) => void;
  label: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(props.value === null ? "" : centsToDecimal(props.value));
  useEffect(() => {
    setText((t) => {
      const parsed = t.trim() === "" ? null : parseDollarsToCents(t);
      if (parsed === props.value) return t;
      return props.value === null ? "" : centsToDecimal(props.value);
    });
  }, [props.value]);
  const parsed = text.trim() === "" ? null : parseDollarsToCents(text);
  const bad = text.trim() !== "" && (parsed === null || parsed < 0);
  return (
    <input
      aria-label={props.label}
      inputMode="decimal"
      placeholder={props.placeholder}
      className={`input text-right ${bad ? "border-red-500" : ""}`}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = e.target.value.trim() === "" ? null : parseDollarsToCents(e.target.value);
        if (e.target.value.trim() === "" || (v !== null && v >= 0)) props.onChange(v);
      }}
    />
  );
}

function Field(props: { label: string; children: React.ReactNode; className?: string }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is `children`, inside the label
    <label className={`grid gap-1 text-sm ${props.className ?? ""}`}>
      <span className="text-slate-600">{props.label}</span>
      {props.children}
    </label>
  );
}

export function CertifiedPayrollPage() {
  const { orgId, projectId } = useParams({
    from: "/orgs/$orgId/projects/$projectId/certified-payroll",
  });
  const q = useQuery({
    queryKey: ["project", orgId, projectId],
    queryFn: () => api<ProjectDetailDto>(projectPath(orgId, projectId)),
  });
  const me = useQuery(meQuery);
  const orgName = me.data?.memberships.find((m) => m.orgId === orgId)?.orgName ?? "";
  const key = storageKey(orgId, projectId);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** Full SSNs and ITINs for the California file: this page's memory only, never saved. */
  const [ecprIds, setEcprIds] = useState<Record<string, EcprId>>({});
  /** Dates of birth for the New York file: this page's memory only, never saved. */
  const [nyIds, setNyIds] = useState<Record<string, NyId>>({});
  /** Full SSNs for the Washington file: this page's memory only, never saved. */
  const [waIds, setWaIds] = useState<Record<string, WaId>>({});

  useEffect(() => {
    if (draft || !q.data) return;
    const saved = loadDraft(key);
    setDraft(
      saved ?? {
        final: false,
        role: "sub",
        projectName: q.data.name,
        projectNumber: q.data.number ?? "",
        payrollNo: "1",
        businessName: orgName,
        businessAddress: "",
        projectLocation: q.data.location ?? "",
        wageDeterminations: "",
        weekEnding: lastSaturday(),
        workers: [blankWorker()],
        apprenticeships: [],
        fringePlans: [],
        fringeBox: null,
        remarks: "",
        certifierName: "",
        certifierTitle: "",
        certifierPhone: "",
        certifierEmail: "",
      },
    );
  }, [q.data, draft, key, orgName]);

  useEffect(() => {
    if (draft) saveDraft(key, draft);
  }, [draft, key]);

  const parsed = useMemo(() => (draft ? certifiedPayrollSchema.safeParse(draft) : null), [draft]);
  const computed = useMemo(
    () => (parsed?.success ? computeCertifiedPayroll(parsed.data) : null),
    [parsed],
  );

  const print = useMutation({
    mutationFn: () => {
      if (!parsed?.success) throw new Error("Fill in the fields marked below first");
      return downloadPost(
        projectPath(orgId, projectId, "/certified-payroll.pdf"),
        parsed.data,
        "certified-payroll.pdf",
      );
    },
  });

  if (q.error) return <ErrorText error={q.error} />;
  if (!q.data || !draft) return <p className="text-sm text-slate-500">Loading…</p>;
  const p = q.data;
  const days = weekDays(draft.weekEnding ?? "");
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const setWorker = (wi: number, patch: Partial<DraftWorker>) =>
    set({ workers: draft.workers.map((w, i) => (i === wi ? { ...w, ...patch } : w)) });
  const setRow = (wi: number, ri: number, patch: Partial<DraftRow>) => {
    const w = draft.workers[wi];
    if (!w) return;
    setWorker(wi, { rows: w.rows.map((r, i) => (i === ri ? { ...r, ...patch } : r)) });
  };
  const plans = draft.fringePlans ?? [];
  const apprenticeships = draft.apprenticeships ?? [];
  const schemaIssues = parsed && !parsed.success ? parsed.error.issues : [];
  /** Column 7A as computed (hours x rates + cash in lieu), shown in the blank field. */
  const autoGross = (wi: number, ri: number) => {
    const flat = draft.workers.slice(0, wi).reduce((n, w) => n + w.rows.length, 0) + ri;
    const r = computed?.rows[flat];
    return r ? formatCents(r.grossProjectCents) : "auto";
  };

  return (
    <div className="grid gap-4">
      <div>
        <Link
          to="/orgs/$orgId/projects/$projectId"
          params={{ orgId, projectId }}
          className="text-sm text-slate-600 underline"
        >
          ← {p.name}
        </Link>
        <h1 className="text-2xl font-semibold">Certified payroll (Davis-Bacon, WH-347)</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          The weekly payroll a contractor or subcontractor on a Federal or federally assisted job
          sends with a signed statement of compliance, printed in the columns of the Department of
          Labor's optional Form WH-347 (Rev. January 2025). Hours, fringe credit, cash in lieu,
          deduction totals and net pay are worked out for you. Nothing here is saved on our servers:
          the draft stays in this browser so next week can start from this week's crew.
        </p>
      </div>

      <section className="card grid gap-3 md:grid-cols-4">
        <Field label="Project name" className="md:col-span-2">
          <input
            className="input"
            value={draft.projectName}
            onChange={(e) => set({ projectName: e.target.value })}
          />
        </Field>
        <Field label="Project or contract no.">
          <input
            className="input"
            value={draft.projectNumber ?? ""}
            onChange={(e) => set({ projectNumber: e.target.value })}
          />
        </Field>
        <Field label="Certified payroll no.">
          <input
            className="input"
            value={draft.payrollNo}
            onChange={(e) => set({ payrollNo: e.target.value })}
          />
        </Field>
        <Field label="Project location (address, or county and state)" className="md:col-span-2">
          <input
            className="input"
            value={draft.projectLocation}
            onChange={(e) => set({ projectLocation: e.target.value })}
          />
        </Field>
        <Field label="Wage determination no(s). and revision">
          <input
            className="input"
            placeholder="e.g. CO20250012 Mod 3"
            value={draft.wageDeterminations}
            onChange={(e) => set({ wageDeterminations: e.target.value })}
          />
        </Field>
        <Field label="Week ending">
          <input
            type="date"
            className="input"
            value={draft.weekEnding}
            onChange={(e) => set({ weekEnding: e.target.value })}
          />
        </Field>
        <Field label="Business legal name" className="md:col-span-2">
          <input
            className="input"
            value={draft.businessName}
            onChange={(e) => set({ businessName: e.target.value })}
          />
        </Field>
        <Field label="Business address" className="md:col-span-2">
          <input
            className="input"
            value={draft.businessAddress}
            onChange={(e) => set({ businessAddress: e.target.value })}
          />
        </Field>
        <fieldset className="flex flex-wrap gap-4 text-sm md:col-span-4">
          <label>
            <input
              type="radio"
              checked={draft.role === "sub"}
              onChange={() => set({ role: "sub" })}
            />{" "}
            Subcontractor
          </label>
          <label>
            <input
              type="radio"
              checked={draft.role === "prime"}
              onChange={() => set({ role: "prime" })}
            />{" "}
            Prime contractor
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.final ?? false}
              onChange={(e) => set({ final: e.target.checked })}
            />{" "}
            Final certified payroll for this job (last week of work)
          </label>
        </fieldset>
      </section>

      <section className="card grid gap-3">
        <h2 className="font-semibold">Workers</h2>
        <p className="text-sm text-slate-600">
          One row per classification worked: a worker who did two kinds of work this week gets a
          second row with the hours in each. ID no.: the last four digits of the SSN or another
          number of your own, never the full SSN. Gross for this project left blank is hours times
          rates plus cash in lieu; gross for all work left blank is the same as this project.
        </p>
        <TimesheetFill
          orgId={orgId}
          projectId={projectId}
          weekEnding={draft.weekEnding ?? ""}
          workers={draft.workers}
          make={{ worker: blankWorker, row: blankRow }}
          onFill={(workers) => set({ workers })}
        />
        <TimesheetImport
          weekEnding={draft.weekEnding ?? ""}
          projectName={p.name}
          workers={draft.workers}
          make={{ worker: blankWorker, row: blankRow }}
          onFill={(workers) => set({ workers })}
        />
        {draft.workers.map((w, wi) => {
          const cw = computed?.workers[wi];
          return (
            <div key={w.uid ?? wi} className="grid gap-2 rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <span className="font-semibold">{wi + 1}.</span>
                <Field label="Last name">
                  <input
                    className="input"
                    value={w.lastName}
                    onChange={(e) => setWorker(wi, { lastName: e.target.value })}
                  />
                </Field>
                <Field label="First name">
                  <input
                    className="input"
                    value={w.firstName}
                    onChange={(e) => setWorker(wi, { firstName: e.target.value })}
                  />
                </Field>
                <Field label="MI">
                  <input
                    className="input w-12"
                    maxLength={2}
                    value={w.middleInitial}
                    onChange={(e) => setWorker(wi, { middleInitial: e.target.value })}
                  />
                </Field>
                <Field label="ID no.">
                  <input
                    className="input w-24"
                    value={w.idNo}
                    onChange={(e) => setWorker(wi, { idNo: e.target.value })}
                  />
                </Field>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => set({ workers: draft.workers.filter((_, i) => i !== wi) })}
                >
                  Remove worker
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="th">Classification</th>
                      <th className="th">J / RA</th>
                      <th className="th" />
                      {days.map((d) => (
                        <th key={d.iso} className="th text-center">
                          {d.letter}
                          <br />
                          <span className="font-normal">{d.label}</span>
                        </th>
                      ))}
                      <th className="th">Rate paid</th>
                      <th className="th">Cash in lieu /h</th>
                      <th className="th">Gross this project</th>
                      <th className="th">WD basic / fringe (optional)</th>
                      <th className="th" />
                    </tr>
                  </thead>
                  <tbody>
                    {w.rows.map((r, ri) =>
                      (["st", "ot"] as const).map((kind) => (
                        <tr
                          key={`${r.uid ?? ri}-${kind}`}
                          className={kind === "ot" ? "border-b" : ""}
                        >
                          {kind === "st" ? (
                            <>
                              <td className="td" rowSpan={2}>
                                <input
                                  className="input"
                                  aria-label={`Worker ${wi + 1} classification ${ri + 1}`}
                                  value={r.classification}
                                  onChange={(e) =>
                                    setRow(wi, ri, { classification: e.target.value })
                                  }
                                />
                              </td>
                              <td className="td" rowSpan={2}>
                                <select
                                  className="input"
                                  aria-label={`Worker ${wi + 1} journeyworker or apprentice`}
                                  value={r.status}
                                  onChange={(e) =>
                                    setRow(wi, ri, { status: e.target.value as "J" | "RA" })
                                  }
                                >
                                  <option value="J">J</option>
                                  <option value="RA">RA</option>
                                </select>
                                {r.status === "RA" && (
                                  <input
                                    className="input mt-1 w-24"
                                    placeholder="Level"
                                    aria-label={`Worker ${wi + 1} apprentice level`}
                                    value={r.apprenticeLevel ?? ""}
                                    onChange={(e) =>
                                      setRow(wi, ri, { apprenticeLevel: e.target.value })
                                    }
                                  />
                                )}
                              </td>
                            </>
                          ) : null}
                          <td className="td text-xs font-semibold">{kind.toUpperCase()}</td>
                          {r[kind].map((h, d) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: plain controlled inputs or a fixed list; the position is the identity
                            <td key={d} className="td px-0.5">
                              <HoursCell
                                label={`Worker ${wi + 1} ${kind.toUpperCase()} hours day ${d + 1}`}
                                value={h}
                                onChange={(v) =>
                                  setRow(wi, ri, {
                                    [kind]: r[kind].map((x, i) => (i === d ? v : x)),
                                  })
                                }
                              />
                            </td>
                          ))}
                          <td className="td w-24">
                            <MoneyInput
                              label={`Worker ${wi + 1} ${kind.toUpperCase()} rate`}
                              value={kind === "st" ? r.stRateCents : r.otRateCents}
                              min={0}
                              onChange={(c) =>
                                setRow(
                                  wi,
                                  ri,
                                  kind === "st" ? { stRateCents: c } : { otRateCents: c },
                                )
                              }
                            />
                          </td>
                          {kind === "st" ? (
                            <>
                              <td className="td w-24" rowSpan={2}>
                                <MoneyInput
                                  label={`Worker ${wi + 1} cash in lieu per hour`}
                                  value={r.cashInLieuHourlyCents ?? 0}
                                  min={0}
                                  onChange={(c) => setRow(wi, ri, { cashInLieuHourlyCents: c })}
                                />
                              </td>
                              <td className="td w-28" rowSpan={2}>
                                <OptionalMoney
                                  label={`Worker ${wi + 1} gross this project`}
                                  placeholder={autoGross(wi, ri)}
                                  value={r.grossProjectCents ?? null}
                                  onChange={(c) => setRow(wi, ri, { grossProjectCents: c })}
                                />
                              </td>
                              <td className="td w-24">
                                <OptionalMoney
                                  label={`Worker ${wi + 1} wage determination basic rate`}
                                  placeholder="basic"
                                  value={r.requiredBasicCents ?? null}
                                  onChange={(c) => setRow(wi, ri, { requiredBasicCents: c })}
                                />
                              </td>
                              <td className="td" rowSpan={2}>
                                {w.rows.length > 1 && (
                                  <button
                                    type="button"
                                    className="link text-xs"
                                    onClick={() =>
                                      setWorker(wi, { rows: w.rows.filter((_, i) => i !== ri) })
                                    }
                                  >
                                    Remove row
                                  </button>
                                )}
                              </td>
                            </>
                          ) : (
                            <td className="td w-24">
                              <OptionalMoney
                                label={`Worker ${wi + 1} wage determination fringe`}
                                placeholder="fringe"
                                value={r.requiredFringeCents ?? null}
                                onChange={(c) => setRow(wi, ri, { requiredFringeCents: c })}
                              />
                            </td>
                          )}
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
              {w.rows.length < 6 && (
                <button
                  type="button"
                  className="link w-fit text-sm"
                  onClick={() => setWorker(wi, { rows: [...w.rows, blankRow()] })}
                >
                  + Another classification for this worker
                </button>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Gross for all work (7B)">
                  <OptionalMoney
                    label={`Worker ${wi + 1} gross all work`}
                    placeholder={cw ? formatCents(cw.grossProjectCents) : "same"}
                    value={w.grossAllWorkCents}
                    onChange={(c) => setWorker(wi, { grossAllWorkCents: c })}
                  />
                </Field>
                <Field label="Tax withholdings">
                  <MoneyInput
                    label={`Worker ${wi + 1} tax`}
                    value={w.taxCents}
                    min={0}
                    onChange={(c) => setWorker(wi, { taxCents: c })}
                  />
                </Field>
                <Field label="FICA">
                  <MoneyInput
                    label={`Worker ${wi + 1} FICA`}
                    value={w.ficaCents}
                    min={0}
                    onChange={(c) => setWorker(wi, { ficaCents: c })}
                  />
                </Field>
                <Field label="Other deductions">
                  <MoneyInput
                    label={`Worker ${wi + 1} other deductions`}
                    value={w.otherCents}
                    min={0}
                    onChange={(c) => setWorker(wi, { otherCents: c })}
                  />
                </Field>
                {w.otherCents > 0 && (
                  <Field label="What the other deduction is">
                    <input
                      className="input"
                      value={w.otherNote}
                      onChange={(e) => setWorker(wi, { otherNote: e.target.value })}
                    />
                  </Field>
                )}
                {plans.map((pl, k) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: plain controlled inputs or a fixed list; the position is the identity
                  <Field key={k} label={`Credit /h: ${pl.name || `plan ${k + 1}`}`}>
                    <MoneyInput
                      label={`Worker ${wi + 1} fringe credit ${pl.name}`}
                      value={w.fringeCreditsCents[k] ?? 0}
                      min={0}
                      onChange={(c) => {
                        const next = plans.map((_, i) => w.fringeCreditsCents[i] ?? 0);
                        next[k] = c;
                        setWorker(wi, { fringeCreditsCents: next });
                      }}
                    />
                  </Field>
                ))}
                {cw && (
                  <p className="text-sm">
                    Net pay <strong>{formatCents(cw.netCents)}</strong>
                    {cw.hourlyFringeCreditCents > 0 &&
                      ` · fringe credit ${formatCents(cw.hourlyFringeCreditCents)}/h`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="btn-secondary w-fit"
          onClick={() => set({ workers: [...draft.workers, blankWorker()] })}
        >
          + Add worker
        </button>
      </section>

      <section className="card grid gap-3">
        <h2 className="font-semibold">Apprenticeship programs (statement box 4)</h2>
        {apprenticeships.map((a, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: plain controlled inputs or a fixed list; the position is the identity
          <div key={k} className="flex flex-wrap items-end gap-2">
            <Field label="Program name">
              <input
                className="input"
                value={a.program}
                onChange={(e) =>
                  set({
                    apprenticeships: apprenticeships.map((x, i) =>
                      i === k ? { ...x, program: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Registered with">
              <select
                className="input"
                value={a.registeredWith}
                onChange={(e) =>
                  set({
                    apprenticeships: apprenticeships.map((x, i) =>
                      i === k ? { ...x, registeredWith: e.target.value as "OA" | "SAA" } : x,
                    ),
                  })
                }
              >
                <option value="OA">OA (DOL Office of Apprenticeship)</option>
                <option value="SAA">SAA (State Apprenticeship Agency)</option>
              </select>
            </Field>
            <Field label="Labor classification">
              <input
                className="input"
                value={a.classification ?? ""}
                onChange={(e) =>
                  set({
                    apprenticeships: apprenticeships.map((x, i) =>
                      i === k ? { ...x, classification: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <button
              type="button"
              className="link text-sm"
              onClick={() => set({ apprenticeships: apprenticeships.filter((_, i) => i !== k) })}
            >
              Remove
            </button>
          </div>
        ))}
        {apprenticeships.length < MAX_APPRENTICESHIP_PROGRAMS && (
          <button
            type="button"
            className="link w-fit text-sm"
            onClick={() =>
              set({
                apprenticeships: [
                  ...apprenticeships,
                  { program: "", registeredWith: "OA", classification: "" },
                ],
              })
            }
          >
            + Add a program
          </button>
        )}
      </section>

      <section className="card grid gap-3">
        <h2 className="font-semibold">Fringe benefit plans (statement box 5)</h2>
        <p className="text-sm text-slate-600">
          List each bona fide plan you take an hourly credit for; each worker's credit per plan is
          entered on the worker above and column 6B is that credit times the hours. Cash paid in
          lieu of fringe goes in the worker's "cash in lieu" instead. An unfunded plan needs the
          Department of Labor's approval first (29 CFR 5.28).
        </p>
        {plans.map((pl, k) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: plain controlled inputs or a fixed list; the position is the identity
          <div key={k} className="flex flex-wrap items-end gap-2">
            <Field label="Plan name">
              <input
                className="input"
                value={pl.name}
                onChange={(e) =>
                  set({
                    fringePlans: plans.map((x, i) =>
                      i === k ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Type (health, pension…)">
              <input
                className="input"
                value={pl.type ?? ""}
                onChange={(e) =>
                  set({
                    fringePlans: plans.map((x, i) =>
                      i === k ? { ...x, type: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Plan no.">
              <input
                className="input"
                value={pl.planNo ?? ""}
                onChange={(e) =>
                  set({
                    fringePlans: plans.map((x, i) =>
                      i === k ? { ...x, planNo: e.target.value } : x,
                    ),
                  })
                }
              />
            </Field>
            <label className="text-sm">
              <input
                type="checkbox"
                checked={pl.funded ?? true}
                onChange={(e) =>
                  set({
                    fringePlans: plans.map((x, i) =>
                      i === k ? { ...x, funded: e.target.checked } : x,
                    ),
                  })
                }
              />{" "}
              Funded
            </label>
            <button
              type="button"
              className="link text-sm"
              onClick={() =>
                set({
                  fringePlans: plans.filter((_, i) => i !== k),
                  workers: draft.workers.map((w) => ({
                    ...w,
                    fringeCreditsCents: w.fringeCreditsCents.filter((_, i) => i !== k),
                  })),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        {plans.length < MAX_FRINGE_PLANS && (
          <button
            type="button"
            className="link w-fit text-sm"
            onClick={() =>
              set({ fringePlans: [...plans, { name: "", type: "", planNo: "", funded: true }] })
            }
          >
            + Add a plan
          </button>
        )}
      </section>

      <section className="card grid gap-3 md:grid-cols-4">
        <h2 className="font-semibold md:col-span-4">Statement of compliance</h2>
        <Field label="Certifying official's name">
          <input
            className="input"
            value={draft.certifierName ?? ""}
            onChange={(e) => set({ certifierName: e.target.value })}
          />
        </Field>
        <Field label="Title">
          <input
            className="input"
            value={draft.certifierTitle ?? ""}
            onChange={(e) => set({ certifierTitle: e.target.value })}
          />
        </Field>
        <Field label="Telephone">
          <input
            className="input"
            value={draft.certifierPhone ?? ""}
            onChange={(e) => set({ certifierPhone: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            value={draft.certifierEmail ?? ""}
            onChange={(e) => set({ certifierEmail: e.target.value })}
          />
        </Field>
        <Field label="Additional remarks" className="md:col-span-4">
          <textarea
            className="input"
            rows={2}
            value={draft.remarks ?? ""}
            onChange={(e) => set({ remarks: e.target.value })}
          />
        </Field>
        <p className="text-xs text-slate-500 md:col-span-4">
          The PDF leaves the signature and date blank: the official who paid or supervised the
          payment signs it (DOL does not accept a photocopied or scanned signature).
        </p>
      </section>

      <CaEcprSection
        job={draft.ca}
        onJob={(ca) => set({ ca })}
        workers={draft.workers}
        onWorker={(wi, ca) => setWorker(wi, { ca })}
        plans={plans}
        days={days}
        payroll={parsed?.success ? parsed.data : null}
        ids={ecprIds}
        onId={(k, id) => setEcprIds((m) => ({ ...m, [k]: id }))}
      />

      <NyCprSection
        job={draft.ny}
        onJob={(ny) => set({ ny })}
        workers={draft.workers}
        onWorker={(wi, ny) => setWorker(wi, { ny })}
        plans={plans}
        payroll={parsed?.success ? parsed.data : null}
        ids={nyIds}
        onId={(k, id) => setNyIds((m) => ({ ...m, [k]: id }))}
      />

      <WaCprSection
        job={draft.wa}
        onJob={(wa) => set({ wa })}
        workers={draft.workers}
        onWorker={(wi, wa) => setWorker(wi, { wa })}
        plans={plans}
        payroll={parsed?.success ? parsed.data : null}
        ids={waIds}
        onId={(k, id) => setWaIds((m) => ({ ...m, [k]: id }))}
      />

      <section className="card grid gap-2">
        {computed && (
          <p className="text-sm">
            {computed.workers.length} worker(s), {formatHours(computed.totals.hours)} hours, gross
            this project {formatCents(computed.totals.grossProjectCents)}, net pay{" "}
            {formatCents(computed.totals.netCents)}.
          </p>
        )}
        {schemaIssues.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-red-700">
            {schemaIssues.slice(0, 8).map((i, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: plain controlled inputs or a fixed list; the position is the identity
              <li key={k}>{i.message}</li>
            ))}
          </ul>
        )}
        {computed && computed.issues.length > 0 && (
          <ul className="list-disc pl-5 text-sm">
            {computed.issues.map((i, k) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: plain controlled inputs or a fixed list; the position is the identity
              <li key={k} className={i.level === "error" ? "text-red-700" : "text-amber-800"}>
                <strong>{i.where}:</strong> {i.message}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={!computed || hasErrors(computed) || print.isPending}
            onClick={() => print.mutate()}
          >
            {print.isPending ? "Preparing…" : "Download PDF"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setDraft(nextWeek(draft))}>
            Start next week
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              if (window.confirm("Clear this payroll and the crew saved in this browser?")) {
                saveDraft(key, null);
                setEcprIds({});
                setNyIds({});
                setWaIds({});
                setDraft(null);
              }
            }}
          >
            Clear
          </button>
        </div>
        <ErrorText error={print.error} />
        <p className="text-xs text-slate-500">{CERTIFIED_PAYROLL_NOTICE}</p>
      </section>
    </div>
  );
}
