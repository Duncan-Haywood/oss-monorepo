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
// what is in it and how far it is checked (a second source, not canada.ca). Provinces and territories (added the same
// day, later): "ca-on", "ca-qc", "ca-bc" and the other ten postal codes; see caProvincialHolidays.

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

// The Monday nearest day d of month m (Newfoundland and Labrador's rule for its own holidays). A Thursday goes back
// three days; a Friday goes forward three, except St Patrick's Day, which NL kept on the Monday before in 2023 (Fri 17
// March -> 13 March), and canada-holidays.ca gives 2028 the same way; `back` marks that.
function nearestMonday(y, m, d, back = false) {
  const w = dow(y, m, d), off = w === 1 ? 0 : w === 5 && back ? -4 : w <= 4 && w >= 2 ? 1 - w : (8 - w) % 7;
  return shift(y, m, d, off);
}

const PROVINCES = ["ab", "bc", "mb", "nb", "nl", "ns", "nt", "nu", "on", "pe", "qc", "sk", "yt"];
/** The statutory holidays of a Canadian province or territory in year y (added 2026-11-12, later), as { date, name }.
 * prov is the postal code (ab, bc, mb, nb, nl, ns, nt, nu, on, pe, qc, sk, yt). These are the general holidays a
 * province's employment law gives most workers, as canada-holidays.ca lists them; federally regulated employers
 * (banks, airlines, telecoms) follow "ca" instead. A fixed-date holiday on a weekend moves to the next free weekday,
 * except National Indigenous Peoples Day (21 June), which the site keeps on the day. holidays.test.mjs checks every
 * province, 2022-2028, date for date against fixtures/canada-provincial-holidays.json: an open-source site, not the
 * provinces' own pages (canada.ca refused this host on 2026-11-12). Two things that list carries that a rule cannot
 * vouch for: Regatta Day (NL) is St. John's own civic holiday, the first Wednesday of August unless the regatta
 * committee moves it (it was 30 July in 2025, listed below) or the weather does on the morning; and PEI's 2022 Day of
 * Mourning. Employers in several provinces may swap a holiday (Quebec: Good Friday or Easter Monday), so read these as
 * "most offices are shut", not as anyone's contract. */
