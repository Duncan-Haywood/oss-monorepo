// "Labor from a payroll report" on the job-cost page: a CSV the payroll service exports (pay date,
// employee, job, hours, gross pay, employer taxes and contributions) read in the browser by
// src/shared/payroll-report.ts into one labor cost per pay date and schedule-of-values line, with the
// contractor's own burden percent on top if they type one. The file never leaves the browser: only
// the summed costs are sent, each with a "Payroll <date> ..." reference the Worker skips when the job
// already has it, so the same report imported twice adds nothing.
import type { JobCostDto } from "@shared/api/types";
import { formatCents } from "@shared/money";
import {
  guessPayrollColumns,
  PAYROLL_FIELD_LABELS,
  PAYROLL_FIELDS,
  type PayrollColumns,
  type PayrollField,
  type PayrollReport,
  payrollCosts,
  payrollJobs,
  readPayrollReport,
} from "@shared/payroll-report";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { ErrorText } from "./error";

/** "25" or "25.5" (percent) to basis points; "" to null; undefined when it does not read. */
export function parseBurdenPercent(s: string): number | null | undefined {
  const t = s.trim().replace(/%$/, "").trim();
  if (t === "") return null;
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return undefined;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bps > 20_000 ? undefined : bps;
}

const ALL_ROWS = "\u0000all";
const REQUIRED: readonly PayrollField[] = ["date", "wages"];

