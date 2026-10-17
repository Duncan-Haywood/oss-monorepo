// State residency day counter: pure functions, no DOM, no network.
// Days are integer day numbers (UTC midnight / 86400000) so there is no DST or
// timezone arithmetic anywhere.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Commonly published day-count tests. `limit` is the most days you can spend
// without crossing the test (the test is "more than limit"). These are a
// starting point the user is told to check against the state's own guidance and
// can override; they are not a statement of anyone's tax residency.
export const RULES = {
  NY: { limit: 183, requiresAbode: true, kind: "statutory", note: "Statutory resident: a permanent place of abode in the state plus more than 183 days. Any part of a day usually counts as a day." },
  NJ: { limit: 183, requiresAbode: true, kind: "statutory", note: "Statutory resident: a permanent place of abode plus more than 183 days." },
  CT: { limit: 183, requiresAbode: true, kind: "statutory", note: "Statutory resident: a permanent place of abode plus more than 183 days." },
  MA: { limit: 183, requiresAbode: true, kind: "statutory", note: "Resident for tax if you keep a permanent place of abode and spend more than 183 days." },
  PA: { limit: 183, requiresAbode: true, kind: "statutory", note: "Statutory resident: a permanent place of abode plus more than 183 days." },
  MN: { limit: 183, requiresAbode: true, kind: "statutory", note: "Statutory resident: a permanent place of abode plus more than 183 days." },
  VA: { limit: 183, requiresAbode: true, kind: "statutory", note: "Resident for tax if you keep a place of abode and spend more than 183 days." },
  RI: { limit: 183, requiresAbode: true, kind: "statutory", note: "Resident for tax if you are not domiciled there but keep a permanent place of abode and spend more than 183 days (R.I. Gen. Laws 44-30-5)." },
  MD: { limit: 182, requiresAbode: true, kind: "statutory", note: "Statutory resident: a place of abode kept for more than six months plus physical presence for 183 days or more (Tax-General 10-101), so the limit here is 182 and 183 days crosses it. A vacation home alone does not count unless you are present 183 days or more." },
  ME: { limit: 183, requiresAbode: true, kind: "statutory", note: "Statutory resident: a permanent place of abode kept for the whole tax year plus more than 183 days in the state (36 M.R.S. 5102). Any part of a day counts as a day." },
  ID: { limit: 270, requiresAbode: true, kind: "statutory", note: "Resident for tax if you keep a place of abode in Idaho for the entire tax year and spend more than 270 days there (Idaho Code 63-3013). Any part of a day counts unless your presence was temporary or transitory. Domicile in Idaho makes you a resident regardless of days." },
  OR: { limit: 200, requiresAbode: true, kind: "statutory", note: "Resident for tax if you keep a permanent place of abode and spend more than 200 days." },
  CA: { limit: 270, requiresAbode: false, kind: "presumption", note: "Residency turns on domicile and where your ties are strongest. Time in the state beyond about nine months is commonly treated as a presumption of residency that you would have to rebut." },
};

// "Convenience of the employer" rules, as commonly described: a state that may
// tax wages for days you work remotely outside it, unless your employer
// required you to be out of state. `strict` states apply it to everyone;
// `retaliatory` states apply it mainly against residents of states that do the
// same. Summarised from published guidance; the user is told to check it.
export const EMPLOYER_RULES = {
  NY: { kind: "strict", note: "New York treats days worked remotely for a New York employer as New York days unless the employer required you to work elsewhere (not merely allowed it)." },
  NE: { kind: "strict", note: "Nebraska is commonly listed with the convenience-of-the-employer states for remote work outside Nebraska." },
  DE: { kind: "strict", note: "Delaware is commonly listed with the convenience-of-the-employer states for remote work outside Delaware." },
  AR: { kind: "strict", note: "Arkansas is commonly listed with the convenience-of-the-employer states for remote work outside Arkansas." },
  PA: { kind: "retaliatory", note: "Pennsylvania is commonly described as applying the rule against residents of states that apply it to Pennsylvanians." },
  NJ: { kind: "retaliatory", note: "New Jersey is commonly described as applying the rule against residents of states that apply it to New Jersey residents." },
  CT: { kind: "retaliatory", note: "Connecticut is commonly described as applying the rule against residents of states that apply it to Connecticut residents." },
};

