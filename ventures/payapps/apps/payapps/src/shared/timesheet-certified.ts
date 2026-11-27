// Crew timesheets into the certified payroll page (crew timesheets, part 2): one job's hours for the
// seven days ending on the payroll's week-ending date, read from the company's own timesheet weeks
// (TimesheetWeekDto, already split into straight time and overtime on the company's workweek), in the
// same TimesheetEntry shape the time-report import produces, so `fillFromTimesheet` puts them on the
// form the same way. No CSV round-trip: before this, the week went out as time.csv and back in.
//
// Overtime is the timesheet's FLSA weekly overtime (hours past 40 in the company's workweek, across
// every job), spread on each row's latest days, as the time detail CSV spreads it. When the payroll
// week and the workweek do not line up, the two workweeks it straddles are both read; each day keeps
// the overtime its own workweek gave it.
import type { TimesheetWeekDto } from "./api/types";
import { splitName, type TimesheetEntry, workerKey } from "./certified-payroll-import";
import { addDays } from "./timesheets";

/**
 * A row's overtime spread over its days: the latest hours first, walking back from the last day, so
 * each day's straight time plus overtime is the hours worked that day.
 */
export function rowOvertimeByDay(hours: readonly number[], overtime: number): number[] {
  let left = overtime;
  const out = hours.map(() => 0);
  for (let d = hours.length - 1; d >= 0 && left > 0; d--) {
    const take = Math.min(left, hours[d] ?? 0);
    out[d] = take;
    left -= take;
  }
  return out;
}

/** The seven dates (oldest first) of the payroll week ending on `weekEnding`. */
export const payrollDays = (weekEnding: string): string[] =>
  Array.from({ length: 7 }, (_, i) => addDays(weekEnding, i - 6));

export interface TimesheetCertifiedHours {
  weekEnding: string;
  /** The workweeks read (their week-ending dates); two when the payroll week straddles them. */
  workweeksRead: string[];
  /** True when the payroll week is exactly one of the company's workweeks. */
  aligned: boolean;
  entries: TimesheetEntry[];
  /** Hours these same workers have on other jobs in the payroll week (for "gross for all work"). */
  otherJobs: { name: string; hundredths: number }[];
  /** Workers with hours on this job and no trade: their classification is left to type. */
  noTrade: string[];
}

export function timesheetCertifiedHours(
  weeks: readonly TimesheetWeekDto[],
  projectId: string,
  weekEnding: string,
): TimesheetCertifiedHours {
  const days = payrollDays(weekEnding);
  const index = new Map(days.map((d, i) => [d, i]));
  const byKey = new Map<string, TimesheetEntry>();
  const elsewhere = new Map<string, number>();
  const onJob = new Set<string>();
  const noTrade = new Set<string>();
  for (const w of weeks) {
    for (const r of w.rows) {
      const worker = w.workers.find((x) => x.workerId === r.workerId);
      if (!worker) continue;
      const ot = rowOvertimeByDay(r.hours, r.overtime);
      r.hours.forEach((h, d) => {
        const at = index.get(w.days[d] ?? "");
        if (h <= 0 || at === undefined) return;
        if (r.projectId !== projectId) {
          elsewhere.set(worker.workerId, (elsewhere.get(worker.workerId) ?? 0) + h);
          return;
        }
        onJob.add(worker.workerId);
        const name = splitName(worker.name);
        const classification = (worker.trade ?? "").trim();
        if (!classification) noTrade.add(worker.name);
        const key = `${workerKey(name.lastName, name.firstName)}|${classification.toLowerCase()}`;
        let e = byKey.get(key);
        if (!e) {
          e = {
            ...name,
            classification,
            st: [0, 0, 0, 0, 0, 0, 0],
            ot: [0, 0, 0, 0, 0, 0, 0],
            rows: 0,
          };
          byKey.set(key, e);
        }
        const o = ot[d] ?? 0;
        e.st[at] = (e.st[at] ?? 0) + h - o;
        e.ot[at] = (e.ot[at] ?? 0) + o;
        e.rows++;
      });
    }
  }
  const names = new Map<string, string>();
  for (const w of weeks) for (const x of w.workers) names.set(x.workerId, x.name);
  return {
    weekEnding,
    workweeksRead: weeks.map((w) => w.weekEnding),
    aligned: weeks.length === 1 && weeks[0]?.weekEnding === weekEnding,
    entries: [...byKey.values()].sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.classification.localeCompare(b.classification),
    ),
    otherJobs: [...elsewhere.entries()]
      .filter(([id, h]) => onJob.has(id) && h > 0)
      .map(([id, hundredths]) => ({ name: names.get(id) ?? "", hundredths }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    noTrade: [...noTrade].sort(),
  };
}
