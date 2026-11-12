// Days off for the daily run's retry and shift dates (added 2026-11-12). A call that rang out on the Wednesday before
// Thanksgiving should come back on Friday, not on Thursday when nobody picks up.
//
// holidayChecker(spec) takes "us" (the eleven US federal holidays, as 5 U.S.C. 6103 lists them, with the OPM
// weekend rule: a Saturday holiday is observed on the Friday before, a Sunday one on the Monday after), "us-business"
// (the six most US businesses close for: New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving and
// Christmas, same weekend rule), dates (YYYY-MM-DD), or any mix separated by commas, spaces or new lines. It returns a
// function day => true when that day is off. Years are worked out on demand, so there is no last year.
//
// The holiday rules were written from the statute's list as commonly published, not read against the U.S. Code text
// in this session (opm.gov answered 403 through this host's proxy on 2026-11-12). holidays.test.mjs pins the 2026 and
// 2027 dates the rules give; check them against opm.gov's calendar before relying on them.

const ymd = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m, d)).getUTCDay();
// The nth weekday w (0 = Sunday) of month m; n = -1 is the last one.
function nth(y, m, w, n) {
  if (n > 0) { const first = dow(y, m, 1); return 1 + ((w - first + 7) % 7) + (n - 1) * 7; }
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), last = dow(y, m, days);
  return days - ((last - w + 7) % 7);
}
// A fixed-date holiday on a weekend is observed on the nearest weekday (Saturday -> Friday, Sunday -> Monday).
function observed(y, m, d) {
  const t = Date.UTC(y, m, d), w = new Date(t).getUTCDay();
  const o = new Date(t + (w === 6 ? -1 : w === 0 ? 1 : 0) * 864e5);
  return ymd(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate());
}

/** The US federal holidays observed in year y, as { date, name }, in date order. */
export function usFederalHolidays(y) {
  return [
    { date: observed(y, 0, 1), name: "New Year's Day" },
    { date: ymd(y, 0, nth(y, 0, 1, 3)), name: "Birthday of Martin Luther King, Jr." },
    { date: ymd(y, 1, nth(y, 1, 1, 3)), name: "Washington's Birthday" },
    { date: ymd(y, 4, nth(y, 4, 1, -1)), name: "Memorial Day" },
    { date: observed(y, 5, 19), name: "Juneteenth National Independence Day" },
    { date: observed(y, 6, 4), name: "Independence Day" },
    { date: ymd(y, 8, nth(y, 8, 1, 1)), name: "Labor Day" },
    { date: ymd(y, 9, nth(y, 9, 1, 2)), name: "Columbus Day" },
    { date: observed(y, 10, 11), name: "Veterans Day" },
    { date: ymd(y, 10, nth(y, 10, 4, 4)), name: "Thanksgiving Day" },
    { date: observed(y, 11, 25), name: "Christmas Day" },
  ];
}

const BUSINESS = new Set(["New Year's Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas Day"]);
/** The six holidays most US businesses close for, observed in year y. */
export const usBusinessHolidays = (y) => usFederalHolidays(y).filter((h) => BUSINESS.has(h.name));

/** spec (see top of file), or an array of dates, or a Set, or a function -> (day YYYY-MM-DD) => boolean. */
export function holidayChecker(spec) {
  if (typeof spec === "function") return spec;
  if (!spec) return () => false;
  const parts = spec instanceof Set ? [...spec] : Array.isArray(spec) ? spec : String(spec).split(/[\s,;]+/);
  const dates = new Set(), sets = [];
  for (const raw of parts) {
    const p = String(raw).trim().toLowerCase();
    if (!p) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) dates.add(p);
    else if (p === "us" || p === "us-federal") sets.push(usFederalHolidays);
    else if (p === "us-business") sets.push(usBusinessHolidays);
    else throw new Error(`holidays: "${raw}" is not a date (YYYY-MM-DD), "us" or "us-business"`);
  }
  const cache = new Map();
  const year = (y) => { if (!cache.has(y)) cache.set(y, new Set(sets.flatMap((f) => f(y).map((h) => h.date)))); return cache.get(y); };
  // An observed Friday holiday can fall in the year before (New Year's Day on a Saturday), so look at y + 1 as well.
  return (day) => { const d = String(day).slice(0, 10), y = Number(d.slice(0, 4)); return dates.has(d) || (sets.length > 0 && (year(y).has(d) || year(y + 1).has(d))); };
}