export const NO_WAGE_TAX = ["AK", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"];

// ---- dates -----------------------------------------------------------------

export function toDay(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return Math.floor(t / 86400000);
}

export function dayIso(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

export function dayOfWeek(n) {
  return (((n + 4) % 7) + 7) % 7; // 0 = Sunday; day 0 (1970-01-01) was a Thursday
}

export function isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function yearBounds(year) {
  const start = toDay(year, 1, 1);
  return { start, end: toDay(year, 12, 31), total: isLeap(year) ? 366 : 365 };
}

const DATE_RE = new RegExp(
  "(\\d{4})-(\\d{1,2})-(\\d{1,2})" +
    "|(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?" +
    "|\\b(" + MONTHS.join("|") + ")[a-z]*\\.?\\s+(\\d{1,2})(?:(?:st|nd|rd|th)?,?\\s+(\\d{4}))?",
  "gi",
);

function matchToDay(m, defaultYear) {
  if (m[1]) return toDay(+m[1], +m[2], +m[3]);
  if (m[4]) {
    let y = m[6] ? +m[6] : defaultYear;
    if (m[6] && m[6].length === 2) y += 2000;
    return toDay(y, +m[4], +m[5]);
  }
  const mon = MONTHS.indexOf(m[7].toLowerCase()) + 1;
  return toDay(m[9] ? +m[9] : defaultYear, mon, +m[8]);
}

export function parseDate(text, defaultYear) {
  const re = new RegExp(DATE_RE.source, "i");
  const m = re.exec(String(text).trim());
  return m ? matchToDay(m, defaultYear) : null;
}

const NAME_TO_CODE = Object.entries(STATE_NAMES)
  .map(([code, name]) => [name.toLowerCase(), code])
  .sort((a, b) => b[0].length - a[0].length);

function findState(rest) {
  const lower = rest.toLowerCase();
  for (const [name, code] of NAME_TO_CODE) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return code;
  }
  const m = rest.match(/\b([A-Z]{2})\b/);
  return m ? m[1] : null;
}

// One stay per line: "2025-01-03 to 2025-03-30 FL", "1/3/2025 - 3/30/2025 New York",
// "NY, Jun 2 - Jun 9" (year defaults to the tax year). Add "off" or "vacation" to a
// line to say you did not work there.
export function parseStays(text, year) {
  const stays = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const found = [...line.matchAll(DATE_RE)];
    const days = found.map((m) => matchToDay(m, year));
    if (found.length === 0) return errors.push({ line: i + 1, message: `No date found in "${line}".` });
    if (days.some((d) => d === null)) return errors.push({ line: i + 1, message: `A date on this line is not a real calendar date: "${line}".` });
    if (found.length > 2) return errors.push({ line: i + 1, message: `More than two dates on one line: "${line}".` });
    let rest = line;
    for (const m of found) rest = rest.replace(m[0], " ");
    const work = !/\b(off|vacation|holiday|pto|not working|no work)\b/i.test(rest);
    const state = findState(rest);
    if (!state) return errors.push({ line: i + 1, message: `No state found in "${line}". Use a two-letter code like NY or a name like New York.` });
    const start = days[0];
    const end = days.length === 2 ? days[1] : days[0];
    if (end < start) return errors.push({ line: i + 1, message: `The end date is before the start date: "${line}".` });
    stays.push({ state, start, end, work });
  });
  return { stays, errors };
}

// Calendar import. Pass the text of an .ics file (Google, Apple and Outlook all
// export one); every event whose LOCATION (or, failing that, title) names a US
// state becomes a stay line you can read and correct before counting. Events
// with no state are skipped and counted. All-day end dates are exclusive in
// iCalendar, so the last day is one earlier. Adjacent or overlapping events in
// the same state are merged into one line.
function icsState(text) {
  const lower = String(text || "").toLowerCase();
  for (const [name, code] of NAME_TO_CODE) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return code;
  }
  const m = String(text || "").match(/,\s*([A-Z]{2})\b/);
  return m && STATE_NAMES[m[1]] ? m[1] : null;
}

