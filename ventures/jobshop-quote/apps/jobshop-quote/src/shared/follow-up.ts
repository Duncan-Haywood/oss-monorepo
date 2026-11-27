// Quote follow-up (bets.md, bet #2's growth path: "quote follow-up and win rates"). A sent quote is
// due for a follow-up a few days after it goes out; the estimator logs what happened and picks the
// next day (or none) until the quote is won, lost or expires. Pure, so the dates and the email's
// wording are tested without a database (services/quotes/follow-ups.ts does the reads and writes).
//
// Dates are shop days (YYYY-MM-DD on the shop's own calendar, shared/time-zone.ts), compared as
// strings, like valid-until.

import { formatMoney } from "./currency";
import { oneLine } from "./quote-email";
import { quoteLabel } from "./quote-label";
import { addDays } from "./time-zone";

/** The shop's "first follow-up N days after sending" ranges from 0 (off) to this. */
export const MAX_FOLLOW_UP_DAYS = 60;
/** Default for a new shop: three days, the gap most quoting guides give for the first call. */
export const DEFAULT_FOLLOW_UP_DAYS = 3;
/** A logged follow-up's note, plain text. */
export const MAX_FOLLOW_UP_NOTE = 1000;
/** The next follow-up may be set at most this many days ahead of the shop's today. */
export const MAX_NEXT_FOLLOW_UP_DAYS = 180;
/** "Next follow-up in ..." choices the forms offer (any date is accepted too). */
export const NEXT_FOLLOW_UP_PRESETS = [1, 2, 3, 7, 14] as const;
/** Quotes listed in one email; the rest are counted ("and 3 more"). */
export const MAX_FOLLOW_UPS_LISTED = 30;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day in YYYY-MM-DD (2031-02-30 is not). */
export function isShopDayString(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * A Saturday or Sunday moves to the Monday after: a buyer is rarely at their desk at a weekend, and
 * the morning email should not ask the estimator to call one then.
 */
export function nextWeekday(day: string): string {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w === 6 ? addDays(day, 2) : w === 0 ? addDays(day, 1) : day;
}

/**
 * The first follow-up day of a quote sent on `sentDay`: the shop's days later, moved off a weekend
 * to the Monday; null when the shop turned it off (0).
 */
export function firstFollowUpOn(sentDay: string, followUpDays: number): string | null {
  if (!Number.isInteger(followUpDays) || followUpDays <= 0) return null;
  return nextWeekday(addDays(sentDay, Math.min(followUpDays, MAX_FOLLOW_UP_DAYS)));
}

/** Due when the quote is still out (sent) and its follow-up day has come. */
export function isFollowUpDue(
  q: { status: string; followUpOn: string | null },
  today: string,
): boolean {
  return q.status === "sent" && q.followUpOn !== null && q.followUpOn <= today;
}

/**
 * Checks a logged follow-up's next day: null (no more follow-ups) or a real day after today and at
 * most MAX_NEXT_FOLLOW_UP_DAYS ahead. Returns the error to show, or null when it is fine.
 */
export function nextFollowUpError(nextOn: string | null, today: string): string | null {
  if (nextOn === null) return null;
  if (!isShopDayString(nextOn)) return "Pick the next follow-up day as a date (YYYY-MM-DD)";
  if (nextOn <= today) return `Pick a day after today (${today}), or "No more follow-ups"`;
  if (nextOn > addDays(today, MAX_NEXT_FOLLOW_UP_DAYS)) {
    return `Pick a day within ${MAX_NEXT_FOLLOW_UP_DAYS} days`;
  }
  return null;
}

/** "today", "1 day overdue", "4 days overdue" for a due quote. */
export function dueLabel(followUpOn: string, today: string): string {
  const late = daysBetween(followUpOn, today);
  if (late <= 0) return "due today";
  return `${late} day${late === 1 ? "" : "s"} overdue`;
}

export interface FollowUpDigestQuote {
  id: string;
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  customerContact: string | null;
  customerEmail: string | null;
  headlineTotalCents: number | null;
  /** The shop day it was sent. */
  sentDay: string | null;
  followUpOn: string;
  /** The newest logged follow-up's note and shop day, if any. */
  lastNote: string | null;
  lastDay: string | null;
}

/** The morning email listing an estimator's own sent quotes that are due for a follow-up. */
export function followUpDigestEmail(f: {
  appUrl: string;
  orgId: string;
  shopName: string;
  today: string;
  quotes: FollowUpDigestQuote[];
  currency?: string | null;
}): { subject: string; text: string } {
  const base = f.appUrl.replace(/\/+$/, "");
  const org = encodeURIComponent(f.orgId);
  // Longest overdue first, then by quote number.
  const sorted = [...f.quotes].sort(
    (a, b) => a.followUpOn.localeCompare(b.followUpOn) || a.quoteNumber - b.quoteNumber,
  );
  const listed = sorted.slice(0, MAX_FOLLOW_UPS_LISTED);
  const lines: string[] = [];
  for (const q of listed) {
    const who = [q.customerContact, q.customerEmail]
      .filter((s): s is string => Boolean(s?.trim()))
      .map((s) => oneLine(s, 120))
      .join(", ");
    const total =
      q.headlineTotalCents === null ? "" : `, ${formatMoney(q.headlineTotalCents, f.currency)}`;
    const sent =
      q.sentDay === null ? "" : `sent ${q.sentDay} (${daysBetween(q.sentDay, f.today)} days ago), `;
    lines.push(
      `- ${quoteLabel(q.quoteNumber, q.revNumber)} for ${oneLine(q.customerCompany, 120)}${who ? ` (${who})` : ""}${total}: ${sent}${dueLabel(q.followUpOn, f.today)}`,
    );
    if (q.lastNote?.trim()) {
      lines.push(`  Last note${q.lastDay ? ` (${q.lastDay})` : ""}: ${oneLine(q.lastNote, 160)}`);
    }
    lines.push(`  ${base}/app/${org}/quotes/${encodeURIComponent(q.id)}`);
  }
  if (sorted.length > listed.length) {
    lines.push(`- and ${sorted.length - listed.length} more on the quote log`);
  }
  const first = sorted[0];
  const subject =
    sorted.length === 1 && first
      ? `Follow up on ${quoteLabel(first.quoteNumber, first.revNumber)} for ${oneLine(first.customerCompany, 60)}`
      : `${sorted.length} quotes to follow up on`;
  const text = [
    sorted.length === 1
      ? `A quote you sent from ${oneLine(f.shopName, 80)} is due for a follow-up:`
      : `${sorted.length} quotes you sent from ${oneLine(f.shopName, 80)} are due for a follow-up:`,
    "",
    ...lines,
    "",
    "When you have called or written, log it on the quote log or the quote page and pick the next",
    "follow-up day (or no more), so this list keeps to the quotes that still need you. Mark the",
    "quote won or lost once the customer decides.",
    "",
    "Totals are the smallest-quantity price of each line, as on the quote log.",
    "",
    "You get this because you sent these quotes. Turn these emails off on the quote log:",
    `${base}/app/${org}`,
  ].join("\n");
  return { subject: oneLine(subject, 160), text };
}
