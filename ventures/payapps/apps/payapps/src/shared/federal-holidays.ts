// The eleven legal public holidays of 5 U.S.C. § 6103(a), each on the day OPM observes it when it
// falls on a weekend: a Saturday holiday is kept the Friday before, a Sunday one the Monday after
// (opm.gov, "Federal Holidays"). Used two ways: the job schedule offers them as a starting list of
// company holidays the contractor edits (nothing here says a company must close), and the lien and
// bond deadlines step their act-by date back past them, since a county recorder or a court clerk is
// usually closed on them. No imports, so any shared module can use it without an import cycle.

/** One holiday: its ISO date (YYYY-MM-DD) and its name. */
export interface FederalHoliday {
  on: string;
  name: string;
}

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");

/** The `n`th (1-based) `dow` (0 Sunday .. 6 Saturday) of a month; n = -1 is the last one. */
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  const iso = (d: number) => `${year}-${pad(month)}-${pad(d)}`;
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

function federalHolidaysOfYear(year: number): FederalHoliday[] {
  const fixed = (m: number, d: number) => observed(`${year}-${pad(m)}-${pad(d)}`);
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
export function federalHolidays(year: number): FederalHoliday[] {
  const y = String(year);
  return [...federalHolidaysOfYear(year), ...federalHolidaysOfYear(year + 1)]
    .filter((h) => h.on.startsWith(y))
    .sort((a, b) => a.on.localeCompare(b.on));
}

const cache = new Map<number, Map<string, string>>();

/** The federal holiday observed on `iso`, by name, or null. */
export function federalHolidayOn(iso: string): string | null {
  const year = Number(iso.slice(0, 4));
  let m = cache.get(year);
  if (!m) {
    m = new Map(federalHolidays(year).map((h) => [h.on, h.name]));
    cache.set(year, m);
  }
  return m.get(iso) ?? null;
}

/**
 * The last day on or before `iso` that is neither a weekend nor an observed federal holiday: the
 * safe act-by date for a deadline whose statute may or may not roll to the next business day. Also
 * returns the holidays stepped over (newest first), so the page can say why the date moved.
 */
export function actByOnOrBefore(iso: string): { on: string; holidays: string[] } {
  let d = iso;
  const holidays: string[] = [];
  for (;;) {
    const w = weekday(d);
    if (w === 0 || w === 6) {
      d = addDays(d, -1);
      continue;
    }
    const h = federalHolidayOn(d);
    if (!h) return { on: d, holidays };
    holidays.push(h);
    d = addDays(d, -1);
  }
}

/**
 * Why a deadline's act-by date is earlier than the statute's date, in words that finish "the
 * statute's date, X, is ...": "a weekend", "Thanksgiving Day, a federal holiday", or "a weekend, and
 * Independence Day comes just before it". Null when the date did not move.
 */
export function actByReason(statutoryOn: string): string | null {
  const { on, holidays } = actByOnOrBefore(statutoryOn);
  if (on === statutoryOn) return null;
  const w = weekday(statutoryOn);
  const names = [...holidays].reverse();
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  if (w === 0 || w === 6) {
    return names.length
      ? `a weekend, and ${list} ${names.length > 1 ? "come" : "comes"} just before it`
      : "a weekend";
  }
  return `${list}, a federal holiday${names.length > 1 ? " (with the days before it)" : ""}`;
}
