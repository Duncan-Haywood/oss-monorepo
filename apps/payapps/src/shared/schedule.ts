// The job schedule: the activities a subcontractor plans on a job (rough-in level 2, set fixtures,
// pull wire to panel LP-2), each with the start and finish dates the contractor types, the trade or
// crew doing it, how far along it is, and optionally the activity it has to wait for. Pure: workday
// math (Monday to Friday), each activity's status for today, the "starts before its predecessor
// finishes" check, moving an activity and everything waiting on it when the GC's schedule slips,
// the three-week lookahead window and the schedule's summary. Shared by the Worker
// (services/payapps/schedule.ts, the PDF and CSV) and the SPA (components/job-schedule.tsx).
//
// Nothing is estimated or scheduled for the contractor: every date is one they typed or a shift
// they asked for, and "late" only means a date they typed has passed. Weekends are not workdays,
// and neither are the company's holidays when it has listed them (a HolidayCalendar, typed by the
// contractor or prefilled from the federal list and then edited; never assumed). Every function
// that counts workdays takes the calendar as an optional last argument: without it only weekends
// are skipped, as before the calendar existed.

import { addDays } from "./cash-report";

export const SCHEDULE_ANCHOR = "schedule";

/** The most activities one job's schedule holds: a sub's schedule on a large job runs to a few hundred. */
export const MAX_SCHEDULE_ACTIVITIES = 1000;
/** The furthest one shift moves activities, in workdays (about a year). */
export const MAX_SHIFT_WORKDAYS = 260;
/** Lag after a predecessor, in workdays. */
export const MAX_LAG_WORKDAYS = 260;

/**
 * not_started: starts after today; in_progress: started (by its date) and not done; done: 100%;
 * late_start: its start date has passed with nothing done; late_finish: its finish date has passed
 * and it is not done.
 */
export type ActivityStatus = "not_started" | "in_progress" | "done" | "late_start" | "late_finish";

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  late_start: "Late start",
  late_finish: "Past finish",
};

export interface ScheduleActivityFacts {
  /** 1..n per job; never changes once given, so a predecessor can name it. */
  number: number;
  name: string;
  trade: string | null;
  /** ISO dates (YYYY-MM-DD), inclusive: an activity on one day starts and finishes that day. */
  startOn: string;
  finishOn: string;
  /** 0..100, as the contractor reports it. */
  percentComplete: number;
  /** The activity this one waits for (finish to start); null: none. */
  predecessorNumber: number | null;
  /** Workdays to wait after the predecessor finishes (curing, inspection); 0 starts the next workday. */
  lagDays: number;
}

/** "A-001": the activity's label on the screen, PDF and CSV. */
export function activityLabel(n: number): string {
  return `A-${String(n).padStart(3, "0")}`;
}

/** The company's days off: ISO date to the name typed for it ("Thanksgiving"). */
export type HolidayCalendar = ReadonlyMap<string, string>;

const NO_HOLIDAYS: HolidayCalendar = new Map();

/** The most holidays one company lists: a few years of a dozen a year. */
export const MAX_COMPANY_HOLIDAYS = 200;
/** The most holidays one request adds (a year of the federal list is eleven). */
export const MAX_HOLIDAYS_PER_ADD = 50;

export interface CompanyHoliday {
  on: string;
  name: string;
}

export function holidayCalendar(list: readonly CompanyHoliday[]): HolidayCalendar {
  return new Map(list.map((h) => [h.on, h.name]));
}

/** Day of the week for an ISO date: 0 Sunday .. 6 Saturday (UTC, so no time zone moves it). */
export function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function isWorkday(iso: string, holidays: HolidayCalendar = NO_HOLIDAYS): boolean {
  const d = weekday(iso);
  return d !== 0 && d !== 6 && !holidays.has(iso);
}

/**
 * `iso` moved by `n` workdays (Monday to Friday, less the holidays): +1 from a Friday is the
 * Monday, -1 from a Monday is the Friday before, and +1 from a Saturday is the Monday; with Monday
 * a holiday, +1 from the Friday is the Tuesday. 0 returns the date as it is.
 */
