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
//
// UK bank holidays (added 2026-11-12): "gb-eng" (England and Wales; "gb", "uk" and "gb-wls" mean the same), "gb-sct"
// (Scotland) and "gb-nir" (Northern Ireland). Unlike the US rules these ARE checked against the government's own list:
// holidays.test.mjs compares every year 2019-2028 with GOV.UK's bank-holidays.json (fetched 2026-11-12, kept in
// fixtures/), all three divisions, date for date. One-off holidays set by royal proclamation (the 2022 jubilee, the
// 2023 coronation, Scotland's 2026 World Cup day) cannot come from a rule, so the known ones are listed in GB_ONE_OFF; a new one needs adding there.
//
// Canada (added 2026-11-12, later): "ca" (or "ca-federal"), the twelve federal holidays; see caFederalHolidays for
// what is in it and how far it is checked (a second source, not canada.ca).

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

// Easter Sunday (Gregorian), as [month index, day]: the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}
const shift = (y, m, d, n) => { const o = new Date(Date.UTC(y, m, d + n)); return ymd(o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate()); };

// One-off UK changes by proclamation, from GOV.UK's list. move: a regular holiday moved to another day; add: an extra one.
const GB_ONE_OFF = {
  2020: { move: { "2020-05-04": "2020-05-08" }, add: [] }, // early May bank holiday moved to VE Day's 75th anniversary
  2022: { move: { "2022-05-30": "2022-06-02" }, add: [["2022-06-03", "Platinum Jubilee bank holiday"], ["2022-09-19", "Bank Holiday for the State Funeral of Queen Elizabeth II"]] },
  2023: { move: {}, add: [["2023-05-08", "Bank holiday for the coronation of King Charles III"]] },
  2026: { move: {}, add: [["2026-06-15", "World Cup bank holiday", "sct"]] }, // Scotland only
};

/** UK bank holidays in year y for a division ("eng" England and Wales, "sct" Scotland, "nir" Northern Ireland), as
 * { date, name } in date order. Fixed-date ones that fall on a weekend, or on a day another holiday already took, move
 * to the next free weekday (so Christmas on a Saturday is kept on Monday 27th and Boxing Day on Tuesday 28th). */
