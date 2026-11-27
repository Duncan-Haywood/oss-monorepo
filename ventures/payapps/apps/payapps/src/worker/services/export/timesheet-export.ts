// A week of crew timesheets as CSV: the payroll summary (one row per worker: straight time, overtime,
// rate and gross, for the payroll service) and the time detail (one row per worker, day and job, in
// the columns the certified payroll page's timesheet import reads, so a prevailing-wage job's week
// fills the WH-347 without retyping). Text cells a spreadsheet would run are neutralised (csvCell).
import type { TimesheetWeekDto } from "@shared/api/types";
import { centsToDecimal } from "@shared/money";
import { rowOvertimeByDay } from "@shared/timesheet-certified";
import { formatHours } from "@shared/timesheets";
import { csvCell } from "./csv";

const row = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");
const money = (c: number | null) => (c === null ? null : Number(centsToDecimal(c)));
const hrs = (h: number) => Number(formatHours(h));

export function timesheetPayrollCsv(w: TimesheetWeekDto): string {
  const jobName = (id: string) => w.jobs.find((j) => j.id === id)?.name ?? "";
  const out = [
    row([`Crew timesheets, week ending ${w.weekEnding}`]),
    row([
      "Employee",
      "Trade",
      "Regular hours",
      "Overtime hours",
      "Total hours",
      "Rate",
      "Regular pay",
      "Overtime pay",
      "Gross pay",
      "Jobs",
    ]),
    ...w.workers.map((x) =>
      row([
        x.name,
        x.trade,
        hrs(x.regular),
        hrs(x.overtime),
        hrs(x.total),
        money(x.rateCents),
        money(x.regularPayCents),
        money(x.overtimePayCents),
        money(x.grossCents),
        x.projectIds.map(jobName).join("; "),
      ]),
    ),
    row([
      "Total",
      null,
      hrs(w.totals.regular),
      hrs(w.totals.overtime),
      hrs(w.totals.hours),
      null,
      null,
      null,
      money(w.totals.grossCents),
      null,
    ]),
    row([w.note]),
  ];
  return `${out.join("\r\n")}\r\n`;
}

/**
 * One row per worker, day and job. Straight time and overtime come from the week's overtime split,
 * spread over the row's days in order (overtime on the latest hours), so each day's two columns add
 * up to the hours worked that day.
 */
export function timesheetDetailCsv(w: TimesheetWeekDto): string {
  const job = (id: string) => w.jobs.find((j) => j.id === id);
  const lines: string[] = [
    row([
      "Work date",
      "Employee",
      "Classification",
      "Job",
      "Job number",
      "Item",
      "Regular hours",
      "Overtime hours",
    ]),
  ];
  for (const r of w.rows) {
    const worker = w.workers.find((x) => x.workerId === r.workerId);
    const j = job(r.projectId);
    const item = j?.lines.find((l) => l.id === r.sovLineId)?.itemNumber ?? null;
    // Overtime takes the row's latest hours, as the certified payroll fill spreads it.
    const otByDay = rowOvertimeByDay(r.hours, r.overtime);
    r.hours.forEach((h, d) => {
      if (h <= 0) return;
      const o = otByDay[d] ?? 0;
      lines.push(
        row([
          w.days[d] ?? null,
          worker?.name ?? "",
          worker?.trade ?? null,
          j?.name ?? "",
          j?.number ?? null,
          item,
          hrs(h - o),
          hrs(o),
        ]),
      );
    });
  }
  return `${lines.join("\r\n")}\r\n`;
}

export const timesheetFileName = (w: TimesheetWeekDto, kind: "payroll" | "time") =>
  `timesheets-${kind}-we-${w.weekEnding}.csv`;