function icsDay(value) {
  const m = /(\d{4})(\d{2})(\d{2})/.exec(value || "");
  return m ? { day: toDay(+m[1], +m[2], +m[3]), allDay: !/T\d/.test(value) } : null;
}

export function icsToStays(text, year) {
  const unfolded = String(text || "").replace(/\r?\n[ \t]/g, "");
  const events = unfolded.split(/BEGIN:VEVENT/i).slice(1);
  const found = [];
  let skipped = 0;
  const prop = (ev, name) => {
    const m = new RegExp(`^${name}[^:\\n]*:(.*)$`, "im").exec(ev);
    return m ? m[1].replace(/\\([,;nN\\])/g, (_, c) => (c === "n" || c === "N" ? " " : c)).trim() : "";
  };
  for (const ev of events) {
    const a = icsDay(prop(ev, "DTSTART"));
    if (!a) { skipped++; continue; }
    const b = icsDay(prop(ev, "DTEND")) || a;
    let end = b.allDay && b.day > a.day ? b.day - 1 : b.day;
    if (end < a.day) end = a.day;
    const state = icsState(prop(ev, "LOCATION")) || icsState(prop(ev, "SUMMARY"));
    if (!state) { skipped++; continue; }
    if (year && (+dayIso(end).slice(0, 4) < +year || +dayIso(a.day).slice(0, 4) > +year)) { skipped++; continue; }
    found.push({ state, start: a.day, end });
  }
  return mergeFound(found, skipped);
}

// Google Timeline import. Pass the text of a Takeout "Semantic Location
// History" month file (Location History/Semantic Location History/2025/
// 2025_MARCH.json): each placeVisit with an address ending in a state code or
// name becomes one stay, dated by the visit's start and end timestamps (the
// first 10 characters, i.e. the date the export recorded). A visit that spans
// midnight covers each day it touches. Visits without an address, and
// activitySegments (travel), are skipped and counted. Several month files can
// be passed concatenated as a JSON array or one after another.
export function timelineToStays(text, year) {
  let docs;
  try {
    const parsed = JSON.parse(String(text || ""));
    docs = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return { lines: [], imported: 0, skipped: 0, error: "Not a JSON file." };
  }
  const found = [];
  let skipped = 0;
  for (const doc of docs) {
    for (const obj of (doc && doc.timelineObjects) || []) {
      const v = obj && obj.placeVisit;
      if (!v) { skipped++; continue; }
      const d = v.duration || {};
      const a = icsDay((d.startTimestamp || "").slice(0, 10).replace(/-/g, ""));
      const b = icsDay((d.endTimestamp || d.startTimestamp || "").slice(0, 10).replace(/-/g, ""));
      const loc = v.location || {};
      const state = icsState(loc.address) || icsState(loc.name);
      if (!a || !b || !state) { skipped++; continue; }
      const end = Math.max(a.day, b.day);
      if (year && (+dayIso(end).slice(0, 4) < +year || +dayIso(a.day).slice(0, 4) > +year)) { skipped++; continue; }
      found.push({ state, start: a.day, end });
    }
  }
  return mergeFound(found, skipped);
}

function mergeFound(found, skipped) {
  found.sort((x, y) => x.start - y.start || x.end - y.end);
  const merged = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && last.state === f.state && f.start <= last.end + 1) last.end = Math.max(last.end, f.end);
    else merged.push({ ...f });
  }
  const lines = merged.map((s) => (s.start === s.end ? `${dayIso(s.start)} ${s.state}` : `${dayIso(s.start)} to ${dayIso(s.end)} ${s.state}`));
  return { lines, imported: found.length, skipped };
}

// ---- analysis ----------------------------------------------------------------

export const CONVENTIONS = {
  inclusive: "Count every day you were there, including the days you arrive and leave (any part of a day counts)",
  nights: "Count nights: do not count the day you leave (a one-day trip still counts as one day)",
};

