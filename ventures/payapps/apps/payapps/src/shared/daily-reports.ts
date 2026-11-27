// Daily reports (field logs) per job (docs/DAILY-REPORTS.md): one report per job and day, with the
// weather, the crew on site (company, trade, workers, hours each), the work done, delays and the
// hours they cost, equipment, deliveries, visitors, safety and notes. Pure functions, shared by the
// Worker (the PDF and CSV) and the SPA (the page). Dates are YYYY-MM-DD; every figure is one the user
// typed, nothing is looked up (no weather service) or assumed. The days counted as missing skip
// weekends and the company's holidays when it has listed them (HolidayCalendar in ./schedule, the
// same calendar the job schedule reads); without the calendar only weekends are skipped.

import type { HolidayCalendar } from "./schedule";

const NO_HOLIDAYS: HolidayCalendar = new Map();

/** A crew line: who was on site, how many, and the hours each worked. */
export interface CrewLine {
  /** The company on site; null for the contractor's own crew. */
  company: string | null;
  trade: string;
  workers: number;
  /** Hours each worker worked that day (quarter hours, 0-24). */
  hoursEach: number;
}

export interface DailyReportFacts {
  reportDate: string;
  weather: string | null;
  tempHighF: number | null;
  tempLowF: number | null;
  /** Hours of work lost to weather or another delay that day. */
  delayHours: number | null;
  crew: CrewLine[];
  workPerformed: string | null;
  delays: string | null;
  equipment: string | null;
  deliveries: string | null;
  visitors: string | null;
  safety: string | null;
  notes: string | null;
}

export const MAX_CREW_LINES = 40;
export const MAX_WORKERS_PER_LINE = 999;
export const MIN_TEMP_F = -80;
export const MAX_TEMP_F = 140;