export function addWorkdays(
  iso: string,
  n: number,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): string {
  let d = iso;
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(Math.trunc(n));
  while (left > 0) {
    d = addDays(d, step);
    if (isWorkday(d, holidays)) left--;
  }
  return d;
}

/** Workdays from `from` to `to`, both counted when they are workdays; 0 when `to` is before `from`. */
export function workdaysBetween(
  from: string,
  to: string,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): number {
  if (to < from) return 0;
  // Whole weeks first, so a year-long activity is not walked a day at a time.
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const days = Math.round((end - start) / 86_400_000) + 1;
  const weeks = Math.floor(days / 7);
  let count = weeks * 5;
  let d = addDays(from, weeks * 7);
  for (let i = weeks * 7; i < days; i++) {
    if (isWorkday(d)) count++;
    d = addDays(d, 1);
  }
  // A holiday on a weekday inside the range is one workday fewer; one on a weekend changes nothing.
  for (const h of holidays.keys()) if (h >= from && h <= to && isWorkday(h)) count--;
  return count;
}

/** The Monday of the week `iso` falls in (a Sunday belongs to the week before it ends). */
export function mondayOf(iso: string): string {
  const d = weekday(iso);
  return addDays(iso, d === 0 ? -6 : 1 - d);
}

export function activityStatus(
  a: Pick<ScheduleActivityFacts, "startOn" | "finishOn" | "percentComplete">,
  today: string,
): ActivityStatus {
  if (a.percentComplete >= 100) return "done";
  if (a.finishOn < today) return "late_finish";
  if (a.startOn < today && a.percentComplete === 0) return "late_start";
  if (a.startOn <= today) return "in_progress";
  return "not_started";
}

/**
 * The first day the activity can start after its predecessor: the workday after the predecessor's
 * finish, plus the lag. Null without a predecessor, or when the predecessor is not on the schedule.
 */
export function earliestStart(
  a: Pick<ScheduleActivityFacts, "predecessorNumber" | "lagDays">,
  byNumber: Map<number, Pick<ScheduleActivityFacts, "finishOn">>,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): string | null {
  if (a.predecessorNumber === null) return null;
  const p = byNumber.get(a.predecessorNumber);
  if (!p) return null;
  return addWorkdays(p.finishOn, 1 + Math.max(0, a.lagDays), holidays);
}

/** Checks one activity's own fields; returns the first problem in words, or null. */
export function activityProblem(
  a: Pick<
    ScheduleActivityFacts,
    "number" | "startOn" | "finishOn" | "percentComplete" | "predecessorNumber" | "lagDays"
  >,
): string | null {
  if (a.finishOn < a.startOn) return "The finish date is before the start date";
  if (a.percentComplete < 0 || a.percentComplete > 100) return "Percent complete is 0 to 100";
  if (a.predecessorNumber === a.number) return "An activity cannot wait for itself";
  if (a.lagDays < 0 || a.lagDays > MAX_LAG_WORKDAYS) {
    return `The lag is 0 to ${MAX_LAG_WORKDAYS} workdays`;
  }
  return null;
}

/**
 * The predecessor chain of `start` loops back to it: the numbers in the loop, or null. A loop can
 * only be made by a change, so the Worker refuses it there.
 */
export function predecessorLoop(
  start: number,
  byNumber: Map<number, Pick<ScheduleActivityFacts, "predecessorNumber">>,
): number[] | null {
  const seen: number[] = [start];
  let cur = byNumber.get(start)?.predecessorNumber ?? null;
  while (cur !== null) {
    if (cur === start) return seen;
    if (seen.includes(cur)) return null; // a loop further up that does not include start
    seen.push(cur);
    cur = byNumber.get(cur)?.predecessorNumber ?? null;
  }
  return null;
}

/** What is wrong with an activity's place in the schedule, in words, or null. */
export function sequenceProblem(
  a: ScheduleActivityFacts,
  byNumber: Map<number, ScheduleActivityFacts>,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): string | null {
  if (a.predecessorNumber === null) return null;
  const p = byNumber.get(a.predecessorNumber);
  if (!p) return `Waits for ${activityLabel(a.predecessorNumber)}, which is not on the schedule`;
  const earliest = earliestStart(a, byNumber, holidays);
  if (earliest && a.startOn < earliest) {
    const lag = a.lagDays > 0 ? ` and ${a.lagDays} workday${a.lagDays === 1 ? "" : "s"} lag` : "";
    return `Starts ${a.startOn}, before ${activityLabel(p.number)} finishes (${p.finishOn})${lag}: earliest ${earliest}`;
  }
  return null;
}