export function validateSpec(spec) {
  const errs = [];
  if (!Number.isInteger(spec.year) || spec.year < 1990 || spec.year > 2100) errs.push("Enter a four-digit tax year.");
  if (!Array.isArray(spec.stays) || spec.stays.length === 0) errs.push("Add at least one stay.");
  for (const s of spec.stays || []) {
    if (!/^[A-Z]{2}$/.test(s.state)) errs.push(`"${s.state}" is not a two-letter state code.`);
    if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || s.end < s.start) errs.push("A stay has an invalid date range.");
  }
  if (spec.wages != null && !(spec.wages >= 0)) errs.push("Wages must be zero or more.");
  return errs;
}

function ruleFor(code, overrides) {
  const o = overrides && overrides[code];
  const base = RULES[code];
  if (o && Number.isFinite(o.limit)) {
    return { limit: o.limit, requiresAbode: o.requiresAbode ?? base?.requiresAbode ?? false, kind: base?.kind ?? "custom", note: base?.note ?? "A limit you entered yourself.", custom: true };
  }
  return base ? { ...base } : null;
}

function rangesOf(flags, start) {
  const out = [];
  let from = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && from < 0) from = i;
    if (!on && from >= 0) { out.push({ start: start + from, end: start + i - 1, days: i - from }); from = -1; }
  }
  return out;
}