/** Printed under the log and on the PDF. */
export const DAILY_REPORTS_NOTE =
  "A daily report records what the contractor saw and typed that day. It is not a notice of delay " +
  "or a claim: the subcontract says how and when those must be given, usually in writing to the GC.";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isDate = (s: string) => {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday .. 6 = Saturday. */
export const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

export const isWeekend = (iso: string) => {
  const d = weekday(iso);
  return d === 0 || d === 6;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Tuesday 2026-11-24" */
export const dayLabel = (iso: string) => `${DAY_NAMES[weekday(iso)]} ${iso}`;

/** Man-hours as a number with at most two decimals (quarter hours times whole workers). */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function lineHours(l: Pick<CrewLine, "workers" | "hoursEach">): number {
  return round2(l.workers * l.hoursEach);
}

export function crewTotals(crew: readonly Pick<CrewLine, "workers" | "hoursEach">[]) {
  let workers = 0;
  let manHours = 0;
  for (const l of crew) {
    workers += l.workers;
    manHours += l.workers * l.hoursEach;
  }
  return { workers, manHours: round2(manHours) };
}

/** "8", "7.5", "7.25": hours as typed, without trailing zeros. */
export const hoursText = (h: number) => String(round2(h));

const isQuarter = (h: number) => Number.isFinite(h) && Math.abs(h * 4 - Math.round(h * 4)) < 1e-9;

/**
 * The first problem with a report, in words, or null. `latest` is the last date a report may carry
 * (the server passes tomorrow in UTC, so a contractor west of UTC can file tonight's report).
 */
export function dailyReportProblem(
  r: Pick<DailyReportFacts, "reportDate" | "tempHighF" | "tempLowF" | "delayHours" | "crew">,
  latest: string,
): string | null {
  if (!isDate(r.reportDate)) return "Enter the report's date as YYYY-MM-DD";
  if (r.reportDate > latest) return "A daily report cannot be dated after today";
  for (const [label, t] of [
    ["High temperature", r.tempHighF],
    ["Low temperature", r.tempLowF],
  ] as const) {
    if (t !== null && (!Number.isInteger(t) || t < MIN_TEMP_F || t > MAX_TEMP_F)) {
      return `${label}: enter whole degrees F between ${MIN_TEMP_F} and ${MAX_TEMP_F}`;
    }
  }
  if (r.tempHighF !== null && r.tempLowF !== null && r.tempLowF > r.tempHighF) {
    return "The low temperature is above the high";
  }
  if (
    r.delayHours !== null &&
    (r.delayHours < 0 || r.delayHours > 24 || !isQuarter(r.delayHours))
  ) {
    return "Hours lost: enter 0 to 24, in quarter hours";
  }
  if (r.crew.length > MAX_CREW_LINES) return `A report holds up to ${MAX_CREW_LINES} crew lines`;
  for (const [i, l] of r.crew.entries()) {
    const n = `Crew line ${i + 1}`;
    if (!l.trade.trim()) return `${n}: enter the trade`;
    if (!Number.isInteger(l.workers) || l.workers < 1 || l.workers > MAX_WORKERS_PER_LINE) {
      return `${n}: enter the number of workers (1 to ${MAX_WORKERS_PER_LINE})`;
    }
    if (l.hoursEach < 0 || l.hoursEach > 24 || !isQuarter(l.hoursEach)) {
      return `${n}: enter the hours each worked, 0 to 24 in quarter hours`;
    }
  }
  return null;
}

/**
 * "Clear, 61°/44°F" or whatever of it was typed; "" when nothing was. `ascii` drops the degree sign
 * ("Clear, 61/44 F") for the PDF's standard fonts, which cannot show it.
 */
export function weatherText(
  r: Pick<DailyReportFacts, "weather" | "tempHighF" | "tempLowF">,
  opts: { ascii?: boolean } = {},
) {
  const d = opts.ascii ? "" : "°";
  const f = opts.ascii ? " F" : "°F";
  const temps =
    r.tempHighF !== null && r.tempLowF !== null
      ? `${r.tempHighF}${d}/${r.tempLowF}${f}`
      : r.tempHighF !== null
        ? `high ${r.tempHighF}${f}`
        : r.tempLowF !== null
          ? `low ${r.tempLowF}${f}`
          : "";
  return [r.weather?.trim() || "", temps].filter(Boolean).join(", ");
}

/** The weekdays with no report, and the company holidays left out of them. */
export interface MissingWeekdays {
  /** Newest first, at most the limit. */
  days: string[];
  total: number;
  /** Weekday holidays in the range with no report, not counted as missing; newest first. */
  holidays: { on: string; name: string }[];
}

/**
 * Weekdays from the job's first report to `through` (inclusive) with no report: the days a GC that
 * asks for a report every workday would find missing. Weekends are left out (a Saturday report
 * counts, a missing Saturday does not), and so are the company's holidays when `holidays` lists
 * them (a report written on one still counts); a holiday not listed may show as missing. Newest
 * first, at most `limit`.
 */
export function missingWeekdays(
  reportDates: readonly string[],
  through: string,
  limit = 31,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): MissingWeekdays {
  if (reportDates.length === 0) return { days: [], total: 0, holidays: [] };
  const have = new Set(reportDates);
  const first = [...reportDates].sort()[0] as string;
  const days: string[] = [];
  const skipped: { on: string; name: string }[] = [];
  let total = 0;
  // Walk back from `through`; jobs are months long, and the cap below bounds the loop.
  for (let d = through, i = 0; d >= first && i < 3660; d = addDays(d, -1), i++) {
    if (isWeekend(d) || have.has(d)) continue;
    const holiday = holidays.get(d);
    if (holiday !== undefined) {
      if (skipped.length < limit) skipped.push({ on: d, name: holiday });
      continue;
    }
    total++;
    if (days.length < limit) days.push(d);
  }
  return { days, total, holidays: skipped };
}

export interface DailyReportSummary {
  reports: number;
  firstDate: string | null;
  lastDate: string | null;
  manHours: number;
  /** Reports with hours lost to weather or a delay, and their sum. */
  delayDays: number;
  delayHours: number;
  /**
   * Weekdays since the first report with none, through yesterday (today may still be written),
   * less the company's listed holidays (named in `missing.holidays`).
   */
  missing: MissingWeekdays;
}

export function summarizeDailyReports(
  items: readonly Pick<DailyReportFacts, "reportDate" | "crew" | "delayHours">[],
  today: string,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): DailyReportSummary {
  const dates = items.map((r) => r.reportDate).sort();
  let manHours = 0;
  let delayDays = 0;
  let delayHours = 0;
  for (const r of items) {
    manHours += crewTotals(r.crew).manHours;
    if (r.delayHours) {
      delayDays++;
      delayHours += r.delayHours;
    }
  }
  return {
    reports: items.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    manHours: round2(manHours),
    delayDays,
    delayHours: round2(delayHours),
    missing: missingWeekdays(dates, addDays(today, -1), undefined, holidays),
  };
}

/**
 * The date a new report starts on: today, or the latest weekday before it with no report that is not
 * one of the company's holidays.
 */
export function suggestedReportDate(
  reportDates: readonly string[],
  today: string,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): string {
  return reportDates.includes(today)
    ? (missingWeekdays(reportDates, today, 1, holidays).days[0] ?? today)
    : today;
}

/**
 * A new report started from an earlier one: the crew and the equipment usually carry over from day
 * to day; the weather, the work, delays and everything else that happened are left blank to type.
 */
export function draftFromPrevious(
  prev: Pick<DailyReportFacts, "crew" | "equipment">,
): Pick<DailyReportFacts, "crew" | "equipment"> {
  return { crew: prev.crew.map((l) => ({ ...l })), equipment: prev.equipment };
}

/**
 * The weekly email's "weekdays without a daily report" line (src/shared/cash-digest.ts): the window
 * is the DAILY_REPORT_GAP_DAYS days before the email's date (the email's own day may still be
 * written), and a job counts only while someone is keeping its log: a report dated within
 * DAILY_REPORT_ACTIVE_DAYS days on or before the email's date. A job whose log stopped longer ago
 * (finished, or never kept daily) is never listed, so the line does not nag about jobs nobody logs.
 */
export const DAILY_REPORT_GAP_DAYS = 7;
export const DAILY_REPORT_ACTIVE_DAYS = 14;

/** One active job's log, as the weekly email reads it. */
export interface CompanyDailyReportJob {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  /** The job's first report ever (YYYY-MM-DD): no day before it is missing. */
  firstReportDate: string;
  /** Report dates at least back to the start of the window; older ones are ignored. */
  reportDates: string[];
}

/** One job's weekdays without a report in the week before the email. */
export interface DailyReportGap {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  /** Weekdays with no report, oldest first. */
  days: string[];
  /** The newest report on the job. */
  lastReportDate: string;
}

/**
 * Jobs with weekdays missing from their daily log in the DAILY_REPORT_GAP_DAYS days before `asOf`,
 * among jobs with a report in the DAILY_REPORT_ACTIVE_DAYS days through `asOf`. Weekends are left
 * out, and so are the company's holidays when `holidays` lists them (the same rule as
 * missingWeekdays). Most days missing first, then by job name.
 */
export function dailyReportGaps(
  jobs: readonly CompanyDailyReportJob[],
  asOf: string,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): DailyReportGap[] {
  const activeFrom = addDays(asOf, -DAILY_REPORT_ACTIVE_DAYS);
  const windowFrom = addDays(asOf, -DAILY_REPORT_GAP_DAYS);
  const gaps: DailyReportGap[] = [];
  for (const j of jobs) {
    const dates = j.reportDates.filter((d) => d <= asOf);
    const last = [...dates].sort().at(-1);
    if (!last || last < activeFrom) continue;
    const have = new Set(dates);
    const days: string[] = [];
    for (let d = windowFrom; d < asOf; d = addDays(d, 1)) {
      if (d < j.firstReportDate || isWeekend(d) || holidays.has(d) || have.has(d)) continue;
      days.push(d);
    }
    if (days.length === 0) continue;
    gaps.push({
      projectId: j.projectId,
      projectName: j.projectName,
      projectNumber: j.projectNumber,
      gcName: j.gcName,
      days,
      lastReportDate: last,
    });
  }
  return gaps.sort(
    (a, b) => b.days.length - a.days.length || a.projectName.localeCompare(b.projectName),
  );
}

/** "Clinic TI (#2207), Harbor Builders: no report for Tuesday 2026-11-24 and Wednesday 2026-11-25." */
export function dailyReportGapText(g: DailyReportGap): string {
  const job = `${g.projectName}${g.projectNumber ? ` (#${g.projectNumber})` : ""}, ${g.gcName}`;
  const labels = g.days.map(dayLabel);
  const list =
    labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
  return `${job}: no report for ${list}.`;
}