/** Every activity that waits on `number`, directly or through others, in schedule order. */
export function successorsOf(number: number, activities: ScheduleActivityFacts[]): number[] {
  const out = new Set<number>();
  const queue = [number];
  while (queue.length > 0) {
    const cur = queue.shift() as number;
    for (const a of activities) {
      if (a.predecessorNumber === cur && a.number !== number && !out.has(a.number)) {
        out.add(a.number);
        queue.push(a.number);
      }
    }
  }
  return activities.map((a) => a.number).filter((n) => out.has(n));
}

export interface ShiftedDates {
  number: number;
  startOn: string;
  finishOn: string;
}

export interface ShiftPlan {
  moved: ShiftedDates[];
  /** Successors left where they are because they are done. */
  skippedDone: number[];
}

/**
 * Moves activity `number` and everything waiting on it by `workdays` (negative pulls them in): the
 * GC's schedule slipped a week, so the rough-in and everything after it slip a week. Start and
 * finish each move by the same number of workdays, so a five-workday activity stays five workdays.
 * A finished (100%) successor stays where it happened; the activity asked for moves even if done,
 * because the person asked for it by name.
 */
export function planShift(
  number: number,
  workdays: number,
  activities: ScheduleActivityFacts[],
  holidays: HolidayCalendar = NO_HOLIDAYS,
): ShiftPlan {
  const target = activities.find((a) => a.number === number);
  if (!target || workdays === 0) return { moved: [], skippedDone: [] };
  const byNumber = new Map(activities.map((a) => [a.number, a]));
  const moved: ShiftedDates[] = [];
  const skippedDone: number[] = [];
  const move = (a: ScheduleActivityFacts) =>
    moved.push({
      number: a.number,
      startOn: addWorkdays(a.startOn, workdays, holidays),
      finishOn: addWorkdays(a.finishOn, workdays, holidays),
    });
  move(target);
  for (const n of successorsOf(number, activities)) {
    const a = byNumber.get(n) as ScheduleActivityFacts;
    if (a.percentComplete >= 100) skippedDone.push(n);
    else move(a);
  }
  return { moved, skippedDone };
}

export interface LookaheadWindow {
  /** The Monday the window opens and the Sunday it closes (ISO). */
  from: string;
  to: string;
  weeks: number;
  /** The window's workdays, Monday to Friday less the holidays, in order: the PDF's day columns. */
  days: string[];
  /** The company's holidays on a weekday in the window, left out of `days`, in date order. */
  holidays: CompanyHoliday[];
}

/** `weeks` weeks from the Monday of today's week (the lookahead GCs ask for is three). */
export function lookaheadWindow(
  today: string,
  weeks: number,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): LookaheadWindow {
  const w = Math.min(6, Math.max(1, Math.trunc(weeks) || 3));
  const from = mondayOf(today);
  const to = addDays(from, w * 7 - 1);
  const days: string[] = [];
  const off: CompanyHoliday[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWorkday(d, holidays)) days.push(d);
    else if (isWorkday(d)) off.push({ on: d, name: holidays.get(d) as string });
  }
  return { from, to, weeks: w, days, holidays: off };
}

/** Activities not done that touch the window: what the crew works on, or should have. */
export function inLookahead(
  a: Pick<ScheduleActivityFacts, "startOn" | "finishOn" | "percentComplete">,
  w: Pick<LookaheadWindow, "to">,
): boolean {
  if (a.percentComplete >= 100) return false;
  // A late activity that should have finished before the window opens is still on the crew's
  // plate, so only the start is compared.
  return a.startOn <= w.to;
}

export interface ScheduleSummary {
  total: number;
  notStarted: number;
  inProgress: number;
  done: number;
  late: number;
  /** Activities that start before what they wait for finishes, or wait for a missing one. */
  conflicts: number;
  /** First start and last finish across the schedule; null when it is empty. */
  startOn: string | null;
  finishOn: string | null;
  /**
   * Percent complete weighted by each activity's workdays, whole percent; null when empty. A
   * twenty-day activity half done counts ten times a two-day one half done.
   */
  percentComplete: number | null;
}