export function analyze(spec) {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(errs.join(" "));
  const { start: y0, end: y1, total } = yearBounds(spec.year);
  const convention = spec.convention === "nights" ? "nights" : "inclusive";
  const asOf = Math.min(y1, Math.max(y0 - 1, Number.isInteger(spec.asOf) ? spec.asOf : y1));
  const idx = (d) => d - y0;

  const codes = [...new Set(spec.stays.map((s) => s.state))];
  const home = spec.homeState && /^[A-Z]{2}$/.test(spec.homeState) ? spec.homeState : null;
  if (home && !codes.includes(home)) codes.push(home);
  const present = Object.fromEntries(codes.map((c) => [c, new Uint8Array(total)]));
  const assumed = Object.fromEntries(codes.map((c) => [c, new Uint8Array(total)]));
  const cover = Array.from({ length: total }, () => []); // stays touching each day

  for (const s of spec.stays) {
    let a = s.start;
    let b = s.end;
    if (convention === "nights" && b > a) b -= 1;
    for (let d = Math.max(a, y0); d <= Math.min(b, y1); d++) {
      present[s.state][idx(d)] = 1;
      cover[idx(d)].push({ state: s.state, work: s.work !== false, boundary: d === s.start || d === s.end });
    }
  }

  // Overlaps that are not a plain travel day are probably a typo.
  const conflictFlags = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const states = new Set(cover[i].map((c) => c.state));
    if (states.size > 1 && !cover[i].every((c) => c.boundary)) conflictFlags[i] = 1;
  }
  const conflicts = rangesOf(conflictFlags, y0).map((r) => ({
    ...r, states: [...new Set(cover.slice(idx(r.start), idx(r.end) + 1).flat().map((c) => c.state))],
  }));

  const gapFlags = new Uint8Array(total);
  for (let i = 0; i < total; i++) if (cover[i].length === 0) gapFlags[i] = 1;
  const gapRanges = rangesOf(gapFlags, y0);
  let gapsToDate = 0;
  let unplanned = 0;
  for (let i = 0; i < total; i++) if (gapFlags[i]) (y0 + i <= asOf ? gapsToDate++ : unplanned++);
  if (home) for (let i = 0; i < total; i++) if (gapFlags[i]) { present[home][i] = 1; assumed[home][i] = 1; }

  // Workdays: Monday to Friday, split evenly across the states worked in that day.
  const work = Object.fromEntries(codes.map((c) => [c, 0]));
  let workTotal = 0;
  for (let i = 0; i < total; i++) {
    const dow = dayOfWeek(y0 + i);
    if (dow === 0 || dow === 6) continue;
    let where = [...new Set(cover[i].filter((c) => c.work).map((c) => c.state))];
    if (cover[i].length === 0 && home && spec.homeWorks !== false) where = [home];
    if (!where.length) continue;
    for (const c of where) work[c] += 1 / where.length;
    workTotal += 1;
  }

  const emp = spec.employerState && /^[A-Z]{2}$/.test(spec.employerState) ? spec.employerState : null;
  const empRule = emp && EMPLOYER_RULES[emp] ? EMPLOYER_RULES[emp] : null;

  const states = codes.map((code) => {
    const flags = present[code];
    let days = 0;
    let toDate = 0;
    let assumedDays = 0;
    for (let i = 0; i < total; i++) {
      if (!flags[i]) continue;
      days++;
      if (y0 + i <= asOf) toDate++;
      if (assumed[code][i]) assumedDays++;
    }
    const rule = ruleFor(code, spec.overrides);
    const abode = !!(spec.abode && spec.abode[code]);
    let status = "none";
    let room = null;
    let triggerDate = null;
    if (rule) {
      room = rule.limit - days;
      if (rule.requiresAbode && !abode) status = "no-abode";
      else status = days > rule.limit ? "over" : room <= 14 ? "close" : "under";
      // The day you would cross the limit if you were there every day from tomorrow.
      let cum = 0;
      for (let i = 0; i < total; i++) if (y0 + i <= asOf && flags[i]) cum++;
      if (cum > rule.limit) triggerDate = null;
      else for (let d = Math.max(asOf + 1, y0); d <= y1; d++) {
        cum++;
        if (cum > rule.limit) { triggerDate = d; break; }
      }
    } else if (NO_WAGE_TAX.includes(code)) status = "no-wage-tax";
    const w = work[code];
    return {
      code, name: STATE_NAMES[code] || code, days, daysToDate: toDate, assumedDays,
      ranges: rangesOf(flags, y0), rule, abode, status, room, triggerDate,
      workdays: Math.round(w * 100) / 100,
      workShare: workTotal ? w / workTotal : 0,
      wages: spec.wages != null && workTotal ? Math.round((spec.wages * w) / workTotal * 100) / 100 : null,
    };
  }).sort((a, b) => b.days - a.days || a.code.localeCompare(b.code));

  // Convenience-of-the-employer view: remote workdays outside the employer's
  // state that the employer's state may still claim, and how much of that is
  // also wages the physical state can tax (a double-tax exposure to credit).
  let employer = null;
  if (emp && empRule) {
    const outside = states.filter((s) => s.code !== emp && s.workdays > 0);
    const pulledDays = outside.reduce((n, s) => n + s.workdays, 0);
    const wageOf = (days) => (spec.wages != null && workTotal ? Math.round((spec.wages * days) / workTotal * 100) / 100 : null);
    const physical = (states.find((s) => s.code === emp) || { workdays: 0 }).workdays;
    const taxedBoth = outside.filter((s) => !NO_WAGE_TAX.includes(s.code));
    const dualDays = taxedBoth.reduce((n, s) => n + s.workdays, 0);
    employer = {
      code: emp, name: STATE_NAMES[emp] || emp, kind: empRule.kind, note: empRule.note,
      physicalDays: Math.round(physical * 100) / 100,
      remoteDays: Math.round(pulledDays * 100) / 100,
      claimableDays: Math.round((physical + pulledDays) * 100) / 100,
      claimableWages: wageOf(physical + pulledDays),
      doubleTaxDays: Math.round(dualDays * 100) / 100,
      doubleTaxWages: wageOf(dualDays),
      byState: outside.map((s) => ({ code: s.code, days: s.workdays, noWageTax: NO_WAGE_TAX.includes(s.code) })),
    };
  }

  const notices = [];
  if (employer && employer.remoteDays > 0) notices.push(`${employer.name} may claim wages for ${fmtNum(employer.remoteDays, 1)} remote workday(s) you spent outside it${employer.kind === "retaliatory" ? " (only if the state you worked in applies the same rule to its own residents)" : ""}; ${fmtNum(employer.doubleTaxDays, 1)} of them were in states that tax wages themselves, so ask about a credit.`);
  if (conflicts.length) notices.push(`${conflicts.reduce((n, c) => n + c.days, 0)} day(s) fall in stays in different states that overlap by more than a travel day. Both states are counted for those days; check the dates.`);
  if (gapsToDate && !home) notices.push(`${gapsToDate} day(s) up to the as-of date are not in any stay. They are not counted anywhere; add a stay or pick the state you assume you were in.`);
  if (home && gapRanges.length) notices.push(`Days not in any stay are assumed to be in ${home}.`);
  if (unplanned && !home) notices.push(`${unplanned} day(s) after the as-of date have no plan yet.`);

  return {
    year: spec.year, totalDays: total, asOf, convention, states, conflicts,
    gaps: { toDate: gapsToDate, unplanned, ranges: gapRanges },
    workTotal, wages: spec.wages ?? null, employer, notices,
    daysCounted: states.reduce((n, s) => n + s.days, 0),
  };
}

