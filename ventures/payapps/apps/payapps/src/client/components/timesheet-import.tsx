// "Hours from a time report" on the certified payroll page: a CSV with one row per employee and day
// worked, read in the browser by src/shared/certified-payroll-import.ts into each worker's straight
// time and overtime for the week, then put on the form (matched by name; new names added). The file
// never leaves the browser, and nothing is sent until the payroll is printed, as with the rest of
// the page.

import { formatHours } from "@shared/certified-payroll";
import {
  type FillRow,
  type FillSummary,
  type FillWorker,
  fillFromTimesheet,
  guessTimesheetColumns,
  readTimesheetReport,
  TIMESHEET_FIELD_LABELS,
  TIMESHEET_FIELDS,
  type TimesheetColumns,
  type TimesheetReport,
  timesheetHours,
  timesheetJobs,
} from "@shared/certified-payroll-import";
import { useState } from "react";

const ALL_ROWS = "\u0000all";

export function TimesheetImport<R extends FillRow, W extends FillWorker<R>>(props: {
  weekEnding: string;
  projectName: string;
  workers: readonly W[];
  make: { worker: () => W; row: () => R };
  onFill: (workers: W[], summary: FillSummary) => void;
}) {
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<TimesheetReport | null>(null);
  const [columns, setColumns] = useState<TimesheetColumns | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [job, setJob] = useState(ALL_ROWS);
  const [done, setDone] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    setDone(null);
    setReadError(null);
    setReport(null);
    setColumns(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > 20_000_000) {
      setReadError("That file is over 20 MB; export one week or a shorter date range.");
      return;
    }
    const r = readTimesheetReport(await file.text());
    if (!r) {
      setReadError(
        "No header row with a date, an employee and an hours column was found in the first 25 rows. Export the report as CSV with column headers.",
      );
      return;
    }
    const cols = guessTimesheetColumns(r.headers);
    setReport(r);
    setColumns(cols);
    const name = props.projectName.trim().toLowerCase();
    const match = timesheetJobs(r, cols).find((j) => j.value.trim().toLowerCase() === name);
    setJob(match ? match.value : ALL_ROWS);
  }

  const result =
    report && columns
      ? timesheetHours(report, {
          columns,
          weekEnding: props.weekEnding,
          jobValues: columns.job === null || job === ALL_ROWS ? null : [job],
        })
      : null;
  const jobs = report && columns ? timesheetJobs(report, columns) : [];
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  function fill() {
    if (!result || result.errors.length > 0 || result.entries.length === 0) return;
    const { workers, summary } = fillFromTimesheet(props.workers, result.entries, props.make);
    props.onFill(workers, summary);
    const parts = [
      `${summary.matched} worker${summary.matched === 1 ? "" : "s"} matched`,
      `${summary.added} added`,
    ];
    if (summary.rowsAdded > 0) parts.push(`${summary.rowsAdded} classification rows added`);
    setDone(
      `Hours filled: ${parts.join(", ")}.${summary.added > 0 ? " Type the ID, classification and rates for the workers added." : ""}${
        summary.noHours.length > 0
          ? ` No hours in the report for ${summary.noHours.join(", ")}: their hours are now zero; remove them if they did not work this week.`
          : ""
      }`,
    );
    setReport(null);
    setColumns(null);
    setFileName("");
  }

  return (
    <details>
      <summary className="cursor-pointer text-sm underline">Hours from a time report</summary>
      <div className="mt-1 space-y-2">
        <p className="text-xs text-slate-500">
          A CSV with one row per employee and day worked: QuickBooks time activities, a time-card
          detail export from Gusto, ADP or Paychex, or a payroll-by-job report with a work date.
          Each day's straight time and overtime go on that day for the week ending{" "}
          {props.weekEnding}. Workers are matched by name; anyone new is added for you to fill in. A
          report dated by pay period (pay date, check date, period end) cannot say which day the
          hours were worked, so it is refused rather than guessed. The file is read in this browser
          and not sent anywhere.
        </p>
        <label className="block text-sm">
          Time report (.csv){" "}
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            aria-label="Time report"
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
              {TIMESHEET_FIELDS.map((f) => (
                <label key={f} className="text-xs">
                  {TIMESHEET_FIELD_LABELS[f]}
                  <select
                    className="input block"
                    aria-label={`${TIMESHEET_FIELD_LABELS[f]} column`}
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
            {columns.job !== null && (
              <label className="block text-sm">
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
                      {j.value || "(blank)"}: {j.rows} rows
                    </option>
                  ))}
                </select>
              </label>
            )}
            {result.errors.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-red-700">
                {result.errors.slice(0, 20).map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {result.oneDateOnly && (
              <p role="alert" className="text-sm text-amber-800">
                Every row in this week is on one date. If that is the pay date or the week's end
                rather than the day worked, the hours would all land on one day: use a report with a
                date per day worked.
              </p>
            )}
            <p className="text-xs text-slate-500">
              {result.entries.length} worker
              {result.entries.length === 1 ? "" : "s"} with hours this week
              {result.outsideWeek > 0 ? `; ${result.outsideWeek} rows outside the week` : ""}
              {result.otherJobRows > 0 ? `; ${result.otherJobRows} rows of other jobs` : ""}
              {result.notWorked.rows > 0
                ? `; ${result.notWorked.rows} rows not hours worked (${result.notWorked.types.join(", ")})`
                : ""}
              {result.skippedRows > 0
                ? `; ${result.skippedRows} total, blank or zero rows skipped`
                : ""}
              .
            </p>
            {result.doubleTime.length > 0 && (
              <p role="alert" className="text-sm text-amber-800">
                Double time left out:{" "}
                {result.doubleTime.map((d) => `${d.name} ${d.hundredths / 100} h`).join(", ")}. The
                overtime row has one rate, so enter these hours on a row of their own at the
                double-time rate.
              </p>
            )}
            {result.entries.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Worker</th>
                    <th className="th">Classification</th>
                    <th className="th text-right">Straight time</th>
                    <th className="th text-right">Overtime</th>
                  </tr>
                </thead>
                <tbody>
                  {result.entries.map((e) => (
                    <tr key={`${e.lastName}|${e.firstName}|${e.classification}`}>
                      <td className="td">
                        {e.lastName}, {e.firstName}
                        {e.mi ? ` ${e.mi}` : ""}
                      </td>
                      <td className="td">{e.classification || "—"}</td>
                      <td className="td text-right tabular-nums">{formatHours(total(e.st))}</td>
                      <td className="td text-right tabular-nums">{formatHours(total(e.ot))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="button"
              className="btn"
              disabled={result.errors.length > 0 || result.entries.length === 0}
              onClick={fill}
            >
              Fill the week's hours
            </button>
          </>
        )}
      </div>
    </details>
  );
}
