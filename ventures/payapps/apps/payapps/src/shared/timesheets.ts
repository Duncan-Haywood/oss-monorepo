// Crew timesheets (pure): the company's own workers' hours per day, on a job and a schedule-of-values
// line, one workweek at a time. From those hours: each worker's straight time and overtime for the
// week, the wages they come to at the worker's rate, and those wages split onto the jobs and lines
// the hours were worked on, so a week of timesheets becomes the labor costs on each job's job-cost
// page. Hours are integer hundredths; money integer cents.
//
// Overtime: hours worked past 40 in the workweek, at one and a half times the rate (the federal rule,
// FLSA, 29 U.S.C. 207(a)(1)). The overtime hours fall on the rows worked after the 40th hour, day by
// day in the order the rows are listed, so the job worked late in the week carries them. State daily
// overtime rules (California, Alaska, Nevada, Colorado and others), double time, exempt employees and
// prevailing-wage rates are not applied: the payroll service computes the paycheck. This is the
// hours and labor cost for the jobs, and the hand-off to payroll.

import { formatHours, payFor } from "./certified-payroll";

export const OVERTIME_AFTER_HUNDREDTHS = 4000;
/** Hours one worker can log on one day, across every row. */
export const MAX_DAY_HUNDREDTHS = 2400;
export const MAX_ROWS_PER_WORKER_WEEK = 20;
export const MAX_CREW_MEMBERS = 300;
/** $1,000 an hour: a typo guard, not a judgement. */
export const MAX_RATE_CENTS = 100_000;
/** Burden (payroll taxes, workers' comp, benefits) on wages, up to 200%. */
export const MAX_BURDEN_BPS = 20_000;

export const WEEK_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
/** Monday, until the company picks its workweek. */
export const DEFAULT_WEEK_START_DAY = 1;

export const TIMESHEET_NOTE =
  "Overtime is hours past 40 in the workweek at 1.5 times the rate (federal FLSA rule). State daily overtime, double time, exempt employees and prevailing wages are not applied; your payroll service computes the paychecks.";

const DAY_MS = 86_400_000;

function parseIso(d: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? null : t;
}

