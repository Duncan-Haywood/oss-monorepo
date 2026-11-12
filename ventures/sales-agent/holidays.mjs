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
//
// US states and DC (added 2026-11-12, last): "us-tx", "us-ny", "us-ca" and the other postal codes, each state's own
// legal holidays; see usStateHolidays. The federal rules above are now checked too: every weekday federal holiday
// 2022-2028 matches python-holidays 0.108's list (holidays.test.mjs), a second source, still not opm.gov itself.

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

// US states and DC (added 2026-11-12, last). Each state's legal holidays: the days its own offices close. Private
// firms mostly keep "us-business"; these are for a prospect at a state agency, a county, a school district or a firm
// that follows the state's calendar. Written as rules here (not copied), then checked date for date, every weekday of
// 2022-2028, against python-holidays 0.108 (MIT; fixtures/us-state-holidays-python-holidays-0.108.json), an
// open-source library, not the states' own pages (comptroller.texas.gov and opm.gov refused this host 2026-11-12).
// Deliberate differences from that library, each listed in holidays.test.mjs: Susan B. Anthony Day (CA, FL, NY, WI)
// is left out because it is a day of commemoration, not a closure; Texas's four skeleton-crew days (Confederate
// Heroes Day, Texas Independence Day, San Jacinto Day, LBJ Day) and its two optional ones (Cesar Chavez Day, Good
// Friday) are left out because Texas state offices stay open on them. Both readings are from the statutes as commonly
// published and were not read against the statute text in this session.
const EOD = (y) => { const w = dow(y, 11, 25); return w === 6 ? 24 : w === 0 ? 26 : 25; }; // Christmas, observed day of December
const weekdayOnly = (date) => { const [y, m, d] = date.split("-").map(Number); return [1, 2, 3, 4, 5].includes(dow(y, m - 1, d)); };
// Sunday-only observance (Massachusetts keeps a Saturday holiday on Saturday; Cesar Chavez Day in California).
const sunToMon = (y, m, d) => shift(y, m, d, dow(y, m, d) === 0 ? 1 : 0);
// Diwali, which California added as a state holiday from 2026 (AB 268): a lunar date, so a table, taken from
// python-holidays' own table for 2026-2035 (it has no 2034 entry; nor does this). A year past the table has no Diwali.
const DIWALI = { 2026: "11-08", 2027: "10-29", 2028: "10-17", 2029: "11-05", 2030: "10-26", 2031: "11-14", 2032: "11-02", 2033: "10-22", 2035: "10-30" };
const US_STATES = ["ak", "al", "ar", "az", "ca", "co", "ct", "dc", "de", "fl", "ga", "hi", "ia", "id", "il", "in", "ks", "ky", "la", "ma", "md", "me", "mi", "mn", "mo", "ms", "mt", "nc", "nd", "ne", "nh", "nj", "nm", "nv", "ny", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "va", "vt", "wa", "wi", "wv", "wy"];
// States that do not close for Columbus Day (some keep a different day on it, listed below).
const NO_COLUMBUS = new Set(["ar", "ca", "co", "de", "fl", "hi", "ia", "ks", "ky", "la", "mi", "mn", "ms", "nc", "nd", "nh", "nv", "ok", "or", "sc", "tn", "tx", "vt", "wa", "wi", "wy"]);
// States that do not close on the third Monday of February (DE, FL), or that move Washington's Birthday to another
// day: to the day after Thanksgiving (NM), or next to Christmas (GA, IN, by the governor's yearly order).
const NO_FEB = new Set(["de", "fl", "ga", "in", "nm"]);

/** A US state's (or DC's) legal holidays in year y, as { date, name } (added 2026-11-12, last). st is the postal code
 * (tx, ca, ny, dc, ...). Weekend days move to Friday or Monday as in federal law, except in Massachusetts, which moves
 * only a Sunday one. See the note above for what this list is and how far it is checked. */