export function caProvincialHolidays(y, prov) {
  const p = String(prov || "").toLowerCase();
  if (!PROVINCES.includes(p)) throw new Error(`caProvincialHolidays: unknown province "${prov}"`);
  const has = (...list) => list.includes(p);
  const [em, ed] = easter(y);
  const out = [{ date: shift(y, em, ed, -2), name: "Good Friday" }, { date: ymd(y, 8, nth(y, 8, 1, 1)), name: "Labour Day" }];
  const feb = { ab: "Family Day", bc: "Family Day", nb: "Family Day", on: "Family Day", sk: "Family Day", mb: "Louis Riel Day", ns: "Heritage Day", pe: "Islander Day" }[p];
  if (feb) out.push({ date: ymd(y, 1, nth(y, 1, 1, 3)), name: feb });
  const victoria = ymd(y, 4, 24 - ((dow(y, 4, 24) + 6) % 7));
  if (has("ab", "bc", "mb", "nt", "nu", "on", "sk", "yt")) out.push({ date: victoria, name: "Victoria Day" });
  if (p === "qc") out.push({ date: victoria, name: "National Patriots' Day" });
  const aug = { bc: "British Columbia Day", nb: "New Brunswick Day", sk: "Saskatchewan Day", nt: "Civic Holiday", nu: "Civic Holiday" }[p];
  if (aug) out.push({ date: ymd(y, 7, nth(y, 7, 1, 1)), name: aug });
  if (p === "yt") out.push({ date: ymd(y, 7, nth(y, 7, 1, 3)), name: "Discovery Day" });
  if (has("ab", "bc", "mb", "nt", "nu", "on", "qc", "sk", "yt")) out.push({ date: ymd(y, 9, nth(y, 9, 1, 2)), name: "Thanksgiving" });
  if (has("nt", "yt")) out.push({ date: ymd(y, 5, 21), name: "National Indigenous Peoples Day" });
  if (p === "nl") {
    out.push({ date: nearestMonday(y, 2, 17, true), name: "Saint Patrick's Day" }, { date: nearestMonday(y, 3, 23), name: "Saint George's Day" },
      { date: nearestMonday(y, 5, 24), name: "Discovery Day" }, { date: nearestMonday(y, 6, 12), name: "Orangemen's Day" },
      { date: y === 2025 ? "2025-07-30" : ymd(y, 7, nth(y, 7, 3, 1)), name: "Regatta Day" });
  }
  const fixed = [[0, 1, "New Year's Day"], [6, 1, p === "nl" ? "Memorial Day" : "Canada Day"]];
  if (p === "qc") fixed.push([5, 24, "Saint-Jean-Baptiste Day"]);
  if (p === "nu") fixed.push([6, 9, "Nunavut Day"]);
  if (has("bc", "mb", "nt", "pe", "yt")) fixed.push([8, 30, p === "mb" ? "Orange Shirt Day" : "National Day for Truth and Reconciliation"]);
  if (has("ab", "bc", "nb", "nl", "nt", "nu", "pe", "sk", "yt")) fixed.push([10, 11, "Remembrance Day"]);
  fixed.push([11, 25, "Christmas Day"]);
  if (has("nl", "on")) fixed.push([11, 26, "Boxing Day"]);
  const taken = new Set(out.map((h) => h.date));
  for (const [m, d, name] of fixed) {
    let n = 0, date = ymd(y, m, d);
    while ([0, 6].includes(dow(y, m, d + n)) || taken.has(date)) date = shift(y, m, d, ++n);
    taken.add(date);
    out.push({ date, name: n ? `${name} (observed)` : name });
  }
  if (y === 2022 && p === "pe") out.push({ date: "2022-09-19", name: "Day of Mourning for Queen Elizabeth II" });
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
    else throw new Error(`holidays: "${raw}" is not a date (YYYY-MM-DD), "us", "us-business", "gb-eng", "gb-sct", "gb-nir", "ca" or a province ("ca-on", "ca-qc", ...)`);
  }
  return { dates, sets };
}

/** A named preset as (year) => [{ date, name }], or null. */
function preset(p) {
  if (p === "us" || p === "us-federal") return usFederalHolidays;
  if (p === "us-business") return usBusinessHolidays;
  if (p === "ca" || p === "ca-federal") return caFederalHolidays;
  const pr = p.match(/^ca-([a-z]{2})$/);
  if (pr && PROVINCES.includes(pr[1])) return (y) => caProvincialHolidays(y, pr[1]);
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

/** A reader for a prospect's own days off: (task row, prospect row) => { spec, isOff } or null. The `holidays` column
 * wins, then `region`, then `country`; a value that is not a known preset or dates is skipped, never an error, since a
 * prospect list carries countries we have no calendar for. Checkers are cached per spec. Shared by the daily run
 * and call prep (moved here from daily.mjs 2026-11-12) so the two read the same columns the same way. */
export function theirDaysOff() {
  const cache = new Map();
  const tryOne = (v) => {
    const spec = String(v || "").trim().toLowerCase();
    if (!spec) return null;
    if (!cache.has(spec)) { let c = null; try { c = { spec, isOff: holidayChecker(spec) }; } catch { c = null; } cache.set(spec, c); }
    return cache.get(spec);
  };
  // A bare country "US" means the six days most businesses close, not the eleven federal ones (Columbus Day and
  // Veterans Day are working days at most firms); write holidays=us to get the federal list.
  // A region counts only in the two-part form ("CA-QC", "GB-SCT"): a bare region "CA" in a US list is California.
  const pick = { holidays: (v) => v, region: (v) => (/^[a-z]{2}-[a-z]{2,3}$/i.test(String(v || "").trim()) ? v : ""), country: (v) => (String(v || "").trim().toLowerCase() === "us" ? "us-business" : v) };
  return (row, p) => { for (const src of [row, p]) for (const k of ["holidays", "region", "country"]) { const c = src && tryOne(pick[k](src[k])); if (c) return c; } return null; };
}