export function addDays(date: string, n: number): string {
  const t = parseIso(date);
  if (!t) throw new Error(`Not a date: ${date}`);
  return new Date(t.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** The first day of the workweek that holds `date`, for a week starting on `startDay` (0 Sunday). */
export function weekStartFor(date: string, startDay: number): string {
  const t = parseIso(date);
  if (!t) throw new Error(`Not a date: ${date}`);
  const back = (t.getUTCDay() - startDay + 7) % 7;
  return addDays(date, -back);
}

export const isWeekStart = (date: string, startDay: number) =>
  parseIso(date) !== null && parseIso(date)?.getUTCDay() === startDay;

/** The seven dates of the week starting on `weekStart`. */
export const weekDates = (weekStart: string): string[] =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

export const weekEnding = (weekStart: string) => addDays(weekStart, 6);

export interface CrewWorker {
  id: string;
  name: string;
  trade: string | null;
  /** Straight-time cents per hour; null: not entered (hours only, nothing to cost). */
  rateCents: number | null;
}

/** One timesheet row: a worker's hours on one job and line, seven days from the week's start. */
export interface TimeRow {
  workerId: string;
  projectId: string;
  sovLineId: string | null;
  hours: number[];
}

export interface RowResult extends TimeRow {
  regular: number;
  overtime: number;
  /** Wages for this row: its share of the worker's straight-time and overtime pay; null with no rate. */
  wagesCents: number | null;
}

export interface WorkerWeek {
  workerId: string;
  name: string;
  trade: string | null;
  rateCents: number | null;
  byDay: number[];
  total: number;
  regular: number;
  overtime: number;
  regularPayCents: number | null;
  overtimePayCents: number | null;
  grossCents: number | null;
  /** Jobs worked, in row order. */
  projectIds: string[];
}

export interface WeekResult {
  workers: WorkerWeek[];
  rows: RowResult[];
  totals: { hours: number; regular: number; overtime: number; grossCents: number };
  /** Workers with hours and no rate: their hours carry no cost. */
  unrated: string[];
  problems: string[];
}

/**
 * Splits `total` cents over `weights` in proportion, rounding by largest remainder so the parts add
 * up to the total exactly (ties go to the earlier row).
 */
export function splitCents(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

/** One and a half times the rate, to the cent, per hundredths of an hour. */
export const overtimePay = (hundredths: number, rateCents: number) =>
  Math.round((hundredths * rateCents * 3) / 200);

/** The week's hours, overtime and wages per worker and per row. */
export function computeWeek(workers: readonly CrewWorker[], rows: readonly TimeRow[]): WeekResult {
  const problems: string[] = [];
  const byWorker = new Map<string, TimeRow[]>();
  for (const r of rows) {
    const list = byWorker.get(r.workerId) ?? [];
    list.push(r);
    byWorker.set(r.workerId, list);
  }
  const out: WorkerWeek[] = [];
  const rowResults: RowResult[] = [];
  const unrated: string[] = [];
  for (const w of workers) {
    const mine = byWorker.get(w.id) ?? [];
    if (mine.length === 0) continue;
    const reg = mine.map(() => 0);
    const ot = mine.map(() => 0);
    const byDay = Array.from({ length: 7 }, () => 0);
    let cum = 0;
    for (let d = 0; d < 7; d++) {
      mine.forEach((r, i) => {
        const h = r.hours[d] ?? 0;
        if (h <= 0) return;
        byDay[d] = (byDay[d] ?? 0) + h;
        const straight = Math.max(0, Math.min(h, OVERTIME_AFTER_HUNDREDTHS - cum));
        reg[i] = (reg[i] ?? 0) + straight;
        ot[i] = (ot[i] ?? 0) + (h - straight);
        cum += h;
      });
    }
    byDay.forEach((h, d) => {
      if (h > MAX_DAY_HUNDREDTHS)
        problems.push(`${w.name}: ${formatHours(h)} hours on day ${d + 1}, more than 24.`);
    });
    const regular = reg.reduce((a, b) => a + b, 0);
    const overtime = ot.reduce((a, b) => a + b, 0);
    const rate = w.rateCents;
    const regularPayCents = rate === null ? null : payFor(regular, rate);
    const overtimePayCents = rate === null ? null : overtimePay(overtime, rate);
    const regParts = regularPayCents === null ? null : splitCents(regularPayCents, reg);
    const otParts = overtimePayCents === null ? null : splitCents(overtimePayCents, ot);
    if (rate === null && regular + overtime > 0) unrated.push(w.name);
    mine.forEach((r, i) => {
      rowResults.push({
        ...r,
        regular: reg[i] ?? 0,
        overtime: ot[i] ?? 0,
        wagesCents: regParts && otParts ? (regParts[i] ?? 0) + (otParts[i] ?? 0) : null,
      });
    });
    out.push({
      workerId: w.id,
      name: w.name,
      trade: w.trade,
      rateCents: rate,
      byDay,
      total: regular + overtime,
      regular,
      overtime,
      regularPayCents,
      overtimePayCents,
      grossCents:
        regularPayCents === null || overtimePayCents === null
          ? null
          : regularPayCents + overtimePayCents,
      projectIds: [...new Set(mine.map((r) => r.projectId))],
    });
  }
  const totals = out.reduce(
    (t, w) => ({
      hours: t.hours + w.total,
      regular: t.regular + w.regular,
      overtime: t.overtime + w.overtime,
      grossCents: t.grossCents + (w.grossCents ?? 0),
    }),
    { hours: 0, regular: 0, overtime: 0, grossCents: 0 },
  );
  return { workers: out, rows: rowResults, totals, unrated, problems };
}

export interface LaborCost {
  projectId: string;
  sovLineId: string | null;
  hours: number;
  overtime: number;
  workers: number;
  wagesCents: number;
  burdenCents: number;
  amountCents: number;
}

/**
 * The week's labor cost per job and line: the rows' wages plus the company's burden percent on them
 * (basis points; 0 when not given, never assumed). Rows with no rate are left out (`unrated`).
 */
export function laborCosts(week: WeekResult, burdenBps: number): LaborCost[] {
  const by = new Map<string, LaborCost & { ids: Set<string> }>();
  for (const r of week.rows) {
    if (r.wagesCents === null || r.regular + r.overtime === 0) continue;
    const key = `${r.projectId}\u0000${r.sovLineId ?? ""}`;
    const c = by.get(key) ?? {
      projectId: r.projectId,
      sovLineId: r.sovLineId,
      hours: 0,
      overtime: 0,
      workers: 0,
      wagesCents: 0,
      burdenCents: 0,
      amountCents: 0,
      ids: new Set<string>(),
    };
    c.hours += r.regular + r.overtime;
    c.overtime += r.overtime;
    c.wagesCents += r.wagesCents;
    c.ids.add(r.workerId);
    by.set(key, c);
  }
  return [...by.values()].map(({ ids, ...c }) => {
    const burdenCents = Math.round((c.wagesCents * burdenBps) / 10_000);
    return {
      ...c,
      workers: ids.size,
      burdenCents,
      amountCents: c.wagesCents + burdenCents,
    };
  });
}

/**
 * The job-cost reference for a week's labor on a line: the same week and line always gives the same
 * reference, so posting a week again adds nothing (`skipExistingReferences`).
 */
export function laborReference(weekStart: string, itemNumber: string | null): string {
  const line = itemNumber === null ? "no line" : `item ${itemNumber}`.slice(0, 60);
  return `Timesheet w/e ${weekEnding(weekStart)} ${line}`;
}

export function laborDescription(
  c: Pick<LaborCost, "hours" | "overtime" | "workers" | "burdenCents" | "wagesCents">,
  burdenBps: number,
): string {
  const ot = c.overtime > 0 ? ` (${formatHours(c.overtime)} overtime)` : "";
  const burden = burdenBps > 0 ? `, wages plus ${burdenBps / 100}% burden` : ", wages";
  return `${formatHours(c.hours)} hours${ot}, ${c.workers} worker${c.workers === 1 ? "" : "s"}${burden}`.slice(
    0,
    300,
  );
}

/** A form's text as hundredths ("8", "7.5", "7.25"); null when it does not read. */
export { formatHours, parseHours } from "./certified-payroll";