export function usStateHolidays(y, st) {
  const s = String(st || "").toLowerCase();
  if (!US_STATES.includes(s)) throw new Error(`usStateHolidays: unknown state "${st}"`);
  const has = (...l) => l.includes(s);
  const obs = s === "ma" ? sunToMon : observed;
  const [em, ed] = easter(y);
  const thanks = nth(y, 10, 4, 4), out = [];
  const add = (date, name) => out.push({ date, name });
  // The federal days, less the ones this state does not keep.
  add(obs(y, 0, 1), "New Year's Day");
  if (obs(y + 1, 0, 1) < `${y + 1}`) add(obs(y + 1, 0, 1), "New Year's Day (observed)"); // 1 Jan next year on a Saturday
  add(ymd(y, 0, nth(y, 0, 1, 3)), "Martin Luther King Jr. Day");
  if (!NO_FEB.has(s)) add(ymd(y, 1, nth(y, 1, 1, 3)), "Washington's Birthday");
  add(ymd(y, 4, nth(y, 4, 1, -1)), "Memorial Day");
  if (y >= 2021) add(obs(y, 5, 19), "Juneteenth");
  add(obs(y, 6, 4), "Independence Day");
  add(ymd(y, 8, nth(y, 8, 1, 1)), "Labor Day");
  if (!NO_COLUMBUS.has(s)) add(ymd(y, 9, nth(y, 9, 1, 2)), "Columbus Day");
  add(obs(y, 10, 11), "Veterans Day");
  add(ymd(y, 10, thanks), "Thanksgiving Day");
  add(obs(y, 11, 25), "Christmas Day");
  // The day after Thanksgiving, under whatever name the state gives it.
  const dat = { ca: "Day After Thanksgiving", de: "Day After Thanksgiving", fl: "Friday After Thanksgiving", ga: "State Holiday", in: "Lincoln's Birthday", md: "American Indian Heritage Day", mi: "Day After Thanksgiving", nc: "Day After Thanksgiving", nh: "Day After Thanksgiving", nm: "Presidents' Day", nv: "Family Day", ok: "Day After Thanksgiving", pa: "Day After Thanksgiving", tx: "Friday After Thanksgiving", wa: "Native American Heritage Day", wv: "Day After Thanksgiving" }[s];
  if (dat) add(ymd(y, 10, thanks + 1), dat);
  if (has("ct", "de", "ga", "in", "ky", "la", "nc", "nj", "tn")) add(shift(y, em, ed, -2), s === "ga" ? "State Holiday" : "Good Friday");
  if (s === "la") add(shift(y, em, ed, -47), "Mardi Gras");
  if (has("ct", "ia", "il", "nj", "ny")) add(observed(y, 1, 12), "Lincoln's Birthday");
  // Election Day, the Tuesday after the first Monday of November: every year in IN and NY, even years elsewhere.
  const elec = ymd(y, 10, nth(y, 10, 1, 1) + 1);
  if (has("in", "ny") || (y % 2 === 0 && has("de", "hi", "il", "la", "mi", "mt", "nh", "nj", "wv"))) add(elec, "Election Day");
  if (s === "in") add(ymd(y, 4, nth(y, 4, 1, 1) + 1), "Primary Election Day");
  // Christmas Eve: the weekday before the observed Christmas. New Year's Eve: 31 December, or Friday 30th when the
  // 31st is a Saturday; none when the 31st is a Sunday or is already New Year's Day observed.
  if (has("ks", "mi", "nc", "tx", "wi")) { const c = EOD(y); add(shift(y, 11, c, dow(y, 11, c) === 1 ? -3 : -1), "Christmas Eve"); }
  if (has("ky", "mi", "wi")) { const w = dow(y, 11, 31); if (w !== 0 && !(w === 5 && dow(y + 1, 0, 1) === 6)) add(ymd(y, 11, w === 6 ? 30 : 31), "New Year's Eve"); }
  if (s === "nc") { let d = 26; while ([0, 6].includes(dow(y, 11, d)) || d === EOD(y)) d++; add(ymd(y, 11, d), "Day After Christmas"); }
  if (s === "tx" && ![0, 6].includes(dow(y, 11, 26)) && EOD(y) !== 26) add(ymd(y, 11, 26), "Day After Christmas");
  // Georgia and Indiana keep Washington's Birthday next to Christmas: the day after when 25 December is a Monday or a
  // Thursday, the day before when it is a Tuesday, Wednesday or Friday, and Friday 23rd when it falls on a weekend.
  if (has("ga", "in")) { const w = dow(y, 11, 25); add(shift(y, 11, 25, { 0: -2, 1: 1, 2: -1, 3: -1, 4: 1, 5: -1, 6: -2 }[w]), "Washington's Birthday"); }
  // Each state's own days.
  const own = {
    ak: () => { add(ymd(y, 2, nth(y, 2, 1, -1)), "Seward's Day"); add(observed(y, 9, 18), "Alaska Day"); },
    al: () => { add(ymd(y, 3, nth(y, 3, 1, 4)), "Confederate Memorial Day"); add(ymd(y, 5, nth(y, 5, 1, 1)), "Jefferson Davis' Birthday"); },
    ca: () => { add(sunToMon(y, 2, 31), "Cesar Chavez Day"); if (y >= 2026 && DIWALI[y]) add(`${y}-${DIWALI[y]}`, "Diwali"); },
    co: () => { add(ymd(y, 2, 31), "Cesar Chavez Day"); add(ymd(y, 9, nth(y, 9, 1, 1)), "Frances Xavier Cabrini Day"); },
    dc: () => add(observed(y, 3, 16), "Emancipation Day"),
    hi: () => { add(observed(y, 2, 26), "Prince Jonah Kuhio Kalanianaole Day"); add(observed(y, 5, 11), "Kamehameha Day"); add(ymd(y, 7, nth(y, 7, 5, 3)), "Statehood Day"); },
    il: () => add(ymd(y, 2, nth(y, 2, 1, 1)), "Casimir Pulaski Day"),
    ma: () => add(ymd(y, 3, nth(y, 3, 1, 3)), "Patriots' Day"),
    me: () => add(ymd(y, 3, nth(y, 3, 1, 3)), "Patriots' Day"),
    md: () => { if ((y - 1789) % 4 === 0) add(sunToMon(y, 0, 20), "Inauguration Day"); },
    mo: () => add(observed(y, 4, 8), "Truman Day"),
    ms: () => add(ymd(y, 3, nth(y, 3, 1, -1)), "Confederate Memorial Day"),
    ne: () => add(ymd(y, 3, nth(y, 3, 5, -1)), "Arbor Day"),
    nv: () => add(ymd(y, 9, nth(y, 9, 5, -1)), "Nevada Day"),
    ri: () => add(ymd(y, 7, nth(y, 7, 1, 2)), "Victory Day"),
    sc: () => add(ymd(y, 3, nth(y, 3, 1, 4)), "Confederate Memorial Day"),
    ut: () => add(observed(y, 6, 24), "Pioneer Day"),
    vt: () => { add(ymd(y, 2, nth(y, 2, 2, 1)), "Town Meeting Day"); add(observed(y, 7, 16), "Bennington Battle Day"); },
    wv: () => add(observed(y, 5, 20), "West Virginia Day"),
  }[s];
  if (own) own();
  // Keep weekdays only (a Saturday holiday is kept on its observed Friday), one entry per date, in date order.
  const seen = new Set();
  return out.filter((h) => weekdayOnly(h.date) && !seen.has(h.date) && seen.add(h.date)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
    else throw new Error(`holidays: "${raw}" is not a date (YYYY-MM-DD), "us", "us-business", "gb-eng", "gb-sct", "gb-nir", "ca", a province ("ca-on", "ca-qc", ...) or a US state ("us-tx", "us-ny", ...)`);
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
  const us = p.match(/^us-([a-z]{2})$/);
  if (us && US_STATES.includes(us[1])) return (y) => usStateHolidays(y, us[1]);
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
  // A US region ("US-TX") means the six business days too (added 2026-11-12, last): a state's own calendar (us-tx) is
  // the days its offices close, which most private firms do not keep; write holidays=us-tx for a state agency.
  const pick = { holidays: (v) => v, region: (v) => { const r = String(v || "").trim(); return /^us-[a-z]{2}$/i.test(r) ? "us-business" : /^[a-z]{2}-[a-z]{2,3}$/i.test(r) ? r : ""; }, country: (v) => (String(v || "").trim().toLowerCase() === "us" ? "us-business" : v) };
  return (row, p) => { for (const src of [row, p]) for (const k of ["holidays", "region", "country"]) { const c = src && tryOne(pick[k](src[k])); if (c) return c; } return null; };
}