// Independent recount, used by the tests and offered as a self-check: walks every
// date with the Date object instead of the day-number arithmetic above.
export function bruteForceCounts(spec) {
  const out = {};
  const nights = spec.convention === "nights";
  const home = spec.homeState || null;
  for (let d = new Date(Date.UTC(spec.year, 0, 1)); d.getUTCFullYear() === spec.year; d = new Date(d.getTime() + 86400000)) {
    const n = Math.floor(d.getTime() / 86400000);
    let any = false;
    for (const s of spec.stays) {
      const last = nights && s.end > s.start ? s.end - 1 : s.end;
      if (n >= s.start && n <= last) { out[s.state] = (out[s.state] || new Set()).add(n); any = true; }
    }
    // a stay still counts on its own boundary even when a neighbour covers it
    if (!any && home) out[home] = (out[home] || new Set()).add(n);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.size]));
}

export function sampleSpec() {
  const year = 2025;
  const { stays } = parseStays([
    "2025-01-01 to 2025-03-31 FL",
    "2025-04-01 to 2025-04-30 NY",
    "2025-05-01 to 2025-05-18 NY off",
    "2025-05-19 to 2025-08-29 NY",
    "2025-08-30 to 2025-09-14 NJ off",
    "2025-09-15 to 2025-10-31 NY",
    "2025-11-01 to 2025-12-31 FL",
  ].join("\n"), year);
  return { year, stays, homeState: "FL", abode: { NY: true, FL: true }, asOf: toDay(year, 9, 30), convention: "inclusive", wages: 140000, overrides: {}, homeWorks: true };
}

// ---- output ------------------------------------------------------------------

export function fmtNum(n, digits = 0) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtMoney(n) {
  return n == null ? "" : "$" + fmtNum(n, 0);
}

export function statusText(s) {
  return {
    over: "Over the limit",
    close: "Close to the limit",
    under: "Under the limit",
    "no-abode": "No day test without an abode there",
    "no-wage-tax": "No wage income tax in this state",
    none: "No day-count test here (domicile and ties decide)",
  }[s.status];
}

