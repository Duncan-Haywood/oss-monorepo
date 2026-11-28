// Calendar-day arithmetic on YYYY-MM-DD dates for the affidavit-of-nonpayment clocks
// (ga-affidavit.ts, ms-affidavit.ts). No imports, so a browser bundle can take it alone.
//
// Strict on purpose: a deadline counted from a date that is not one must fail loudly. The helpers
// these replaced fell back to year 0 (which Date.UTC reads as 1900), month 1 or day 1 for a short
// string, rolled "2026-02-30" over to 2 March, and turned "12/01/2026" into NaN; each came back as
// a clock saying the period had not ended (red team, 2026-11-28).

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC of `iso`, or a RangeError when it is not a real YYYY-MM-DD date. */
export function isoDayMs(iso: string): number {
  const m = ISO_DATE.exec(iso);
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
  if (!m || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) {
    throw new RangeError(`Not a date (YYYY-MM-DD): ${iso}`);
  }
  return t;
}

/** `iso` plus `days` calendar days. */
export function addDaysIso(iso: string, days: number): string {
  return new Date(isoDayMs(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar days from `from` to `to`: positive when `to` is later. */
export function daysFrom(from: string, to: string): number {
  return Math.round((isoDayMs(to) - isoDayMs(from)) / DAY_MS);
}
