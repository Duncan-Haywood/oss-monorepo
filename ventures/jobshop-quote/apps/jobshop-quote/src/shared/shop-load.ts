// Shop load and lead time: the open jobs (won quotes not yet shipped) put on the shop's machines in
// due-date order, so an estimator can see how far each machine is booked and type a lead time on a
// new quote from the shop's own backlog instead of from memory.
//
// The model, kept small on purpose and printed on the page:
// - Time is counted in working days, Monday to Friday, from the start of the shop's today. Holidays,
//   overtime and second shifts are not known; a machine's capacity is the hours a day the shop typed
//   for it on the rate card. A machine without one is not planned: a job that needs it is listed as
//   "can't plan" with the reason, never given a guessed capacity.
// - Jobs go in by due date (earliest first; no due date last), then by the day they were won. Each
//   part's operations run in the estimate's order: an operation starts when its machine is free and
//   the part's previous operation is done (a whole batch moves between operations; no overlap).
//   Different parts of one job run independently. This is earliest-due-date list scheduling, a
//   standard dispatching rule, not an optimum.
// - Work already done on an open job is not known, so every open job counts in full until it is
//   marked shipped. The load is therefore an upper bound for jobs already under way.
// - Finishing steps and outside services carry no time in the estimate and are left out; the page
//   says to add their days.
// - A new quote's lead time is the date its machine work would finish if it were won today and put
//   behind every open job (it takes no one's place).
import { type CostInputs, startsFor } from "./costing";

export interface LoadMachine {
  id: string;
  name: string;
  /** Hours a day the machine runs (the rate card's "Hours per day"); null: not planned. */
  hoursPerDay: number | null;
  active: boolean;
}

export interface LoadLine {
  partNumber: string;
  /** Parts started (the quantity ordered plus the line's expected fallout). */
  starts: number;
  operations: ReadonlyArray<CostInputs["operations"][number]>;
}

export interface LoadJob {
  id: string;
  label: string;
  customer: string;
  /** YYYY-MM-DD the shop owes the parts; null when none was saved. */
  dueOn: string | null;
  /** YYYY-MM-DD the quote was won (ties in due date go to the earlier win). */
  wonOn: string;
  lines: LoadLine[];
  /** Reasons the job cannot be planned found before scheduling (a quantity not saved). */
  problems?: string[];
}

export interface PlannedJob {
  id: string;
  label: string;
  customer: string;
  dueOn: string | null;
  /** The day the job's machine work would finish; null when it can't be planned. */
  finishOn: string | null;
  /** Working days from the start of today to the end of that day (1 = done today). */
  workingDays: number | null;
  /** Machine hours the job needs (setup plus run on the starts). */
  hours: number;
  /** True when finishOn is after dueOn. */
  late: boolean;
  /** Why it was not planned (empty when it was). */
  problems: string[];
}

export interface MachineLoad {
  id: string;
  name: string;
  hoursPerDay: number | null;
  /** Hours of open work on the machine from the planned jobs. */
  hours: number;
  /** Working days until the machine is free (fractional); 0 when idle. */
  bookedDays: number;
  /** The last day it has work; null when idle or not planned. */
  bookedUntil: string | null;
  /** Jobs with work on it. */
  jobs: number;
}

export interface ShopLoad {
  /** The day counting starts from (today, or the next weekday when today is a weekend). */
  startOn: string;
  jobs: PlannedJob[];
  machines: MachineLoad[];
}

export interface LeadTime {
  quantity: number;
  /** Machine hours this quantity needs. */
  hours: number;
  finishOn: string | null;
  workingDays: number | null;
  problems: string[];
}

const EPS = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Today when it is a weekday, else the following Monday. */
export function firstWorkingDay(today: string): string {
  const d = parseDay(today);
  while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
  return fmtDay(d);
}

/** The working day `index` working days after `start` (index 0 is start itself, a weekday). */
export function addWorkingDays(start: string, index: number): string {
  const d = parseDay(start);
  let left = index;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) left -= 1;
  }
  return fmtDay(d);
}

/**
 * The day work ending at `end` working days after the start of `start` finishes on. Work that ends
 * exactly at the close of day k finishes on day k (1.0 → the start day), not the next morning.
 */
export function finishDay(start: string, end: number): { day: string; workingDays: number } {
  const days = Math.max(1, Math.ceil(end - EPS));
  return { day: addWorkingDays(start, days - 1), workingDays: days };
}

/** Machine minutes for one operation on `starts` parts; null when the cycle time is blank. */
export function operationMinutes(
  op: CostInputs["operations"][number],
  starts: number,
): number | null {
  if (op.cycleMinutesPerPart === null) return null;
  return op.setupMinutes + op.cycleMinutesPerPart * starts;
}

/** The problems that keep a set of lines off the plan: blank cycle times, machines with no hours. */
function lineProblems(
  lines: ReadonlyArray<LoadLine>,
  machines: Map<string, LoadMachine>,
): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (line.operations.length === 0) out.push(`${line.partNumber}: no machine operations`);
    for (const op of line.operations) {
      const m = machines.get(op.machineId);
      if (!m) out.push(`${line.partNumber}: a machine no longer on the rate card`);
      else if (m.hoursPerDay === null) out.push(`${m.name}: set its hours per day`);
      if (op.cycleMinutesPerPart === null)
        out.push(`${line.partNumber}: an operation with no cycle time`);
    }
  }
  return [...new Set(out)];
}

function jobHours(lines: ReadonlyArray<LoadLine>): number {
  let min = 0;
  for (const line of lines)
    for (const op of line.operations) min += operationMinutes(op, line.starts) ?? 0;
  return min / 60;
}