export function summarizeSchedule(
  activities: ScheduleActivityFacts[],
  today: string,
  holidays: HolidayCalendar = NO_HOLIDAYS,
): ScheduleSummary {
  const byNumber = new Map(activities.map((a) => [a.number, a]));
  const s: ScheduleSummary = {
    total: activities.length,
    notStarted: 0,
    inProgress: 0,
    done: 0,
    late: 0,
    conflicts: 0,
    startOn: null,
    finishOn: null,
    percentComplete: null,
  };
  let weight = 0;
  let doneWeight = 0;
  for (const a of activities) {
    const st = activityStatus(a, today);
    if (st === "not_started") s.notStarted++;
    else if (st === "in_progress") s.inProgress++;
    else if (st === "done") s.done++;
    else s.late++;
    if (sequenceProblem(a, byNumber, holidays)) s.conflicts++;
    if (!s.startOn || a.startOn < s.startOn) s.startOn = a.startOn;
    if (!s.finishOn || a.finishOn > s.finishOn) s.finishOn = a.finishOn;
    // At least one, so an activity typed on a weekend still counts.
    const w = Math.max(1, workdaysBetween(a.startOn, a.finishOn, holidays));
    weight += w;
    doneWeight += (w * Math.min(100, Math.max(0, a.percentComplete))) / 100;
  }
  if (weight > 0) s.percentComplete = Math.floor((doneWeight / weight) * 100);
  return s;
}

/** The next activity number on a job: one past the highest used (gaps are left as they are). */
export function nextActivityNumber(numbers: number[]): number {
  return numbers.reduce((m, n) => Math.max(m, n), 0) + 1;
}

// ---------------------------------------------------------------------------------------------
// The crew lookahead: every active job's open activities in the window, grouped by the trade or
// crew typed on them, so the office sees who is where next week. Crews are matched by name as
// typed (case and extra spaces ignored): "Crew A" and "crew  a" are one crew, "Crew A" and "Crew 1"
// are two. A crew with activities on two jobs the same workday is listed with those days; that is
// what the dates say, not a judgment (a crew of six can split), and the screen says so.

/** One open activity on one job, as the crew lookahead reads it. */
export interface CrewLookaheadInput
  extends Pick<
    ScheduleActivityFacts,
    "number" | "name" | "trade" | "startOn" | "finishOn" | "percentComplete"
  > {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  isSample: boolean;
}

export interface CrewLookaheadActivity extends CrewLookaheadInput {
  status: ActivityStatus;
  /** The last day the bar covers: the finish, or today for an activity past its finish. */
  barEnd: string;
}

export interface CrewDayOnJobs {
  day: string;
  /** The jobs (ids) the crew has work on that day, two or more, in the crew's job order. */
  projectIds: string[];
}

export interface CrewLookaheadGroup {
  /** The crew's name as first typed (in start order); null: activities with no trade or crew. */
  crew: string | null;
  activities: CrewLookaheadActivity[];
  /** Distinct jobs the crew has open work on in the window. */
  jobCount: number;
  /** Workdays in the window with the crew on two or more jobs. */
  daysOnSeveralJobs: CrewDayOnJobs[];
}

/** The most open activities the crew lookahead reads across every job. */
export const MAX_CREW_LOOKAHEAD_ROWS = 3000;

