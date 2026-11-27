// Delays against the job's schedule: each daily report's lost hours, tied to the activity they held
// up, gathered into a log a contractor can hand the GC as backup for a time-extension change order.
// Pure: the Worker (services/payapps/schedule-delays.ts) and the screen read the same rules.
//
// Nothing is worked out beyond sums and counts of what was typed: PayApps does not decide whether a
// delay is excusable, how many days of contract time it earns, or turn hours into days.

import { activityLabel } from "./schedule";

/** What the log reads from a daily report. */
export interface DelayReportFacts {
  id: string;
  reportDate: string;
  /** Hours of work lost that day; null: not stated. */
  delayHours: number | null;
  /** The delay as the foreman wrote it. */
  delays: string | null;
  weather: string | null;
  /** The schedule activity the delay held up; null: not tied to one. */
  delayActivityId: string | null;
}

/** What the log reads from a schedule activity. */
export interface DelayActivityFacts {
  id: string;
  number: number;
  name: string;
  startOn: string;
  finishOn: string;
}

export interface DelayDay {
  reportId: string;
  reportDate: string;
  /** null: the report names the activity but does not state hours lost. */
  hours: number | null;
  cause: string | null;
  weather: string | null;
}

export interface ActivityDelays {
  /** null: the group of delays not tied to any activity. */
  activityId: string | null;
  number: number | null;
  /** "A-003 Rough-in, level 2", or "Not tied to an activity". */
  label: string;
  startOn: string | null;
  finishOn: string | null;
  /** Oldest first. */
  days: DelayDay[];
  /** Reports in the group (days with a report naming a delay). */
  dayCount: number;
  /** Sum of the stated hours. */
  hours: number;
  /** Reports in the group that state no hours. */
  hoursNotStated: number;
  firstOn: string;
  lastOn: string;
}

export interface DelayLog {
  /** Activities with at least one delay, by activity number, then the untied group if any. */
  groups: ActivityDelays[];
  /** Every report in the log once. */
  dayCount: number;
  hours: number;
  /** The dates the log was limited to, as asked (null: open ended). */
  from: string | null;
  to: string | null;
  /** The one activity asked for, if the log was limited to it. */
  activityId: string | null;
}

export const UNTIED_LABEL = "Not tied to an activity";

/** Printed on the log and its PDF, next to the daily reports' own note. */
export const DELAY_LOG_NOTE =
  "This log lists the hours lost that the contractor's daily reports record, grouped by the " +
  "schedule activity each delay held up, as typed. It is not a notice of delay or a claim, and it " +
  "does not decide whether a delay is excusable or how much contract time it earns: the subcontract " +
  "says how and when notice must be given and what time may be added.";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A report is a delay day when it states hours lost or names the activity a delay held up. */
export const isDelayDay = (r: Pick<DelayReportFacts, "delayHours" | "delayActivityId">) =>
  (r.delayHours !== null && r.delayHours > 0) || r.delayActivityId !== null;

export const activityDelayLabel = (a: Pick<DelayActivityFacts, "number" | "name">) =>
  `${activityLabel(a.number)} ${a.name}`;

/**
 * The job's delay log. `activityId` keeps one activity's group only; `from`/`to` (inclusive ISO
 * dates) keep the reports in that range. A report tied to an activity no longer on the schedule
 * (deleted since) falls in the untied group rather than vanishing.
 */
export function delayLog(
  reports: readonly DelayReportFacts[],
  activities: readonly DelayActivityFacts[],
  opts: { activityId?: string | null; from?: string | null; to?: string | null } = {},
): DelayLog {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const from = opts.from ?? null;
  const to = opts.to ?? null;
  const only = opts.activityId ?? null;
  const groups = new Map<string | null, DelayReportFacts[]>();
  for (const r of reports) {
    if (!isDelayDay(r)) continue;
    if (from && r.reportDate < from) continue;
    if (to && r.reportDate > to) continue;
    const key = r.delayActivityId && byId.has(r.delayActivityId) ? r.delayActivityId : null;
    if (only !== null && key !== only) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const out: ActivityDelays[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => (a.reportDate < b.reportDate ? -1 : a.reportDate > b.reportDate ? 1 : 0));
    const a = key === null ? null : (byId.get(key) ?? null);
    let hours = 0;
    let notStated = 0;
    for (const r of list) {
      if (r.delayHours === null) notStated++;
      else hours += r.delayHours;
    }
    out.push({
      activityId: a?.id ?? null,
      number: a?.number ?? null,
      label: a ? activityDelayLabel(a) : UNTIED_LABEL,
      startOn: a?.startOn ?? null,
      finishOn: a?.finishOn ?? null,
      days: list.map((r) => ({
        reportId: r.id,
        reportDate: r.reportDate,
        hours: r.delayHours,
        cause: r.delays,
        weather: r.weather,
      })),
      dayCount: list.length,
      hours: round2(hours),
      hoursNotStated: notStated,
      firstOn: list[0]?.reportDate ?? "",
      lastOn: list.at(-1)?.reportDate ?? "",
    });
  }
  // Activities in number order; the untied group last.
  out.sort((x, y) => (x.number ?? Number.MAX_SAFE_INTEGER) - (y.number ?? Number.MAX_SAFE_INTEGER));
  return {
    groups: out,
    dayCount: out.reduce((s, g) => s + g.dayCount, 0),
    hours: round2(out.reduce((s, g) => s + g.hours, 0)),
    from,
    to,
    activityId: only,
  };
}

/** "3 days, 14.5 h lost" (and "1 without hours" when some reports state none). */
export function delayTotalsText(g: Pick<ActivityDelays, "dayCount" | "hours" | "hoursNotStated">) {
  const days = `${g.dayCount} day${g.dayCount === 1 ? "" : "s"}`;
  const notStated = g.hoursNotStated ? `, ${g.hoursNotStated} without hours stated` : "";
  return `${days}, ${round2(g.hours)} h lost${notStated}`;
}
