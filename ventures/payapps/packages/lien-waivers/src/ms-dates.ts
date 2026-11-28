// Mississippi's computation of time for the lien article, Miss. Code Ann. § 85-7-425: "the
// computation of time under this article shall be determined pursuant to Section 1-3-67". Its own
// module with no imports and no form text, so a browser bundle can import it alone (apps/payapps
// aliases it as "@lien-waivers/ms-dates"), as tx-dates.ts does for Texas.
//
// § 1-3-67, as read (sources/ms-1-3-67-and-3-3-7.txt):
// - the day of the act or event the period runs from is not counted;
// - the last day counts unless it is "a Saturday, a Sunday or a legal holiday, or any other day when
//   the courthouse or the clerk's office is in fact closed", in which event the period runs to the
//   end of the next day that is none of those;
// - a period "less than seven (7) days" also leaves out the Saturdays, Sundays and legal holidays in
//   between.
//
// Legal holidays are § 3-3-7(1)'s ten, on the days it names, and a holiday on a Sunday makes the
// Monday one. Thanksgiving is "fixed to correspond to the date proclaimed by the President", which
// is the fourth Thursday of November (5 U.S.C. § 6103(a)); counted as that day. Not counted, because
// PayApps cannot know them: the one day a county or city may declare instead of a holiday
// (§ 3-3-7(2), Mardi Gras on the coast), and any other day a clerk's office is closed. Each of those
// can only make the true last day later than the one computed here, never earlier, so the date this
// module gives is never past the statute's. Checked in test/ms-dates.test.ts. Not legal advice.

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(iso: string): number {
  const m = ISO_DATE.exec(iso);
  const t = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
  if (!m || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== iso) {
    throw new RangeError(`Not a date (YYYY-MM-DD): ${iso}`);
  }
  return t;
}

const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The `nth` (1-based) `weekday` (0 Sunday) of month `m` (1-12), as a day of the month. */
function nthWeekday(y: number, m: number, weekday: number, nth: number): number {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
}

/** The last `weekday` of month `m`, as a day of the month. */
function lastWeekday(y: number, m: number, weekday: number): number {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, days)).getUTCDay();
  return days - ((last - weekday + 7) % 7);
}

/** § 3-3-7(1)'s holidays for year `y`, before the Sunday rule: [month, day, name]. */
function namedHolidays(y: number): [number, number, string][] {
  return [
    [1, 1, "New Year's Day"],
    [
      1,
      nthWeekday(y, 1, 1, 3),
      "Robert E. Lee's birthday and Dr. Martin Luther King, Jr.'s birthday",
    ],
    [2, nthWeekday(y, 2, 1, 3), "Washington's birthday"],
    [4, lastWeekday(y, 4, 1), "Confederate Memorial Day"],
    [5, lastWeekday(y, 5, 1), "National Memorial Day and Jefferson Davis' birthday"],
    [7, 4, "Independence Day"],
    [9, nthWeekday(y, 9, 1, 1), "Labor Day"],
    [11, 11, "Armistice or Veterans' Day"],
    [11, nthWeekday(y, 11, 4, 4), "Thanksgiving Day"],
    [12, 25, "Christmas Day"],
  ];
}

/**
 * Miss. Code Ann. § 3-3-7(1): the name of the legal holiday on `day` (YYYY-MM-DD), or null. A
 * holiday that falls on a Sunday makes the next day the holiday ("(observed)").
 */
export function msLegalHoliday(day: string): string | null {
  const t = parseDate(day);
  const y = new Date(t).getUTCFullYear();
  const found: string[] = [];
  // No holiday is on 31 December, so the Sunday rule never carries one into the next year.
  for (const [m, d, name] of namedHolidays(y)) {
    const h = Date.UTC(y, m - 1, d);
    if (h === t) found.push(name);
    else if (new Date(h).getUTCDay() === 0 && h + DAY_MS === t) found.push(`${name} (observed)`);
  }
  return found.length ? found.join(" and ") : null;
}

/** Whether § 1-3-67 skips `day`: a Saturday, a Sunday or a § 3-3-7(1) legal holiday. */
export function msClosedDay(day: string): boolean {
  const w = new Date(parseDate(day)).getUTCDay();
  return w === 0 || w === 6 || msLegalHoliday(day) !== null;
}

export interface MsPeriod {
  /** The day the period runs from (not counted). */
  from: string;
  days: number;
  /** `from` plus `days` calendar days: the date a plain count gives. */
  calendarEnd: string;
  /** The last day under § 1-3-67, never earlier than `calendarEnd`. */
  lastDay: string;
  /** Whether `lastDay` differs from `calendarEnd`. */
  moved: boolean;
  /** The legal holidays § 1-3-67 skipped, by name; empty when only weekends (or nothing) were. */
  holidays: string[];
}

/**
 * The last day of a period of `days` days running from `from` (YYYY-MM-DD), counted under
 * § 1-3-67 as § 85-7-425 requires: `from` is not counted; under seven days the Saturdays, Sundays
 * and legal holidays in between are left out; and a last day on any of them moves to the next day
 * that is none of them.
 */
export function msPeriodEnd(from: string, days: number): MsPeriod {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`Not a number of days: ${days}`);
  const start = parseDate(from);
  const calendarEnd = isoOf(start + days * DAY_MS);
  const holidays: string[] = [];
  const note = (t: number) => {
    const h = msLegalHoliday(isoOf(t));
    if (h && !holidays.includes(h)) holidays.push(h);
  };
  let t = start;
  if (days < 7) {
    let counted = 0;
    while (counted < days) {
      t += DAY_MS;
      if (msClosedDay(isoOf(t))) note(t);
      else counted += 1;
    }
  } else {
    t = start + days * DAY_MS;
    while (msClosedDay(isoOf(t))) {
      note(t);
      t += DAY_MS;
    }
  }
  const lastDay = isoOf(t);
  return { from, days, calendarEnd, lastDay, moved: lastDay !== calendarEnd, holidays };
}