export function PayrollImport({
  d,
  base,
  onSaved,
}: {
  d: JobCostDto;
  base: string;
  onSaved: () => Promise<void>;
}) {
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [columns, setColumns] = useState<PayrollColumns | null>(null);
  const [job, setJob] = useState<string>(ALL_ROWS);
  const [burden, setBurden] = useState("");
  const [lineId, setLineId] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const lines = d.report.lines;
  const lineByItem = useMemo(
    () => new Map(lines.map((l) => [l.itemNumber.trim().toLowerCase(), l.sovLineId])),
    [lines],
  );
  const existingRefs = useMemo(
    () => new Set(d.entries.map((e) => e.reference).filter((r): r is string => !!r)),
    [d.entries],
  );

  async function onFile(file: File | undefined) {
    setDone(null);
    setReadError(null);
    setReport(null);
    setColumns(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 20_000_000) {
      setReadError("That file is over 20 MB; export a shorter date range.");
      return;
    }
    const r = readPayrollReport(await file.text());
    if (!r) {
      setReadError(
        "No header row with a date column and a gross pay (or wages) column was found in the first 25 rows. Export the report as CSV with column headers.",
      );
      return;
    }
    const cols = guessPayrollColumns(r.headers);
    setReport(r);
    setColumns(cols);
    // Preselect the job whose name matches this one, if the report names it.
    const jobs = payrollJobs(r, cols);
    const name = d.projectName.trim().toLowerCase();
    const match = jobs.find((j) => j.value.trim().toLowerCase() === name);
    setJob(match ? match.value : ALL_ROWS);
  }

  const burdenBps = parseBurdenPercent(burden);
  const jobs = report && columns ? payrollJobs(report, columns) : [];
  const defaultLine = lines.find((l) => l.sovLineId === lineId) ?? null;
  const result =
    report && columns
      ? payrollCosts(report, {
          columns,
          jobValues: columns.job === null || job === ALL_ROWS ? null : [job],
          burdenBps: burdenBps ?? null,
          lineByItem,
          defaultLine: defaultLine
            ? { sovLineId: defaultLine.sovLineId, itemNumber: defaultLine.itemNumber }
            : null,
        })
      : null;
  const fresh = result ? result.costs.filter((c) => !existingRefs.has(c.reference)) : [];
  const already = result ? result.costs.length - fresh.length : 0;
  const total = fresh.reduce((a, c) => a + c.amountCents, 0);

  const importCosts = useMutation({
    mutationFn: () => {
      if (!result) throw new Error("Choose a payroll report first");
      if (burdenBps === undefined) throw new Error("Enter the burden as a percent, such as 25");
      if (result.errors.length > 0) throw new Error("Fix the rows listed below first");
      if (result.unknownItems.length > 0)
        throw new Error("Some cost codes are not item numbers on this job");
      if (fresh.length === 0) throw new Error("Nothing new to add");
      return api<{ added: number; skipped: number }>(`${base}/entries`, {
        method: "POST",
        body: {
          skipExistingReferences: true,
          entries: fresh.map((c) => ({
            incurredOn: c.incurredOn,
            amountCents: c.amountCents,
            category: "labor",
            sovLineId: c.sovLineId,
            vendor: "Payroll",
            description: c.description,
            reference: c.reference,
          })),
        },
      });
    },
    onSuccess: async (r) => {
      setDone(
        `Added ${r.added} labor cost${r.added === 1 ? "" : "s"}${r.skipped ? `; ${r.skipped} already imported` : ""}.`,
      );
      setReport(null);
      setColumns(null);
      setFileName("");
      await onSaved();
    },
  });

  return (
    <details>
      <summary className="cursor-pointer text-sm underline">Labor from a payroll report</summary>
      <div className="mt-1 space-y-2">
        <p className="text-xs text-slate-500">
          A CSV export of your payroll service's payroll-by-job report (QuickBooks Payroll, Gusto,
          ADP, Paychex and others): one row per employee and pay date, with gross pay and, if it has
          them, employer taxes and contributions. Each pay date becomes one labor cost per line,
          read from a cost code column or put on the line you pick. The file is read in your
          browser; only the totals are saved. Importing the same report again skips the dates
          already in.
        </p>
        <label className="block text-sm">
          Payroll report (.csv){" "}
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            aria-label="Payroll report"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        {readError && (
          <p role="alert" className="text-sm text-red-700">
            {readError}
          </p>
        )}
        {done && (
          <p role="status" className="text-sm text-green-800">
            {done}
          </p>
        )}
        {report && columns && result && (
          <>
            <p className="text-xs text-slate-500">
              {fileName}: header on row {report.headerRow}, {report.rows.length} rows under it.
            </p>
            <div className="flex flex-wrap gap-2">
              {PAYROLL_FIELDS.map((f) => (
                <label key={f} className="text-xs">
                  {PAYROLL_FIELD_LABELS[f]}
                  {REQUIRED.includes(f) ? " *" : ""}
                  <select
                    className="input block"
                    aria-label={`${PAYROLL_FIELD_LABELS[f]} column`}
                    value={columns[f] === null ? "" : String(columns[f])}
                    onChange={(e) =>
                      setColumns({
                        ...columns,
                        [f]: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">(none)</option>
                    {report.headers.map((h, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: headers can repeat; the column index is the identity
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              {columns.job !== null && (
                <label className="text-sm">
                  This job in the report
                  <select
                    className="input block"
                    aria-label="Job in the report"
                    value={job}
                    onChange={(e) => setJob(e.target.value)}
                  >
                    <option value={ALL_ROWS}>Every row (the report is for this job only)</option>
                    {jobs.map((j) => (
                      <option key={j.value} value={j.value}>
                        {j.value || "(blank)"}: {j.rows} rows, {formatCents(j.wagesCents)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="text-sm">
                {columns.item === null ? "Put the labor on" : "Rows with no cost code go on"}
                <select
                  className="input block"
                  aria-label="Line for the labor"
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                >
                  <option value="">No line (job labor)</option>
                  {lines.map((l) => (
                    <option key={l.sovLineId} value={l.sovLineId}>
                      {l.itemNumber} {l.description}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Labor burden, % of wages (optional)
                <input
                  className="input block w-28"
                  aria-label="Labor burden percent"
                  inputMode="decimal"
                  placeholder="e.g. 18"
                  value={burden}
                  onChange={(e) => setBurden(e.target.value)}
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              The burden is your own rate for costs the report does not carry (workers' comp,
              liability insurance, benefits paid outside payroll); leave it blank to count only the
              report's figures.
              {columns.employerTaxes === null &&
                " This report has no employer taxes column, so they are not counted unless your burden includes them."}
            </p>
            {burdenBps === undefined && (
              <p role="alert" className="text-sm text-red-700">
                Enter the burden as a percent, such as 18 or 22.5.
              </p>
            )}
            {(result.errors.length > 0 || result.unknownItems.length > 0) && (
              <ul className="list-disc pl-5 text-sm text-red-700">
                {result.errors.slice(0, 20).map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {result.unknownItems.length > 0 && (
                  <li>
                    Cost codes that are not item numbers on this job:{" "}
                    {result.unknownItems.slice(0, 20).join(", ")}. Change them in the report, or
                    pick (none) for the cost code column and put the labor on one line.
                  </li>
                )}
              </ul>
            )}
            <p className="text-xs text-slate-500">
              {result.costs.length} labor cost{result.costs.length === 1 ? "" : "s"} read
              {already > 0 ? `, ${already} already imported` : ""}
              {result.otherJobRows > 0
                ? `; ${result.otherJobRows} rows of other jobs left out`
                : ""}
              {result.skippedRows > 0
                ? `; ${result.skippedRows} subtotal, total or zero rows skipped`
                : ""}
              .
            </p>
            {result.costs.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Line</th>
                    <th className="th">Hours</th>
                    <th className="th text-right">Wages</th>
                    <th className="th text-right">Employer taxes</th>
                    <th className="th text-right">Contributions</th>
                    <th className="th text-right">Burden</th>
                    <th className="th text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {result.costs.map((c) => (
                    <tr
                      key={c.reference}
                      className={existingRefs.has(c.reference) ? "text-slate-400" : undefined}
                    >
                      <td className="td">
                        {c.incurredOn}
                        {existingRefs.has(c.reference) && (
                          <span className="block text-xs">already imported</span>
                        )}
                      </td>
                      <td className="td">{c.itemNumber ?? "—"}</td>
                      <td className="td tabular-nums">
                        {c.hoursHundredths === null ? "—" : (c.hoursHundredths / 100).toFixed(2)}
                      </td>
                      <td className="td text-right tabular-nums">{formatCents(c.wagesCents)}</td>
                      <td className="td text-right tabular-nums">
                        {formatCents(c.employerTaxesCents)}
                      </td>
                      <td className="td text-right tabular-nums">
                        {formatCents(c.employerBenefitsCents)}
                      </td>
                      <td className="td text-right tabular-nums">{formatCents(c.burdenCents)}</td>
                      <td className="td text-right tabular-nums">{formatCents(c.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="button"
              className="btn"
              disabled={importCosts.isPending || fresh.length === 0}
              onClick={() => importCosts.mutate()}
            >
              Add {fresh.length} labor cost{fresh.length === 1 ? "" : "s"} ({formatCents(total)})
            </button>
            <ErrorText error={importCosts.error} />
          </>
        )}
      </div>
    </details>
  );
}