function csvCell(v) {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function reportCsv(result) {
  const rows = [["State", "Days counted", "Days to as-of date", "Assumed days", "Limit", "Status", "Workdays", "Wages allocated", "Date ranges"]];
  for (const s of result.states) {
    rows.push([
      s.code, s.days, s.daysToDate, s.assumedDays, s.rule ? s.rule.limit : "", statusText(s),
      s.workdays, s.wages ?? "", s.ranges.map((r) => `${dayIso(r.start)}..${dayIso(r.end)}`).join(" "),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// One row per calendar day: where the stays say you were, whether the day came
// from a stay or from the home-state gap assumption, and whether it was a
// weekday. This is the contemporaneous-log shape residency audits ask for;
// totals per state equal `analyze(spec).states[i].days` (checked in the tests).
export function dailyLog(spec) {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(errs.join(" "));
  const { start: y0, end: y1 } = yearBounds(spec.year);
  const convention = spec.convention === "nights" ? "nights" : "inclusive";
  const home = spec.homeState && /^[A-Z]{2}$/.test(spec.homeState) ? spec.homeState : null;
  const byDay = new Map();
  for (const s of spec.stays) {
    const b = convention === "nights" && s.end > s.start ? s.end - 1 : s.end;
    for (let d = Math.max(s.start, y0); d <= Math.min(b, y1); d++) {
      if (!byDay.has(d)) byDay.set(d, new Set());
      byDay.get(d).add(s.state);
    }
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = [];
  for (let d = y0; d <= y1; d++) {
    const set = byDay.get(d);
    const states = set ? [...set].sort() : home ? [home] : [];
    const basis = set ? (set.size > 1 ? "travel or overlap day" : "stay") : home ? "assumed (no stay listed)" : "not recorded";
    const dow = dayOfWeek(d);
    rows.push({ date: dayIso(d), weekday: names[dow], states, basis, weekdayWork: dow !== 0 && dow !== 6 });
  }
  return rows;
}

export function dailyLogCsv(spec) {
  const rows = [["Date", "Weekday", "State(s)", "Basis", "Weekday", "Evidence kept (fill in)"]];
  for (const r of dailyLog(spec)) rows.push([r.date, r.weekday, r.states.join("+"), r.basis, r.weekdayWork ? "Y" : "N", ""]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// A self-contained, printable audit packet: totals per state against the test,
// the date ranges behind each total, the notices, and the day-by-day log with a
// blank evidence column. Print it to PDF and keep it with the receipts. Every
// figure comes from `analyze` and `dailyLog`, so it equals the on-screen report.
export function auditReportHtml(spec, { name = "" } = {}) {
  const r = analyze(spec);
  const log = dailyLog(spec);
  const conv = r.convention === "nights" ? "nights (departure day not counted)" : "inclusive (arrival and departure days both count)";
  const stateRows = r.states.map((s) => `<tr><td>${esc(s.name)} (${esc(s.code)})</td><td class="n">${s.days}</td><td class="n">${s.assumedDays}</td><td class="n">${s.rule ? s.rule.limit : ""}</td><td>${esc(statusText(s))}</td><td>${s.ranges.map((g) => `${dayIso(g.start)} to ${dayIso(g.end)} (${g.days})`).join("<br>")}</td></tr>`).join("");
  const notices = r.notices.length ? `<h2>Notices</h2><ul>${r.notices.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "";
  const logRows = log.map((d) => `<tr><td>${d.date}</td><td>${d.weekday}</td><td>${esc(d.states.join("+"))}</td><td>${esc(d.basis)}</td><td class="ev"></td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Residency day record ${r.year}${name ? " - " + esc(name) : ""}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:22px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 6px;text-align:left;vertical-align:top}.n{text-align:right}.ev{width:30%}.small{font-size:12px;color:#444}@media print{.log tr{page-break-inside:avoid}}</style></head><body>
<h1>Residency day record, ${r.year}${name ? ` - ${esc(name)}` : ""}</h1>
<p class="small">Counting convention: ${esc(conv)}. ${r.totalDays} days in the year; ${r.daysCounted} state-days counted.</p>
<h2>Days by state</h2>
<table><thead><tr><th>State</th><th class="n">Days</th><th class="n">Assumed</th><th class="n">Limit</th><th>Against the commonly published test</th><th>Date ranges (days)</th></tr></thead><tbody>${stateRows}</tbody></table>
${notices}
<h2>Day-by-day log</h2>
<table class="log"><thead><tr><th>Date</th><th>Day</th><th>State(s)</th><th>Basis</th><th>Evidence kept (card statement, boarding pass, receipt)</th></tr></thead><tbody>${logRows}</tbody></table>
<p class="small">Prepared with the State Residency Day Counter from dates the user typed or imported. An organising aid, not tax or legal advice; it does not decide residency (domicile, ties, abode, part-year rules and reciprocity are not modelled) and the state tests are summaries that may be out of date. Check the state's own guidance.</p>
</body></html>`;
}