/** Earliest due date first, no due date last, then the earlier win, then id (stable). */
export function jobOrder(a: LoadJob, b: LoadJob): number {
  if (a.dueOn !== b.dueOn) {
    if (a.dueOn === null) return 1;
    if (b.dueOn === null) return -1;
    return a.dueOn < b.dueOn ? -1 : 1;
  }
  if (a.wonOn !== b.wonOn) return a.wonOn < b.wonOn ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Put a job's lines on the machines (mutating `free`); returns the finish in working days. */
function place(
  lines: ReadonlyArray<LoadLine>,
  machines: Map<string, LoadMachine>,
  free: Map<string, number>,
  hoursOn?: Map<string, number>,
): number {
  let jobEnd = 0;
  for (const line of lines) {
    let prev = 0;
    for (const op of line.operations) {
      const m = machines.get(op.machineId) as LoadMachine;
      const hours = (operationMinutes(op, line.starts) ?? 0) / 60;
      const start = Math.max(free.get(m.id) ?? 0, prev);
      const end = start + hours / (m.hoursPerDay as number);
      free.set(m.id, end);
      if (hoursOn) hoursOn.set(m.id, (hoursOn.get(m.id) ?? 0) + hours);
      prev = end;
    }
    jobEnd = Math.max(jobEnd, prev);
  }
  return jobEnd;
}

function machineMap(machines: ReadonlyArray<LoadMachine>): Map<string, LoadMachine> {
  // A machine with 0 or a negative figure is treated as not planned (the schema refuses them).
  return new Map(
    machines.map((m) => [
      m.id,
      { ...m, hoursPerDay: m.hoursPerDay !== null && m.hoursPerDay > 0 ? m.hoursPerDay : null },
    ]),
  );
}

interface Scheduled {
  load: ShopLoad;
  free: Map<string, number>;
  machines: Map<string, LoadMachine>;
}

function schedule(
  jobs: ReadonlyArray<LoadJob>,
  machineRows: ReadonlyArray<LoadMachine>,
  today: string,
): Scheduled {
  const startOn = firstWorkingDay(today);
  const machines = machineMap(machineRows);
  const free = new Map<string, number>();
  const hoursOn = new Map<string, number>();
  const jobsOn = new Map<string, Set<string>>();
  const planned: PlannedJob[] = [];
  for (const job of [...jobs].sort(jobOrder)) {
    const problems = [...(job.problems ?? []), ...lineProblems(job.lines, machines)];
    const hours = round2(jobHours(job.lines));
    if (problems.length > 0) {
      planned.push({
        id: job.id,
        label: job.label,
        customer: job.customer,
        dueOn: job.dueOn,
        finishOn: null,
        workingDays: null,
        hours,
        late: false,
        problems,
      });
      continue;
    }
    const end = place(job.lines, machines, free, hoursOn);
    for (const line of job.lines)
      for (const op of line.operations) {
        const set = jobsOn.get(op.machineId) ?? new Set<string>();
        set.add(job.id);
        jobsOn.set(op.machineId, set);
      }
    const { day, workingDays } = finishDay(startOn, end);
    planned.push({
      id: job.id,
      label: job.label,
      customer: job.customer,
      dueOn: job.dueOn,
      finishOn: day,
      workingDays,
      hours,
      late: job.dueOn !== null && day > job.dueOn,
      problems: [],
    });
  }
  const machineLoads: MachineLoad[] = [...machines.values()]
    .filter((m) => m.active || (hoursOn.get(m.id) ?? 0) > 0)
    .map((m) => {
      const end = free.get(m.id) ?? 0;
      return {
        id: m.id,
        name: m.name,
        hoursPerDay: m.hoursPerDay,
        hours: round2(hoursOn.get(m.id) ?? 0),
        bookedDays: round2(end),
        bookedUntil: end > EPS ? finishDay(startOn, end).day : null,
        jobs: jobsOn.get(m.id)?.size ?? 0,
      };
    });
  return { load: { startOn, jobs: planned, machines: machineLoads }, free, machines };
}

/** The open jobs on the machines, in due-date order, with each machine's booked days. */
export function shopLoad(
  jobs: ReadonlyArray<LoadJob>,
  machines: ReadonlyArray<LoadMachine>,
  today: string,
): ShopLoad {
  return schedule(jobs, machines, today).load;
}

/**
 * When a quote's machine work would finish, per quantity break, if won today and put behind every
 * open job. Each break is planned on its own (they are alternatives, not one order).
 */
export function leadTimes(
  inputs: CostInputs,
  partNumber: string,
  jobs: ReadonlyArray<LoadJob>,
  machineRows: ReadonlyArray<LoadMachine>,
  today: string,
): LeadTime[] {
  const base = schedule(jobs, machineRows, today);
  return inputs.quantities.map((quantity) => {
    const line: LoadLine = {
      partNumber,
      starts: startsFor(quantity, inputs.falloutBps),
      operations: inputs.operations,
    };
    const problems = lineProblems([line], base.machines);
    const hours = round2(jobHours([line]));
    if (problems.length > 0)
      return { quantity, hours, finishOn: null, workingDays: null, problems };
    const end = place([line], base.machines, new Map(base.free));
    const { day, workingDays } = finishDay(base.load.startOn, end);
    return { quantity, hours, finishOn: day, workingDays, problems: [] };
  });
}

/** "about 12 working days (ship by 2026-12-14)" style text an estimator can paste as a lead time. */
export function leadTimeText(lt: LeadTime): string | null {
  if (lt.workingDays === null) return null;
  const weeks = Math.ceil(lt.workingDays / 5);
  return `${weeks} week${weeks === 1 ? "" : "s"} ARO`;
}