export function gbBankHolidays(y, division = "eng") {
  if (!["eng", "sct", "nir"].includes(division)) throw new Error(`gbBankHolidays: unknown division "${division}"`);
  const fixed = [];
  fixed.push([0, 1, "New Year's Day"]);
  if (division === "sct") fixed.push([0, 2, "2nd January"]);
  if (division === "nir") fixed.push([2, 17, "St Patrick's Day"]);
  if (division === "nir") fixed.push([6, 12, "Battle of the Boyne (Orangemen's Day)"]);
  if (division === "sct") fixed.push([10, 30, "St Andrew's Day"]);
  fixed.push([11, 25, "Christmas Day"], [11, 26, "Boxing Day"]);
  const [em, ed] = easter(y);
  const out = [
    { date: shift(y, em, ed, -2), name: "Good Friday" },
    ...(division === "sct" ? [] : [{ date: shift(y, em, ed, 1), name: "Easter Monday" }]),
    { date: ymd(y, 4, nth(y, 4, 1, 1)), name: "Early May bank holiday" },
    { date: ymd(y, 4, nth(y, 4, 1, -1)), name: "Spring bank holiday" },
    division === "sct" ? { date: ymd(y, 7, nth(y, 7, 1, 1)), name: "Summer bank holiday" } : { date: ymd(y, 7, nth(y, 7, 1, -1)), name: "Summer bank holiday" },
  ];
  const taken = new Set(out.map((h) => h.date));
  for (const [m, d, name] of fixed) {
    let n = 0, date = ymd(y, m, d);
    while ([0, 6].includes(dow(y, m, d + n)) || taken.has(date)) date = shift(y, m, d, ++n);
    taken.add(date);
    out.push({ date, name: n ? `${name} (substitute day)` : name });
  }
  const one = GB_ONE_OFF[y];
  if (one) {
    for (const h of out) if (one.move[h.date]) h.date = one.move[h.date];
    for (const [date, name, only] of one.add) if (!only || only === division) out.push({ date, name });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Canada's federal holidays in year y (added 2026-11-12, later): the twelve the federal public service gets (the
 * Canada Labour Code's ten general holidays plus Easter Monday and the Civic Holiday), as { date, name }. Weekend ones
 * move to the next free weekday, as in the UK (Saturday 1 July 2028 is kept on Monday 3 July). Provinces differ and
 * are not here. Checked against the observed dates canada-holidays.ca lists for 2022-2028 (fixtures/), an open-source
 * site, not the Government of Canada: canada.ca timed out from this host on 2026-11-12. */
export function caFederalHolidays(y) {
  const [em, ed] = easter(y);
  const out = [
    { date: shift(y, em, ed, -2), name: "Good Friday" }, { date: shift(y, em, ed, 1), name: "Easter Monday" },
    { date: ymd(y, 4, 24 - ((dow(y, 4, 24) + 6) % 7)), name: "Victoria Day" }, // the Monday on or before 24 May
    { date: ymd(y, 7, nth(y, 7, 1, 1)), name: "Civic Holiday" }, { date: ymd(y, 8, nth(y, 8, 1, 1)), name: "Labour Day" },
    { date: ymd(y, 9, nth(y, 9, 1, 2)), name: "Thanksgiving" },
  ];
  const fixed = [[0, 1, "New Year's Day"], [6, 1, "Canada Day"], ...(y >= 2021 ? [[8, 30, "National Day for Truth and Reconciliation"]] : []), [10, 11, "Remembrance Day"], [11, 25, "Christmas Day"], [11, 26, "Boxing Day"]];
  const taken = new Set(out.map((h) => h.date));
  for (const [m, d, name] of fixed) {
    let n = 0, date = ymd(y, m, d);
    while ([0, 6].includes(dow(y, m, d + n)) || taken.has(date)) date = shift(y, m, d, ++n);
    taken.add(date);
    out.push({ date, name: n ? `${name} (observed)` : name });
  }
  if (y === 2022) out.push({ date: "2022-09-19", name: "Day of Mourning for Queen Elizabeth II" });
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const GB_DIVISIONS = { gb: "eng", uk: "eng", "gb-eng": "eng", "gb-wls": "eng", "gb-sct": "sct", "gb-nir": "nir" };

const BUSINESS = new Set(["New Year's Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas Day"]);
/** The six holidays most US businesses close for, observed in year y. */
export const usBusinessHolidays = (y) => usFederalHolidays(y).filter((h) => BUSINESS.has(h.name));

function parseSpec(spec) {
  const parts = spec instanceof Set ? [...spec] : Array.isArray(spec) ? spec : String(spec).split(/[\s,;]+/);
  const dates = new Set(), sets = [];
  for (const raw of parts) {
    const p = String(raw).trim().toLowerCase();
    if (!p) continue;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) dates.add(p);
    else if (preset(p)) sets.push(preset(p));
    else throw new Error(`holidays: "${raw}" is not a date (YYYY-MM-DD), "us", "us-business", "gb-eng", "gb-sct", "gb-nir" or "ca"`);
  }
  return { dates, sets };
}

/** A named preset as (year) => [{ date, name }], or null. */
function preset(p) {
  if (p === "us" || p === "us-federal") return usFederalHolidays;
  if (p === "us-business") return usBusinessHolidays;
  if (p === "ca" || p === "ca-federal") return caFederalHolidays;
  if (GB_DIVISIONS[p]) { const div = GB_DIVISIONS[p]; return (y) => gbBankHolidays(y, div); }
  return null;
}

/** The next n days off on or after from (YYYY-MM-DD), as [{ date, name }], so a page can show what a spec means
 * ("gb-nir" is St Patrick's Day and the Twelfth). A plain date is named "day off". Throws on a bad spec. */
export function upcomingHolidays(spec, from, n = 5) {
  if (!spec || typeof spec === "function") return [];
  const { dates, sets } = parseSpec(spec), y = Number(String(from).slice(0, 4)), seen = new Map();
  for (const d of dates) if (d >= from) seen.set(d, "day off");
  for (const yy of [y, y + 1, y + 2]) for (const f of sets) for (const h of f(yy)) if (h.date >= from && !seen.has(h.date)) seen.set(h.date, h.name);
  return [...seen].sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(0, n).map(([date, name]) => ({ date, name }));
}

/** spec (see top of file), or an array of dates, or a Set, or a function -> (day YYYY-MM-DD) => boolean. */
export function holidayChecker(spec) {
  if (typeof spec === "function") return spec;
  if (!spec) return () => false;
  const { dates, sets } = parseSpec(spec);
  const cache = new Map();
  const year = (y) => { if (!cache.has(y)) cache.set(y, new Set(sets.flatMap((f) => f(y).map((h) => h.date)))); return cache.get(y); };
  // An observed Friday holiday can fall in the year before (New Year's Day on a Saturday), so look at y + 1 as well.
  return (day) => { const d = String(day).slice(0, 10), y = Number(d.slice(0, 4)); return dates.has(d) || (sets.length > 0 && (year(y).has(d) || year(y + 1).has(d))); };
}
