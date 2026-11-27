// The CoConstruct cut-off date and a countdown for coconstruct-alternatives.html.
// Source: https://www.coconstruct.com/migration, read 2026-11-27: "Projects can still be added
// through March 31, 2027"; after that "new projects can no longer be added into CoConstruct" and
// existing projects stay readable as history.
export const LAST_DAY = "2027-03-31";

/** Whole days from `today` (YYYY-MM-DD) to the last day new projects can be added, inclusive of neither end. */
export function daysLeft(today, last = LAST_DAY) {
  const d = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) throw new Error(`not a date: ${s}`);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  };
  return Math.round((d(last) - d(today)) / 86400000);
}

/** One sentence for the page, from today's date. */
export function countdown(today, last = LAST_DAY) {
  const n = daysLeft(today, last);
  if (n > 1) return `${n} days left to add new projects in CoConstruct (the last day is 31 March 2027).`;
  if (n === 1) return "One day left to add new projects in CoConstruct: the last day is tomorrow, 31 March 2027.";
  if (n === 0) return "Today, 31 March 2027, is the last day new projects can be added in CoConstruct.";
  return "New projects can no longer be added in CoConstruct (the last day was 31 March 2027). Existing projects stay readable as history.";
}

/** Can a job that starts on `start` still be set up in CoConstruct? */
export function canStartInCoConstruct(start, last = LAST_DAY) {
  return daysLeft(start, last) >= 0;
}