/** The key two spellings of one crew share: trimmed, inner spaces collapsed, lower case. */
export function crewKey(trade: string | null): string {
  return (trade ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The last day an activity's bar covers on a lookahead: past its finish and open, it runs to today. */
export function barEnd(
  a: Pick<ScheduleActivityFacts, "startOn" | "finishOn" | "percentComplete">,
  today: string,
): string {
  return activityStatus(a, today) === "late_finish" && a.finishOn < today ? today : a.finishOn;
}

/**
 * Groups the open activities in the window by crew (named crews A to Z, then the ones with none),
 * each crew's activities in start order, and lists the workdays a crew is on two or more jobs.
 * Done activities and ones starting after the window are left out (inLookahead).
 */
export function crewLookahead(
  inputs: CrewLookaheadInput[],
  window: LookaheadWindow,
  today: string,
): CrewLookaheadGroup[] {
  const groups = new Map<string, CrewLookaheadGroup>();
  const sorted = inputs
    .filter((a) => inLookahead(a, window))
    .sort(
      (x, y) =>
        x.startOn.localeCompare(y.startOn) ||
        x.projectName.localeCompare(y.projectName) ||
        x.number - y.number,
    );
  for (const a of sorted) {
    const key = crewKey(a.trade);
    let g = groups.get(key);
    if (!g) {
      g = {
        crew: key ? (a.trade as string).trim().replace(/\s+/g, " ") : null,
        activities: [],
        jobCount: 0,
        daysOnSeveralJobs: [],
      };
      groups.set(key, g);
    }
    g.activities.push({ ...a, status: activityStatus(a, today), barEnd: barEnd(a, today) });
  }
  for (const g of groups.values()) {
    const jobs = [...new Set(g.activities.map((a) => a.projectId))];
    g.jobCount = jobs.length;
    // Only a named crew can be in two places; "no crew named" is many people.
    if (g.crew === null) continue;
    for (const day of window.days) {
      const on = new Set(
        g.activities.filter((a) => a.startOn <= day && day <= a.barEnd).map((a) => a.projectId),
      );
      if (on.size > 1) g.daysOnSeveralJobs.push({ day, projectIds: jobs.filter((j) => on.has(j)) });
    }
  }
  return [...groups.entries()]
    .sort(([ka], [kb]) => (ka === "" ? 1 : kb === "" ? -1 : ka.localeCompare(kb)))
    .map(([, g]) => g);
}

// ---------------------------------------------------------------------------------------------
// The federal holidays, offered as a starting list the contractor edits (many subs work Columbus
// Day and Veterans Day; a union agreement may add the day after Thanksgiving). The eleven legal
// public holidays of 5 U.S.C. § 6103(a), each moved to the day OPM observes it when it falls on a
// weekend: a Saturday holiday is kept the Friday before, a Sunday one the Monday after
// (opm.gov, "Federal Holidays"). Nothing here says a company must close.

/** The `n`th (1-based) `dow` (0 Sunday .. 6 Saturday) of a month; n = -1 is the last one. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  const iso = (d: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (n > 0) {
    const first = weekday(iso(1));
    return iso(1 + ((dow - first + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return iso(last - ((weekday(iso(last)) - dow + 7) % 7));
}

/** A fixed-date holiday moved off a weekend the way OPM observes it. */
function observed(iso: string): string {
  const d = weekday(iso);
  return d === 6 ? addDays(iso, -1) : d === 0 ? addDays(iso, 1) : iso;
}

function federalHolidaysOfYear(year: number): CompanyHoliday[] {
  const fixed = (m: number, d: number) =>
    observed(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return [
    { on: fixed(1, 1), name: "New Year's Day" },
    { on: nthWeekday(year, 1, 1, 3), name: "Birthday of Martin Luther King, Jr." },
    { on: nthWeekday(year, 2, 1, 3), name: "Washington's Birthday" },
    { on: nthWeekday(year, 5, 1, -1), name: "Memorial Day" },
    { on: fixed(6, 19), name: "Juneteenth National Independence Day" },
    { on: fixed(7, 4), name: "Independence Day" },
    { on: nthWeekday(year, 9, 1, 1), name: "Labor Day" },
    { on: nthWeekday(year, 10, 1, 2), name: "Columbus Day" },
    { on: fixed(11, 11), name: "Veterans Day" },
    { on: nthWeekday(year, 11, 4, 4), name: "Thanksgiving Day" },
    { on: fixed(12, 25), name: "Christmas Day" },
  ];
}

/**
 * The federal holidays observed in `year`, in date order. New Year's Day on a Saturday is observed
 * the Friday before, so it belongs to the year before: 2028's is 2027-12-31, listed with 2027.
 */
export function federalHolidays(year: number): CompanyHoliday[] {
  const y = String(year);
  return [...federalHolidaysOfYear(year), ...federalHolidaysOfYear(year + 1)]
    .filter((h) => h.on.startsWith(y))
    .sort((a, b) => a.on.localeCompare(b.on));
}
