// The GC's monthly billing cutoff: the day of the month the subcontract (or the GC's billing
// instructions) says the pay application must reach the GC to be paid in that month's draw. An
// application that arrives after it usually waits for the next cycle, a month's delay on the
// money, so the cutoff is worth a reminder. Pure: computed on read from the job's day and its
// applications, nothing stored but the day (projects.billing_day).
//
// Rules:
// - The day is 1-31; in a shorter month it falls on the month's last day (day 31 is "the last day
//   of the month"). The cutoff of a cycle is the first cutoff on or after the report date.
// - An application counts as sent for a cycle when it left draft after the previous cutoff and on
//   or before this one (by the UTC day it was submitted). Late applications for the last cycle sent
//   after its cutoff therefore count for this one: PayApps cannot tell which draw the GC put them in.
// - Missed: the previous cutoff passed with no application sent in its cycle while a draft dated on
//   or before it is still unsent. A cycle with nothing drafted is never called missed: there may
//   have been no work to bill that month.
// - A reminder (a next step on the cash page and in the weekly email) only within
//   BILLING_CUTOFF_REMINDER_DAYS of the cutoff, or for a missed one, on active jobs whose work is
//   not complete (the retainage reminder covers those).
import type { PayAppStatus } from "./enums";

export const BILLING_CUTOFF_REMINDER_DAYS = 7;

const DAY_MS = 86_400_000;

export interface BillingCutoffAppInput {
  number: number;
  status: PayAppStatus;
  /** YYYY-MM-DD. */
  applicationDate: string;
  /** The UTC day it was submitted (left draft), or null for a draft. */
  submittedOn: string | null;
}

export interface BillingCutoff {
  /** The job's cutoff day, 1-31. */
  day: number;
  /** This cycle's cutoff: the first one on or after the report date. */
  dueOn: string;
  /** Whole days from the report date to dueOn (0 on the day). */
  daysLeft: number;
  /** The cutoff before dueOn: applications sent after it count for this cycle. */
  previousOn: string;
  /** The latest application sent this cycle, or null. */
  sent: { number: number; on: string } | null;
  /** The earliest unsent draft, or null. */
  draft: { number: number; applicationDate: string } | null;
  /** The previous cutoff passed with this draft unsent and nothing else sent in its cycle. */
  missed: { number: number; applicationDate: string; cutoffOn: string } | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The cutoff in a month (month 1-12): the day, or the month's last day when it is shorter. */
export function cutoffInMonth(year: number, month: number, day: number): string {
  const d = Math.min(day, daysInMonth(year, month));
  return `${year}-${pad(month)}-${pad(d)}`;
}

/** Shift a (year, month) pair by n months. */
function shiftMonth(year: number, month: number, n: number): [number, number] {
  const i = year * 12 + (month - 1) + n;
  return [Math.floor(i / 12), (i % 12) + 1];
}

/** This cycle's cutoff (the first on or after asOf) and the one before it. */
export function cutoffsAround(
  asOf: string,
  day: number,
): { previousOn: string; dueOn: string; beforeOn: string } {
  const year = Number(asOf.slice(0, 4));
  const month = Number(asOf.slice(5, 7));
  let [y, m] = [year, month];
  if (cutoffInMonth(y, m, day) < asOf) [y, m] = shiftMonth(y, m, 1);
  const [py, pm] = shiftMonth(y, m, -1);
  const [by, bm] = shiftMonth(y, m, -2);
  return {
    dueOn: cutoffInMonth(y, m, day),
    previousOn: cutoffInMonth(py, pm, day),
    beforeOn: cutoffInMonth(by, bm, day),
  };
}

const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Parse the cutoff day typed on the job page: "" clears it (null); undefined when invalid. */
export function parseBillingDay(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,2}$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 && n <= 31 ? n : undefined;
}

/** "the 25th", "the 1st", "the last day" (31). */
export function billingDayPhrase(day: number): string {
  if (day >= 31) return "the last day";
  const mod100 = day % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  return `the ${day}${suffix}`;
}

export function billingCutoff(
  day: number,
  apps: readonly BillingCutoffAppInput[],
  asOf: string,
): BillingCutoff {
  const { dueOn, previousOn, beforeOn } = cutoffsAround(asOf, day);
  const sentIn = (after: string, upTo: string) =>
    apps
      .filter(
        (a) =>
          a.status !== "draft" &&
          a.submittedOn !== null &&
          a.submittedOn > after &&
          a.submittedOn <= upTo,
      )
      .sort((x, y) => y.number - x.number)[0] ?? null;
  const thisCycle = sentIn(previousOn, dueOn);
  const drafts = apps
    .filter((a) => a.status === "draft")
    .sort((x, y) => x.number - y.number || x.applicationDate.localeCompare(y.applicationDate));
  const draft = drafts[0] ?? null;
  const lateDraft = drafts.find((a) => a.applicationDate <= previousOn) ?? null;
  const missed =
    lateDraft && !sentIn(beforeOn, previousOn) && !thisCycle
      ? {
          number: lateDraft.number,
          applicationDate: lateDraft.applicationDate,
          cutoffOn: previousOn,
        }
      : null;
  return {
    day,
    dueOn,
    daysLeft: daysFrom(asOf, dueOn),
    previousOn,
    sent: thisCycle?.submittedOn ? { number: thisCycle.number, on: thisCycle.submittedOn } : null,
    draft: draft ? { number: draft.number, applicationDate: draft.applicationDate } : null,
    missed,
  };
}

const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/** The job page's one line about the cutoff ("Next cutoff Dec 25 (in 3 days): #4 sent Dec 20"). */
export function billingCutoffStatus(c: BillingCutoff): string {
  const head = `Next cutoff ${c.dueOn} (${inDays(c.daysLeft)})`;
  if (c.sent) return `${head}: application #${c.sent.number} sent on ${c.sent.on}.`;
  if (c.missed) {
    return `${head}. Application #${c.missed.number} missed the ${c.missed.cutoffOn} cutoff: submit it now.`;
  }
  if (c.draft) return `${head}: draft #${c.draft.number} not submitted yet.`;
  return `${head}: no draft started yet.`;
}

/**
 * The next step for the cash page and the weekly email, or null when none is due: within
 * BILLING_CUTOFF_REMINDER_DAYS of a cutoff with nothing sent this cycle, or a missed cutoff.
 */
export function billingCutoffText(c: BillingCutoff, gcName: string): string | null {
  if (c.missed) {
    return `Application #${c.missed.number} (dated ${c.missed.applicationDate}) was not submitted by the billing cutoff on ${c.missed.cutoffOn} (${gcName} takes applications by ${billingDayPhrase(c.day)} of the month). A late application often waits for the next cycle: submit it now and ask ${gcName} whether it can still go in this month's draw. The next cutoff is ${c.dueOn}.`;
  }
  if (c.sent || c.daysLeft > BILLING_CUTOFF_REMINDER_DAYS) return null;
  const when = `${inDays(c.daysLeft)}, ${c.dueOn}`;
  return c.draft
    ? `Pay application due to ${gcName} ${when} (cutoff ${billingDayPhrase(c.day)} of the month): draft #${c.draft.number} is not submitted yet.`
    : `Pay application due to ${gcName} ${when} (cutoff ${billingDayPhrase(c.day)} of the month): no draft started yet. If there is work or stored material to bill this period, start the application now.`;
}
