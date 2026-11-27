// The 1040-ES reminder email (services/books/estimate-reminders.ts): which due date a reminder is for on a
// given day. A reminder goes out once per due date, on the first daily run from REMINDER_LEAD_DAYS before
// it through the date itself, so a run missed by the cron (or an opt-in made three days before) still
// reminds. The January date belongs to the tax year before (Form 1040-ES, fourth payment).
import { estimatedDueDates } from "./estimated-tax";

/** How many days before a due date the reminder may go out. */
export const REMINDER_LEAD_DAYS = 7;

/** The hour (UTC) of the daily run in wrangler.jsonc: 14:00 UTC is morning in every US time zone. */
export const REMINDER_SEND_HOUR_UTC = 14;

export interface ReminderTarget {
  /** The due date, YYYY-MM-DD (moved off weekends and DC holidays, as estimatedDueDates does). */
  due: string;
  /** The tax year the payment is for. */
  year: number;
  /** 0..3: April, June, September, January (the index into the estimate's rows and `paid`). */
  quarter: number;
  /** Whole days from `today` to the due date (0 on the day itself). */
  daysLeft: number;
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

/** The next due date on or after `today` (YYYY-MM-DD), whichever tax year it belongs to. */
export function nextDueDate(today: string): ReminderTarget {
  const y = Number(today.slice(0, 4));
  const candidates = [
    ...estimatedDueDates(y - 1).map((due, quarter) => ({ due, year: y - 1, quarter })),
    ...estimatedDueDates(y).map((due, quarter) => ({ due, year: y, quarter })),
  ];
  const next = candidates.find((c) => c.due >= today);
  // The year's own January date is always later than any date in it, so `next` is always found.
  if (!next) throw new Error(`no due date after ${today}`);
  return { ...next, daysLeft: dayNum(next.due) - dayNum(today) };
}

/** The due date a reminder is for today, or null when the next one is more than the lead time away. */
export function reminderTarget(today: string): ReminderTarget | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const next = nextDueDate(today);
  return next.daysLeft <= REMINDER_LEAD_DAYS ? next : null;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "April 15, 2026". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

const ORDINALS = ["first", "second", "third", "fourth"];

/** "the second 2026 estimated payment". */
export function paymentName(t: Pick<ReminderTarget, "year" | "quarter">): string {
  return `the ${ORDINALS[t.quarter] ?? ""} ${t.year} estimated payment`;
}

/** "in 7 days", "tomorrow", "today". */
export function whenText(daysLeft: number): string {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}
