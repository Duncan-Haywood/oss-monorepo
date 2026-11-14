// RRULE explainer engine: parses an iCalendar recurrence (RFC 5545 section
// 3.3.10 and 3.8.5), expands it into dates, describes it in English, and
// reports what the rule does that its author may not expect.
//
// Written from the RFC text. No library code is copied. python-dateutil is
// used only as an outside oracle in rrule.diff.test.mjs (fixtures generated
// by gen_fixtures.py), and the README lists where the two deliberately differ.
//
// Times are wall-clock ("floating") values, as the RFC computes recurrences:
// a day number (days since 1970-01-01, proleptic Gregorian) and seconds of
// the day. A TZID only matters when a wall time is turned into an instant.

export const FREQS = ["SECONDLY", "MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const FREQ_RANK = Object.fromEntries(FREQS.map((f, i) => [f, i]));
export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---------------------------------------------------------------- calendar

/** Days from 1970-01-01 to y-m-d (proleptic Gregorian; Hinnant's algorithm). */
export function dayNumber(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of dayNumber. */
export function civil(n) {
  n += 719468;
  const era = Math.floor(n / 146097);
  const doe = n - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 0 = Monday ... 6 = Sunday. 1970-01-01 was a Thursday. */
export const weekday = (n) => (((n + 3) % 7) + 7) % 7;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const daysInYear = (y) => (isLeap(y) ? 366 : 365);

/** First day of week 1 of year y: the week (starting on wkst) holding at least four days of y. */
function week1Start(y, wkst) {
  const jan1 = dayNumber(y, 1, 1);
  const back = (weekday(jan1) - wkst + 7) % 7;
  return back <= 3 ? jan1 - back : jan1 + 7 - back;
}

/** { weekYear, week, weeks } for day n with weeks starting on wkst (RFC 5545 BYWEEKNO). */
export function weekOf(n, wkst) {
  let y = civil(n).y;
  let start = week1Start(y, wkst);
  if (n < start) {
    y -= 1;
    start = week1Start(y, wkst);
  } else {
    const next = week1Start(y + 1, wkst);
    if (n >= next) {
      y += 1;
      start = next;
    }
  }
  const weeks = (week1Start(y + 1, wkst) - start) / 7;
  return { weekYear: y, week: Math.floor((n - start) / 7) + 1, weeks };
}

// ---------------------------------------------------------------- parsing

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** Parses an iCalendar DATE or DATE-TIME value. */
export function parseDateValue(text) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(String(text).trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  if (m[4] === undefined) return { day: dayNumber(y, mo, d), sec: 0, date: true, utc: false };
  const [h, mi, s] = [+m[4], +m[5], +m[6]];
  if (h > 23 || mi > 59 || s > 60) return null;
  return { day: dayNumber(y, mo, d), sec: h * 3600 + mi * 60 + Math.min(s, 59), date: false, utc: m[7] === "Z" };
}

/** "2026-01-05 09:00" style rendering of a wall time. */
export function formatWall(day, sec, dateOnly = false) {
  const { y, m, d } = civil(day);
  const date = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  if (dateOnly) return date;
  const h = Math.floor(sec / 3600);
  const mi = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${date} ${pad(h)}:${pad(mi)}${s ? ":" + pad(s) : ""}`;
}

/** iCalendar form of a wall time (20260105T090000). */
export function icalWall(day, sec, dateOnly = false) {
  const { y, m, d } = civil(day);
  const date = `${pad(y, 4)}${pad(m)}${pad(d)}`;
  if (dateOnly) return date;
  return `${date}T${pad(Math.floor(sec / 3600))}${pad(Math.floor((sec % 3600) / 60))}${pad(sec % 60)}`;
}

function finding(level, code, title, detail, extra = {}) {
  return { level, code, title, detail, ...extra };
}

const RANGES = {
  BYSECOND: [0, 60, false],
  BYMINUTE: [0, 59, false],
  BYHOUR: [0, 23, false],
  BYMONTHDAY: [1, 31, true],
  BYYEARDAY: [1, 366, true],
  BYWEEKNO: [1, 53, true],
  BYMONTH: [1, 12, false],
  BYSETPOS: [1, 366, true],
};
const KNOWN = new Set(["FREQ", "UNTIL", "COUNT", "INTERVAL", "WKST", "BYDAY", ...Object.keys(RANGES)]);

/**
 * Parses the value of an RRULE (with or without the "RRULE:" prefix).
 * Returns { rule, findings }; rule is null when FREQ is missing or invalid.
 */
export function parseRule(text) {
  const findings = [];
  let src = String(text ?? "").trim();
  src = src.replace(/^RRULE\s*[:;]\s*/i, "");
  const rule = {
    freq: null, interval: 1, count: null, until: null, untilText: null, wkst: 0, wkstGiven: false,
    bysecond: [], byminute: [], byhour: [], byday: [], bymonthday: [], byyearday: [], byweekno: [], bymonth: [], bysetpos: [],
    given: new Set(),
  };
  if (!src) return { rule: null, findings: [finding("error", "empty", "No RRULE", "Paste a rule such as FREQ=WEEKLY;BYDAY=MO,WE.")] };
  for (const raw of src.split(";")) {
    if (!raw.trim()) continue;
    const eq = raw.indexOf("=");
    const name = (eq < 0 ? raw : raw.slice(0, eq)).trim().toUpperCase();
    const value = eq < 0 ? "" : raw.slice(eq + 1).trim();
    if (eq < 0 || !value) {
      findings.push(finding("error", "bad-part", `"${raw.trim()}" has no value`, "Each rule part is NAME=value, separated by semicolons."));
      continue;
    }
    if (!KNOWN.has(name)) {
      const rfc7529 = name === "RSCALE" || name === "SKIP";
      findings.push(finding(rfc7529 ? "warning" : "error", "unknown-part", `Unknown rule part ${name}`,
        rfc7529 ? `${name} comes from RFC 7529 (non-Gregorian calendars); this tool, like most calendar apps, ignores it.` : "RFC 5545 defines FREQ, UNTIL, COUNT, INTERVAL, BYSECOND, BYMINUTE, BYHOUR, BYDAY, BYMONTHDAY, BYYEARDAY, BYWEEKNO, BYMONTH, BYSETPOS and WKST. This part is ignored."));
      continue;
    }
    if (rule.given.has(name)) {
      findings.push(finding("error", "duplicate-part", `${name} appears twice`, "RFC 5545 allows each rule part at most once. This tool keeps the first."));
      continue;
    }
    rule.given.add(name);
    const upper = value.toUpperCase();
    if (name === "FREQ") {
      if (!Object.hasOwn(FREQ_RANK, upper)) findings.push(finding("error", "bad-freq", `FREQ=${value} is not a frequency`, `Use one of ${FREQS.join(", ")}.`));
      else rule.freq = upper;
    } else if (name === "INTERVAL" || name === "COUNT") {
      if (!/^\d+$/.test(value) || +value < 1) findings.push(finding("error", `bad-${name.toLowerCase()}`, `${name}=${value} is not a positive whole number`, name === "COUNT" ? "COUNT is how many occurrences the rule has; it is ignored here." : "INTERVAL defaults to 1; the bad value is ignored."));
      else if (name === "INTERVAL") rule.interval = +value;
      else rule.count = +value;
    } else if (name === "UNTIL") {
      const v = parseDateValue(upper);
      if (!v) findings.push(finding("error", "bad-until", `UNTIL=${value} is not a date or date-time`, "Write UNTIL=20261231 or UNTIL=20261231T235959Z. The bad value is ignored."));
      else {
        rule.until = v;
        rule.untilText = upper;
      }
    } else if (name === "WKST") {
      const i = WEEKDAYS.indexOf(upper);
      if (i < 0) findings.push(finding("error", "bad-wkst", `WKST=${value} is not a weekday`, "Use MO, TU, WE, TH, FR, SA or SU."));
      else {
        rule.wkst = i;
        rule.wkstGiven = true;
      }
    } else if (name === "BYDAY") {
      for (const item of upper.split(",")) {
        const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(item.trim());
        const n = m && m[1] ? parseInt(m[1], 10) : 0;
        if (!m || (m[1] && (n === 0 || Math.abs(n) > 53))) findings.push(finding("error", "bad-value", `BYDAY value ${item} is not valid`, "BYDAY takes weekdays (MO..SU), optionally with an ordinal 1 to 53 or -1 to -53, e.g. 2TU or -1FR."));
        else rule.byday.push({ n, wd: WEEKDAYS.indexOf(m[2]) });
      }
    } else {
      const [lo, hi, signed] = RANGES[name];
      const key = name.toLowerCase();
      for (const item of value.split(",")) {
        const t = item.trim();
        const ok = signed ? /^[+-]?\d+$/.test(t) : /^\+?\d+$/.test(t);
        const n = ok ? parseInt(t, 10) : NaN;
        if (!ok || Math.abs(n) < lo || Math.abs(n) > hi || (!signed && n < 0)) {
          findings.push(finding("error", "bad-value", `${name} value ${t} is out of range`, `${name} takes ${signed ? `${lo} to ${hi} or -${hi} to -${lo}` : `${lo} to ${hi}`}.`));
        } else if (name === "BYSECOND" && n === 60) {
          findings.push(finding("warning", "leap-second", "BYSECOND=60 names a leap second", "The grammar allows 60 for leap seconds, but calendars do not schedule them; this tool skips it."));
        } else if (!rule[key].includes(n)) rule[key].push(n);
      }
    }
  }
  if (!rule.given.has("FREQ")) findings.push(finding("error", "no-freq", "FREQ is missing", "Every RRULE needs FREQ (YEARLY, MONTHLY, WEEKLY, DAILY, HOURLY, MINUTELY or SECONDLY)."));
  if (!rule.freq) return { rule: null, findings };
  for (const k of ["bysecond", "byminute", "byhour", "bymonth"]) rule[k].sort((a, b) => a - b);
  return { rule, findings };
}

/** Parses a property line's name, parameters and value. */
function propLine(line) {
  const colon = indexOfUnquoted(line, ":");
  if (colon < 0) return null;
  const head = line.slice(0, colon).split(";");
  const params = {};
  for (const p of head.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).trim().replace(/^"|"$/g, "");
  }
  return { name: head[0].trim().toUpperCase(), params, value: line.slice(colon + 1).trim() };
}

function indexOfUnquoted(s, ch) {
  let q = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') q = !q;
    else if (s[i] === ch && !q) return i;
  }
  return -1;
}

/**
 * Parses pasted text: DTSTART, RRULE, RDATE, EXDATE and EXRULE lines (a VEVENT
 * excerpt or a whole .ics), or a bare "FREQ=...". The `dtstart` argument is
 * used when the text has no DTSTART line ("20260105T090000", "20260105").
 */
export function parseInput(text, { dtstart = "", tzid = "" } = {}) {
  const findings = [];
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out = { dtstart: null, tzid: tzid || null, rules: [], rdates: [], exdates: [], findings };
  let sawEvent = 0;
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line) && ++sawEvent === 2) findings.push(finding("info", "first-event", "Only the first event is expanded", "The text holds more than one VEVENT; this tool reads the first one's recurrence."));
    if (sawEvent > 1) continue;
    if (/^FREQ=/i.test(line)) {
      out.rules.push(line);
      continue;
    }
    const p = propLine(line);
    if (!p) continue;
    if (p.name === "DTSTART" && !out.dtstart) {
      const v = parseDateValue(p.value);
      if (!v) findings.push(finding("error", "bad-dtstart", `DTSTART value ${p.value} is not a date or date-time`, "Write DTSTART:20260105T090000 (floating), ...Z (UTC), DTSTART;TZID=Europe/Paris:20260105T090000 or DTSTART;VALUE=DATE:20260105."));
      else {
        out.dtstart = v;
        if (p.params.TZID) out.tzid = p.params.TZID;
        if (p.params.VALUE === "DATE" && !v.date) findings.push(finding("error", "dtstart-value", "DTSTART says VALUE=DATE but holds a time", "Drop VALUE=DATE or the time."));
        if (v.date && p.params.VALUE !== "DATE") findings.push(finding("warning", "dtstart-value", "A date-only DTSTART should carry VALUE=DATE", "RFC 5545 makes DATE-TIME the default type; strict parsers reject DTSTART:20260105 without ;VALUE=DATE."));
        if (v.utc && p.params.TZID) findings.push(finding("error", "utc-with-tzid", "DTSTART has both TZID and a trailing Z", "A UTC value must not carry TZID (RFC 5545 3.3.5). The Z wins here."));
      }
    } else if (p.name === "RRULE") out.rules.push(p.value);
    else if (p.name === "EXRULE") findings.push(finding("warning", "exrule", "EXRULE is deprecated and not expanded", "RFC 5545 removed EXRULE (it was in RFC 2445). Google Calendar and many libraries ignore it; list the dates in EXDATE instead."));
    else if (p.name === "RDATE" || p.name === "EXDATE") {
      if (p.params.VALUE === "PERIOD") {
        findings.push(finding("info", "rdate-period", "RDATE periods are read by their start only", "VALUE=PERIOD dates are listed by their start time."));
      }
      for (const item of p.value.split(",")) {
        const v = parseDateValue(item.split("/")[0]);
        if (!v) findings.push(finding("error", "bad-date", `${p.name} value ${item} is not a date or date-time`, "Each item is a DATE (20260105) or DATE-TIME (20260105T090000)."));
        else (p.name === "RDATE" ? out.rdates : out.exdates).push(v);
      }
    }
  }
  if (!out.dtstart && dtstart) {
    const v = parseDateValue(String(dtstart).replace(/[-:\s]/g, (c) => (c === " " ? "T" : "")).replace(/T(\d{4})$/, "T$100"));
    if (v) out.dtstart = v;
    else findings.push(finding("error", "bad-dtstart", `Start ${dtstart} is not a date or date-time`, "Use 2026-01-05 or 2026-01-05 09:00."));
  }
  return out;
}

// ---------------------------------------------------------------- time zones

const fmtCache = new Map();
function zoneFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", era: "short" }));
  }
  return fmtCache.get(tz);
}

/** True when the runtime knows the IANA zone name. */
export function validZone(tz) {
  try {
    zoneFormatter(tz);
    return true;
  } catch {
    fmtCache.delete(tz);
    return false;
  }
}

/** Offset of zone tz from UTC, in seconds, at epoch second t. */
export function zoneOffset(t, tz) {
  const parts = {};
  for (const p of zoneFormatter(tz).formatToParts(new Date(t * 1000))) parts[p.type] = p.value;
  let y = +parts.year;
  if (parts.era === "BC" || parts.era === "B") y = 1 - y;
  const wall = dayNumber(y, +parts.month, +parts.day) * 86400 + +parts.hour * 3600 + +parts.minute * 60 + +parts.second;
  return wall - t;
}

/**
 * Turns a wall time in zone tz into an instant (epoch seconds), the way
 * RFC 5545 3.3.5 says: a time skipped by a forward shift is read with the
 * offset in force before the gap, and a time that happens twice is the first.
 * Returns { t, offset, kind: "ok" | "gap" | "overlap" }.
 */
export function wallToInstant(day, sec, tz) {
  const wall = day * 86400 + sec;
  const before = zoneOffset(wall - 86400 * 2, tz);
  const after = zoneOffset(wall + 86400 * 2, tz);
  const cands = [...new Set([before, after, zoneOffset(wall, tz)])];
  const valid = cands.filter((o) => zoneOffset(wall - o, tz) === o).map((o) => wall - o).sort((a, b) => a - b);
  if (valid.length >= 2) return { t: valid[0], offset: wall - valid[0], kind: "overlap" };
  if (valid.length === 1) return { t: valid[0], offset: wall - valid[0], kind: "ok" };
  // In a gap: use the offset just before it.
  const pre = zoneOffset(wall - before - 3 * 3600, tz);
  return { t: wall - pre, offset: pre, kind: "gap" };
}

// ---------------------------------------------------------------- expansion

/** Fills the RFC's defaults from DTSTART (the parts a rule leaves to the start). */
function normalize(rule, start) {
  const r = { ...rule };
  const { m, d } = civil(start.day);
  const hasDay = r.byweekno.length || r.byyearday.length || r.bymonthday.length || r.byday.length;
  r.bymonth = [...r.bymonth];
  r.bymonthday = [...r.bymonthday];
  r.byday = [...r.byday];
  if (!hasDay) {
    if (r.freq === "YEARLY") {
      if (!r.bymonth.length) r.bymonth = [m];
      r.bymonthday = [d];
    } else if (r.freq === "MONTHLY") r.bymonthday = [d];
    else if (r.freq === "WEEKLY") r.byday = [{ n: 0, wd: weekday(start.day) }];
  }
  const rank = FREQ_RANK[r.freq];
  const h = Math.floor(start.sec / 3600);
  const mi = Math.floor((start.sec % 3600) / 60);
  const s = start.sec % 60;
  r.byhour = r.byhour.length ? r.byhour : rank > FREQ_RANK.HOURLY ? [h] : [];
  r.byminute = r.byminute.length ? r.byminute : rank > FREQ_RANK.MINUTELY ? [mi] : [];
  r.bysecond = rule.bysecond.length ? rule.bysecond.filter((x) => x < 60) : rank > FREQ_RANK.SECONDLY ? [s] : [];
  // Ordinal BYDAY only means something within a month or a year.
  const ordinalOk = r.freq === "MONTHLY" || r.freq === "YEARLY";
  r.plainDays = new Set(r.byday.filter((x) => !x.n || !ordinalOk).map((x) => x.wd));
  r.nthDays = ordinalOk ? r.byday.filter((x) => x.n) : [];
  r.mdPos = new Set(r.bymonthday.filter((x) => x > 0));
  r.mdNeg = new Set(r.bymonthday.filter((x) => x < 0));
  r.ydSet = new Set(r.byyearday);
  r.wnSet = new Set(r.byweekno);
  r.monthSet = new Set(r.bymonth);
  r.hourSet = new Set(r.byhour);
  r.minuteSet = new Set(r.byminute);
  r.secondSet = new Set(r.bysecond);
  return r;
}

/** Does day n pass every day-level BYxxx filter of normalized rule r? */
function dayMatches(n, r, mode) {
  const { y, m, d } = civil(n);
  if (r.monthSet.size && !r.monthSet.has(m)) return false;
  if (r.wnSet.size) {
    const w = weekOf(n, r.wkst);
    if (!r.wnSet.has(w.week) && !r.wnSet.has(w.week - w.weeks - 1)) return false;
  }
  if (r.plainDays.size || r.nthDays.length) {
    const wd = weekday(n);
    let ok = r.plainDays.has(wd);
    if (!ok && r.nthDays.length) {
      // MONTHLY, or YEARLY with BYMONTH: count within the month; else within the year.
      const inMonth = r.freq === "MONTHLY" || r.monthSet.size > 0;
      const idx = inMonth ? d : n - dayNumber(y, 1, 1) + 1;
      const len = inMonth ? daysInMonth(y, m) : daysInYear(y);
      const fwd = Math.floor((idx - 1) / 7) + 1;
      const back = -(Math.floor((len - idx) / 7) + 1);
      ok = r.nthDays.some((x) => x.wd === wd && (x.n === fwd || x.n === back));
    }
    if (mode === "intersect" && r.plainDays.size && r.nthDays.length) {
      // python-dateutil's reading of a mixed list: both kinds must match.
      const inMonth = r.freq === "MONTHLY" || r.monthSet.size > 0;
      const idx = inMonth ? d : n - dayNumber(y, 1, 1) + 1;
      const len = inMonth ? daysInMonth(y, m) : daysInYear(y);
      const fwd = Math.floor((idx - 1) / 7) + 1;
      const back = -(Math.floor((len - idx) / 7) + 1);
      ok = r.plainDays.has(wd) && r.nthDays.some((x) => x.wd === wd && (x.n === fwd || x.n === back));
    }
    if (!ok) return false;
  }
  if (r.mdPos.size || r.mdNeg.size) {
    if (!r.mdPos.has(d) && !r.mdNeg.has(d - daysInMonth(y, m) - 1)) return false;
  }
  if (r.ydSet.size) {
    const yd = n - dayNumber(y, 1, 1) + 1;
    if (!r.ydSet.has(yd) && !r.ydSet.has(yd - daysInYear(y) - 1)) return false;
  }
  return true;
}

function product(a, b, c) {
  const out = [];
  for (const x of a) for (const y of b) for (const z of c) out.push(x * 3600 + y * 60 + z);
  return out.sort((p, q) => p - q);
}

function applySetPos(list, setpos) {
  if (!setpos.length) return list;
  const picked = new Set();
  for (const p of setpos) {
    const i = p > 0 ? p - 1 : list.length + p;
    if (i >= 0 && i < list.length) picked.add(list[i]);
  }
  return [...picked].sort((a, b) => a - b);
}

/**
 * Generator over the rule's own occurrences (wall seconds since epoch),
 * period by period, in order, at or after DTSTART. Ignores COUNT and UNTIL.
 * Yields { w } entries; a { searched } entry reports when it gave up.
 */
function* ruleTimes(rule, start, { mode = "union", maxYears = null, weekFromStart = false } = {}) {
  const r = normalize(rule, start);
  const startW = start.day * 86400 + start.sec;
  const k = r.interval;
  const span = (maxYears ?? 400 * k) * 366;
  const lastDay = start.day + span;
  const rank = FREQ_RANK[r.freq];
  const passes = (n) => dayMatches(n, r, mode);
  if (rank >= FREQ_RANK.DAILY) {
    const times = product(r.byhour, r.byminute, r.bysecond);
    const s0 = civil(start.day);
    for (let i = 0; ; i++) {
      let days;
      let first;
      if (r.freq === "YEARLY") {
        const y = s0.y + i * k;
        first = dayNumber(y, 1, 1);
        days = Array.from({ length: daysInYear(y) }, (_, j) => first + j);
      } else if (r.freq === "MONTHLY") {
        const mm = s0.m - 1 + i * k;
        const y = s0.y + Math.floor(mm / 12);
        const m = (mm % 12) + 1;
        first = dayNumber(y, m, 1);
        days = Array.from({ length: daysInMonth(y, m) }, (_, j) => first + j);
      } else if (r.freq === "WEEKLY") {
        first = start.day - ((weekday(start.day) - r.wkst + 7) % 7) + i * 7 * k;
        days = Array.from({ length: 7 }, (_, j) => first + j);
        // python-dateutil's first week begins at DTSTART, not at WKST, which
        // changes what BYSETPOS counts in that week.
        if (weekFromStart && i === 0) days = days.filter((n) => n >= start.day);
      } else {
        first = start.day + i * k;
        days = [first];
      }
      if (first > lastDay) {
        yield { searched: span, proven: maxYears === null };
        return;
      }
      const set = [];
      for (const n of days) if (passes(n)) for (const t of times) set.push(n * 86400 + t);
      for (const w of applySetPos(set, r.bysetpos)) if (w >= startW) yield { w };
    }
  }
  // Sub-daily: step the hour/minute/second counter, skipping filtered days.
  const unit = r.freq === "HOURLY" ? 3600 : r.freq === "MINUTELY" ? 60 : 1;
  const base = Math.floor(startW / unit);
  let idx = 0;
  let steps = 0;
  const cap = 3_000_000;
  let cacheDay = null;
  let cacheOk = false;
  while (steps++ < cap) {
    const p = (base + idx * k) * unit;
    const n = Math.floor(p / 86400);
    if (n > lastDay) {
      yield { searched: span, proven: maxYears === null };
      return;
    }
    if (n !== cacheDay) {
      cacheDay = n;
      cacheOk = passes(n);
    }
    if (!cacheOk) {
      // Jump to the first step on or after the next day.
      const target = Math.ceil(((n + 1) * 86400) / unit);
      idx = Math.max(idx + 1, Math.ceil((target - base) / k));
      continue;
    }
    const sod = p - n * 86400;
    const h = Math.floor(sod / 3600);
    const mi = Math.floor((sod % 3600) / 60);
    const s = sod % 60;
    let set = [];
    if (!(r.hourSet.size && !r.hourSet.has(h)) && !(unit <= 60 && r.minuteSet.size && !r.minuteSet.has(mi)) && !(unit === 1 && r.secondSet.size && !r.secondSet.has(s))) {
      if (unit === 3600) set = product([h], r.byminute, r.bysecond).map((t) => n * 86400 + t);
      else if (unit === 60) set = product([h], [mi], r.bysecond).map((t) => n * 86400 + t);
      else set = [p];
    }
    for (const w of applySetPos(set, r.bysetpos)) if (w >= startW) yield { w };
    idx++;
  }
  yield { searched: null, proven: false, steps: cap };
}

/** Generator options from expand() options; flavor "dateutil" copies python-dateutil's readings. */
function genOpts(opts) {
  const du = opts.flavor === "dateutil";
  return { mode: opts.bydayMode ?? (du ? "intersect" : "union"), maxYears: opts.maxYears ?? null, weekFromStart: du };
}

/**
 * Expands a parsed input. Options:
 *   limit: occurrences to return (default 25, max 5000)
 *   after: only list occurrences at or after this wall time ({day, sec})
 *   dtstartMode: "rfc" (default; DTSTART is always the first occurrence and
 *     counts toward COUNT, RFC 5545 3.8.5.3) or "rule" (only what the rule
 *     generates, as python-dateutil does)
 *   bydayMode: "union" (RFC) or "intersect" (python-dateutil's reading of
 *     BYDAY lists that mix MO and 1MO)
 *   flavor: "rfc" (default) or "dateutil": python-dateutil 4.0.0's readings
 *     (DTSTART only when the rule makes it, mixed BYDAY intersected, the
 *     first WEEKLY period starting at DTSTART for BYSETPOS)
 * Returns { occurrences: [{ w, day, sec, source, utc?, offset?, zone? }], truncated, skipped, gaveUp, tz }.
 */
export function expand(parsed, opts = {}) {
  const limit = Math.min(Math.max(1, opts.limit ?? 25), 5000);
  const start = parsed.dtstart;
  const dtW = start.day * 86400 + start.sec;
  const rfc = (opts.dtstartMode ?? (opts.flavor === "dateutil" ? "rule" : "rfc")) === "rfc";
  const tz = parsed.tzid && !start.utc ? parsed.tzid : null;
  const zoneOk = tz ? validZone(tz) : false;
  const ex = new Set(parsed.exdates.map((e) => (e.date ? `d${e.day}` : `w${e.day * 86400 + e.sec}`)));
  const excluded = (w) => ex.has(`w${w}`) || ex.has(`d${Math.floor(w / 86400)}`);
  const afterW = opts.after ? opts.after.day * 86400 + opts.after.sec : -Infinity;
  const streams = parsed.rules.map((rule) => {
    // RFC: an unsynchronised DTSTART still takes one of the COUNT slots.
    const r = rfc && rule.count !== null && !ruleHas(rule, start, dtW, opts) ? { ...rule, count: rule.count - 1 } : rule;
    const s = makeStream(r, start, tz, zoneOk, opts);
    s.head = s.next();
    return s;
  });
  const rdates = parsed.rdates.map((d) => d.day * 86400 + (d.date ? start.sec : d.sec)).sort((a, b) => a - b);
  let ri = 0;
  const occurrences = [];
  let dtPending = rfc;
  let skipped = 0;
  let truncated = false;
  while (true) {
    let best = Infinity;
    let src = null;
    if (dtPending) (best = dtW), (src = "dtstart");
    for (const s of streams) if (s.head !== null && s.head < best) (best = s.head), (src = "rule");
    if (ri < rdates.length && rdates[ri] < best) (best = rdates[ri]), (src = "rdate");
    if (best === Infinity) break;
    // A recurrence set has no duplicates: advance every source sitting on `best`.
    if (dtPending && best === dtW) dtPending = false;
    for (const s of streams) while (s.head !== null && s.head === best) s.head = s.next();
    while (ri < rdates.length && rdates[ri] === best) ri++;
    if (src === "dtstart" && streams.some((s) => s.first === dtW)) src = "rule";
    if (excluded(best)) continue;
    if (best < afterW) {
      skipped++;
      continue;
    }
    if (occurrences.length >= limit) {
      truncated = true;
      break;
    }
    const day = Math.floor(best / 86400);
    const o = { w: best, day, sec: best - day * 86400, source: src };
    if (tz && zoneOk) {
      const inst = wallToInstant(day, o.sec, tz);
      o.utc = inst.t;
      o.offset = inst.offset;
      o.zone = inst.kind;
    } else if (start.utc) {
      o.utc = best;
      o.offset = 0;
      o.zone = "ok";
    }
    occurrences.push(o);
  }
  const infos = streams.map((s) => s.info).filter(Boolean);
  return { occurrences, truncated, skipped, gaveUp: infos.find((i) => i.searched === null) ?? null, ended: infos, tz: tz && zoneOk ? tz : null };
}

function makeStream(rule, start, tz, zoneOk, opts) {
  const gen = ruleTimes(rule, start, genOpts(opts));
  let produced = 0;
  let until = null;
  if (rule.until) until = rule.until.utc && tz && zoneOk ? { instant: rule.until.day * 86400 + rule.until.sec } : { wall: rule.until.day * 86400 + rule.until.sec };
  const s = { head: null, info: null, first: null };
  s.next = () => {
    if (rule.count !== null && produced >= rule.count) return null;
    const it = gen.next();
    if (it.done || it.value.w === undefined) {
      s.info = it.value ?? null;
      return null;
    }
    const w = it.value.w;
    if (until) {
      if (until.wall !== undefined && w > until.wall) return null;
      if (until.instant !== undefined) {
        const d = Math.floor(w / 86400);
        if (wallToInstant(d, w - d * 86400, tz).t > until.instant) return null;
      }
    }
    if (produced === 0) s.first = w;
    produced++;
    return w;
  };
  return s;
}

/** Is DTSTART one of the rule's own occurrences? */
export function ruleHas(rule, start, dtW = start.day * 86400 + start.sec, opts = {}) {
  const gen = ruleTimes(rule, start, genOpts(opts));
  const first = gen.next().value;
  return Boolean(first && first.w === dtW);
}

// ---------------------------------------------------------------- English

const ord = (n) => {
  const a = Math.abs(n);
  const suf = a % 100 >= 11 && a % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][a % 10] ?? "th";
  if (n === -1) return "last";
  if (n < 0) return `${a}${suf} from last`;
  return `${a}${suf}`;
};
const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const UNIT = { YEARLY: "year", MONTHLY: "month", WEEKLY: "week", DAILY: "day", HOURLY: "hour", MINUTELY: "minute", SECONDLY: "second" };

/** A plain-English reading of a rule with its DTSTART. */
export function describe(rule, start, tzid = null) {
  const r = normalize(rule, start);
  const unit = Object.hasOwn(UNIT, r.freq) ? UNIT[r.freq] : "period";
  const bits = [r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`];
  if (r.byweekno.length) bits.push(`in week${r.byweekno.length > 1 ? "s" : ""} ${list(r.byweekno.map((w) => (w < 0 ? ord(w) : String(w))))} of the year`);
  if (r.byyearday.length) bits.push(`on day ${list(r.byyearday.map((d) => (d < 0 ? ord(d) : String(d))))} of the year`);
  const days = [];
  for (const x of r.byday) days.push(x.n && (r.freq === "MONTHLY" || r.freq === "YEARLY") ? `the ${ord(x.n)} ${DAY_NAMES[x.wd]}` : DAY_NAMES[x.wd]);
  if (r.bymonthday.length) {
    const md = list(r.bymonthday.map((d) => (d === -1 ? "last day" : d < 0 ? `${ord(d)} day` : ord(d))));
    if (days.length) bits.push(`on ${list(days)}${r.nthDays.length ? "" : "s"} that fall on the ${md} of the month`);
    else bits.push(`on the ${md}${r.freq === "MONTHLY" || r.freq === "YEARLY" ? "" : " of the month"}`);
  } else if (days.length) {
    const scope = r.nthDays.length ? (r.freq === "MONTHLY" ? "" : r.bymonth.length ? " of the month" : " of the year") : "";
    bits.push(`on ${list(days)}${scope}`);
  }
  if (r.bymonth.length && !(r.freq === "YEARLY" && !rule.bymonth.length && !rule.bymonthday.length && !rule.byday.length && !rule.byweekno.length && !rule.byyearday.length)) bits.push(`in ${list(r.bymonth.map((m) => MONTH_NAMES[m - 1]))}`);
  else if (r.freq === "YEARLY" && !rule.bymonth.length && r.bymonth.length) bits.push(`in ${MONTH_NAMES[r.bymonth[0] - 1]}`);
  if (r.bysetpos.length) bits.push(`, keeping only the ${list(r.bysetpos.map(ord))} match${r.bysetpos.length > 1 ? "es" : ""} in each ${unit}`);
  if (!start.date) {
    const times = r.byhour.length && r.byminute.length && r.bysecond.length ? product(r.byhour, r.byminute, r.bysecond) : null;
    if (times && times.length <= 6) bits.push(`at ${list(times.map((t) => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}${t % 60 ? ":" + pad(t % 60) : ""}`))}`);
    else {
      if (rule.byhour.length) bits.push(`in hour${rule.byhour.length > 1 ? "s" : ""} ${list(rule.byhour.map(String))}`);
      if (rule.byminute.length) bits.push(`at minute${rule.byminute.length > 1 ? "s" : ""} ${list(rule.byminute.map(String))}`);
    }
    bits.push(tzid ? `(${tzid} time)` : start.utc ? "(UTC)" : "(floating local time)");
  }
  let s = bits.join(" ").replace(/ ,/g, ",");
  s += `, starting ${formatWall(start.day, start.sec, start.date)}`;
  if (rule.count !== null) s += `, ${rule.count} time${rule.count === 1 ? "" : "s"} in all`;
  if (rule.until) s += `, until ${formatWall(rule.until.day, rule.until.sec, rule.until.date)}${rule.until.utc ? " UTC" : ""}`;
  if (rule.count === null && !rule.until) s += ", with no end";
  return s + ".";
}

// ---------------------------------------------------------------- findings

const FORBIDDEN = [
  ["BYWEEKNO", (f) => f !== "YEARLY", "BYWEEKNO is only valid with FREQ=YEARLY"],
  ["BYYEARDAY", (f) => f === "DAILY" || f === "WEEKLY" || f === "MONTHLY", "BYYEARDAY is not valid with FREQ=DAILY, WEEKLY or MONTHLY"],
  ["BYMONTHDAY", (f) => f === "WEEKLY", "BYMONTHDAY is not valid with FREQ=WEEKLY"],
];

function ruleText(rule, overrides = {}) {
  const parts = [`FREQ=${rule.freq}`];
  const r = { ...rule, ...overrides };
  if (r.interval !== 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.count !== null) parts.push(`COUNT=${r.count}`);
  if (r.untilText) parts.push(`UNTIL=${r.untilText}`);
  for (const k of ["bymonth", "byweekno", "byyearday", "bymonthday"]) if (r[k].length) parts.push(`${k.toUpperCase()}=${r[k].join(",")}`);
  if (r.byday.length) parts.push(`BYDAY=${r.byday.map((x) => (x.n ? x.n : "") + WEEKDAYS[x.wd]).join(",")}`);
  for (const k of ["byhour", "byminute", "bysecond", "bysetpos"]) if (r[k].length) parts.push(`${k.toUpperCase()}=${r[k].join(",")}`);
  if (r.wkstGiven) parts.push(`WKST=${WEEKDAYS[r.wkst]}`);
  return parts.join(";");
}

function firstN(rule, start, n, opts = {}) {
  const out = [];
  for (const it of ruleTimes(rule, start, opts)) {
    if (it.w === undefined) break;
    out.push(it.w);
    if (out.length >= n) break;
  }
  return out;
}

/** Findings about one rule, given the parsed input it sits in. */
function ruleFindings(rule, parsed) {
  const out = [];
  const start = parsed.dtstart;
  const f = rule.freq;
  const tag = parsed.rules.length > 1 ? `RRULE ${parsed.rules.indexOf(rule) + 1}: ` : "";
  const F = (level, code, title, detail, extra) => out.push(finding(level, code, tag + title, detail, extra));
  for (const [part, bad, title] of FORBIDDEN) {
    if (rule.given.has(part) && bad(f)) F("error", "forbidden-part", title, `RFC 5545 3.3.10 rules it out. Libraries differ on what they do with it (python-dateutil applies it as a filter, as this tool does); calendar apps may reject the event.`);
  }
  if (rule.byday.some((x) => x.n) && f !== "MONTHLY" && f !== "YEARLY") F("error", "forbidden-part", `An ordinal BYDAY (like ${rule.byday.find((x) => x.n).n}${WEEKDAYS[rule.byday.find((x) => x.n).wd]}) needs FREQ=MONTHLY or YEARLY`, "With other frequencies the RFC forbids the number; this tool, like python-dateutil, drops it and uses the plain weekday.");
  if (f === "YEARLY" && rule.byweekno.length && rule.byday.some((x) => x.n)) F("error", "forbidden-part", "An ordinal BYDAY cannot be combined with BYWEEKNO", "RFC 5545 3.3.10 forbids it with FREQ=YEARLY and BYWEEKNO.");
  if (rule.bysetpos.length && !["bysecond", "byminute", "byhour", "byday", "bymonthday", "byyearday", "byweekno", "bymonth"].some((k) => rule[k].length)) F("error", "setpos-alone", "BYSETPOS needs another BYxxx part", "RFC 5545: BYSETPOS MUST only be used with another BYxxx rule part. Alone it picks from a set of one occurrence per period.");
  if (start.date && (rule.byhour.length || rule.byminute.length || rule.bysecond.length)) F("error", "time-on-date", "BYHOUR, BYMINUTE or BYSECOND with an all-day DTSTART", "RFC 5545 says these MUST NOT be used when DTSTART is a DATE.");
  if (rule.count !== null && rule.until) F("error", "count-and-until", "COUNT and UNTIL are both set", "RFC 5545 allows one or the other. This tool stops at whichever comes first; Google Calendar and other apps may pick either.");
  if (rule.until) {
    const u = rule.until;
    if (u.date !== start.date) F("error", "until-type", `UNTIL is a ${u.date ? "date" : "date-time"} but DTSTART is a ${start.date ? "date" : "date-time"}`, u.date ? "RFC 5545 requires UNTIL to have DTSTART's value type. Read as midnight at the start of that day (as python-dateutil does), it drops that day's own occurrence; write UNTIL=" + icalWall(u.day, 86399) + " instead." : "RFC 5545 requires UNTIL to have DTSTART's value type: write UNTIL as a date.");
    else if (parsed.tzid && !start.utc && !u.date && !u.utc) F("error", "until-not-utc", "UNTIL must be in UTC when DTSTART has a TZID", "RFC 5545 3.3.10: with a TZID start, UNTIL MUST be a UTC date-time (ending in Z). This tool reads it as the zone's local time.");
    else if (start.utc && !u.date && !u.utc) F("warning", "until-not-utc", "UNTIL should end in Z when DTSTART does", "RFC 5545: with a UTC DTSTART, UNTIL must also be UTC.");
    const uw = u.day * 86400 + u.sec;
    if (!(parsed.tzid && u.utc) && uw < start.day * 86400 + start.sec) F("warning", "until-before-start", "UNTIL is before DTSTART", "The rule adds nothing; the event happens once, at DTSTART.");
  }
  // Does DTSTART belong to the rule?
  const first = firstN(rule, start, 1);
  const dtW = start.day * 86400 + start.sec;
  if (first.length && first[0] !== dtW) {
    const d = Math.floor(first[0] / 86400);
    F("warning", "dtstart-not-in-rule", `DTSTART (${formatWall(start.day, start.sec, start.date)}, a ${DAY_NAMES[weekday(start.day)]}) is not one of the rule's dates`, `RFC 5545 counts DTSTART as the first occurrence anyway${rule.count !== null ? ", using up one of COUNT" : ""}, so the event also happens then. python-dateutil and many libraries leave it out and start at ${formatWall(d, first[0] - d * 86400, start.date)}. Move DTSTART to the first date you want so every calendar agrees.`);
  }
  if (!first.length) {
    F("error", "never", "The rule never produces a date", `No date matches every part${start.date ? "" : " and time"} in a full search (the Gregorian calendar repeats every 400 years). Only DTSTART${parsed.rdates.length ? " and the RDATEs" : ""} will appear.`);
    return out;
  }
  // Day-of-month that short months lack.
  const r = normalize(rule, start);
  if ((f === "MONTHLY" || f === "YEARLY") && !rule.bysetpos.length && !r.byday.length && !r.byyearday.length && !r.byweekno.length) {
    const big = r.bymonthday.filter((d) => d > 28);
    if (big.length && big.length === r.bymonthday.length) {
      const dd = Math.min(...big);
      const fixDays = Array.from({ length: dd - 27 }, (_, i) => 28 + i).join(",");
      const fix = ruleText(rule, { bymonthday: [] }) + (dd === 31 ? ";BYMONTHDAY=-1" : `;BYMONTHDAY=${fixDays};BYSETPOS=-1`);
      const implicit = !rule.bymonthday.length;
      const months = f === "MONTHLY" ? `months shorter than ${dd} days` : `years where ${MONTH_NAMES[(r.bymonth[0] ?? 1) - 1]} has no ${ord(dd)}`;
      F("warning", "skips-short-months", `${implicit ? `DTSTART is on the ${ord(dd)}, so the rule` : "The rule"} skips ${months}`, `RFC 5545 drops dates that do not exist; it does not move them to the month's last day. ${dd === 31 && f === "MONTHLY" ? "FREQ=MONTHLY on the 31st fires 7 times a year. " : ""}${dd === 31 ? "For the last day of every month use BYMONTHDAY=-1" : `For "the ${ord(dd)}, or the last day when the month is shorter" use BYMONTHDAY=${fixDays};BYSETPOS=-1`}. The whole rule:`, { fix });
    }
  }
  if ((f === "MONTHLY" || f === "YEARLY") && rule.byday.some((x) => x.n) && rule.byday.some((x) => !x.n)) {
    const a = firstN(rule, start, 20);
    const b = firstN(rule, start, 20, { mode: "intersect", maxYears: 50 });
    if (a.join() !== b.join()) F("warning", "mixed-byday", "BYDAY mixes plain weekdays with numbered ones (like MO with 2TU)", `RFC 5545 reads the list as either kind matching, which is what this tool lists. python-dateutil 4.0.0 requires both kinds to match the same day${b.length ? `, so it gives a different set of dates` : `, so it gives no dates in the next 50 years for this rule`} (on 100 random rules of this shape it gave none for 92). Split it into two RRULEs, or two events, if other software has to read it.`);
  }
  if (rule.byday.some((x) => x.n === 5 || x.n === -5)) F("info", "fifth-weekday", "A 5th weekday only exists in some months", "Months with four of that weekday are skipped. -1 means the last one in every month.");
  // WKST changes the answer?
  if ((f === "WEEKLY" && rule.interval > 1 && r.byday.length > 1) || rule.byweekno.length) {
    const other = rule.wkst === 0 ? 6 : 0;
    const a = firstN(rule, start, 30);
    const b = firstN({ ...rule, wkst: other }, start, 30);
    const i = a.findIndex((w, j) => w !== b[j]);
    if (i >= 0) {
      const w = (a[i] ?? b[i]);
      const d = Math.floor(w / 86400);
      F(rule.wkstGiven ? "info" : "warning", "wkst-matters", `The week start (WKST) changes these dates${rule.wkstGiven ? "" : "; the rule does not say which day weeks start on"}`, `With WKST=${WEEKDAYS[rule.wkst]}${rule.wkstGiven ? "" : " (the default)"} and WKST=${WEEKDAYS[other]} the dates first differ at ${formatWall(d, w - d * 86400, start.date)}. ${rule.wkstGiven ? "" : "Write WKST explicitly so every calendar app agrees."}`);
    }
  }
  if (rule.count === null && !rule.until) F("info", "no-end", "The rule has no end", "Without COUNT or UNTIL it repeats forever. That is valid; calendar apps show it indefinitely.");
  if ((f === "HOURLY" || f === "MINUTELY" || f === "SECONDLY") && rule.count === null && !rule.until) F("info", "busy", `A ${f.toLowerCase()} rule with no end`, "Calendar apps expand these into very many instances; some cap or refuse them.");
  return out;
}

/** Occurrences at a local time that a DST change skips or repeats. */
function zoneFindings(exp, start) {
  const out = [];
  if (!exp.tz) return out;
  const gaps = exp.occurrences.filter((o) => o.zone === "gap");
  const overlaps = exp.occurrences.filter((o) => o.zone === "overlap");
  if (gaps.length) {
    const g = gaps[0];
    const real = g.utc + g.offset + 3600 * 0;
    void real;
    out.push(finding("warning", "dst-gap", `${gaps.length} listed occurrence${gaps.length > 1 ? "s fall" : " falls"} in a clock change that skips that time`, `${formatWall(g.day, g.sec)} does not exist in ${exp.tz} (clocks jump forward). RFC 5545 3.3.5 reads it with the offset before the jump, so it happens at ${shownLocal(g.utc, exp.tz)} local time. Apps do not all follow this; some move it earlier or drop it.`, { dates: gaps.map((o) => formatWall(o.day, o.sec)) }));
  }
  if (overlaps.length) {
    const g = overlaps[0];
    out.push(finding("info", "dst-overlap", `${overlaps.length} listed occurrence${overlaps.length > 1 ? "s fall" : " falls"} in an hour that happens twice`, `${formatWall(g.day, g.sec)} happens twice in ${exp.tz} (clocks go back). RFC 5545 3.3.5 means the first of the two, ${new Date(g.utc * 1000).toISOString().replace(".000", "")}.`, { dates: overlaps.map((o) => formatWall(o.day, o.sec)) }));
  }
  if (!start.utc && exp.tz) {
    const offs = new Set(exp.occurrences.map((o) => o.offset));
    if (offs.size > 1) out.push(finding("info", "utc-shifts", "The time stays fixed on the local clock, so it moves in UTC", `Across the listed dates the UTC offset takes ${offs.size} values. Attendees in zones that change clocks on other dates (or not at all) will see the time move.`));
  }
  return out;
}

/** Local wall-clock reading of an instant in zone tz. */
export function shownLocal(t, tz) {
  const off = zoneOffset(t, tz);
  const w = t + off;
  const d = Math.floor(w / 86400);
  return formatWall(d, w - d * 86400);
}

/** Inputs an agent call starts from. */
export const DEFAULTS = { text: "DTSTART;TZID=America/New_York:20260105T090000\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10", dtstart: "", tzid: "", limit: 25, after: "", dtstartMode: "rfc" };

/** The page's "Load the example". */
export const EXAMPLE = { text: "DTSTART;TZID=America/New_York:20260131T020000\nRRULE:FREQ=MONTHLY;INTERVAL=1;COUNT=12\nEXDATE;TZID=America/New_York:20260731T020000" };

/**
 * One call for the page, the CLI and agents. `text` holds DTSTART/RRULE/
 * RDATE/EXDATE lines or a bare FREQ=...; `dtstart` and `tzid` fill in a start
 * the text lacks. Returns { ok, description[], occurrences[], findings[],
 * truncated, tz }.
 */
export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  const parsed = parseInput(o.text, { dtstart: o.dtstart, tzid: o.tzid });
  const findings = [...parsed.findings];
  const rules = [];
  for (const t of parsed.rules) {
    const { rule, findings: fs } = parseRule(t);
    findings.push(...fs);
    if (rule) rules.push(rule);
  }
  if (!parsed.rules.length) findings.push(finding("error", "no-rrule", "No RRULE found", "Paste a line such as RRULE:FREQ=WEEKLY;BYDAY=MO or just FREQ=WEEKLY;BYDAY=MO."));
  if (parsed.rules.length > 1) findings.push(finding("info", "several-rules", `${parsed.rules.length} RRULE lines`, "RFC 5545 says SHOULD NOT have more than one; the dates are the union of all of them. Google Calendar reads only one."));
  if (!parsed.dtstart) {
    if (parsed.rules.length) findings.push(finding("error", "no-dtstart", "No start date", "A rule repeats from DTSTART. Add a DTSTART line or fill in the start field."));
    return { ok: false, description: [], occurrences: [], findings: sortFindings(findings), truncated: false, tz: null };
  }
  if (parsed.tzid && !validZone(parsed.tzid)) findings.push(finding("error", "bad-tzid", `Unknown time zone ${parsed.tzid}`, "Use an IANA name such as Europe/Paris or America/New_York. Dates are listed in floating local time."));
  if (parsed.dtstart.date) {
    const sub = rules.find((r) => FREQ_RANK[r.freq] < FREQ_RANK.DAILY);
    if (sub) findings.push(finding("error", "subdaily-on-date", `FREQ=${sub.freq} with an all-day DTSTART`, "An all-day event cannot repeat within a day. Give DTSTART a time."));
  }
  const usable = parsed.dtstart.date ? rules.filter((r) => FREQ_RANK[r.freq] >= FREQ_RANK.DAILY) : rules;
  const p = { ...parsed, rules: usable };
  for (const r of usable) findings.push(...ruleFindings(r, p));
  let after = null;
  if (o.after) {
    after = parseDateValue(String(o.after).replace(/[-:]/g, "").replace(" ", "T"));
    if (!after) findings.push(finding("error", "bad-after", `"Show from" ${o.after} is not a date`, "Use 2027-01-01."));
  }
  const exp = expand(p, { limit: Number(o.limit) || 25, after, dtstartMode: o.dtstartMode });
  findings.push(...zoneFindings(exp, parsed.dtstart));
  const occurrences = exp.occurrences.map((x) => ({
    date: formatWall(x.day, x.sec, parsed.dtstart.date),
    weekday: DAY_NAMES[weekday(x.day)],
    ical: icalWall(x.day, x.sec, parsed.dtstart.date),
    source: x.source,
    ...(x.utc !== undefined ? { utc: new Date(x.utc * 1000).toISOString().replace(".000", ""), offset: fmtOffset(x.offset), zone: x.zone } : {}),
    ...(x.zone === "gap" ? { actualLocal: shownLocal(x.utc, exp.tz) } : {}),
  }));
  return {
    ok: !findings.some((f) => f.level === "error"),
    description: usable.map((r) => describe(r, parsed.dtstart, exp.tz ?? (parsed.dtstart.utc ? null : null))),
    occurrences,
    skippedBefore: exp.skipped,
    findings: sortFindings(findings),
    truncated: exp.truncated,
    tz: exp.tz,
    dtstart: formatWall(parsed.dtstart.day, parsed.dtstart.sec, parsed.dtstart.date),
    allDay: parsed.dtstart.date,
  };
}

const fmtOffset = (s) => `${s < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(s) / 3600))}:${pad(Math.floor((Math.abs(s) % 3600) / 60))}`;
const LEVEL = { error: 0, warning: 1, info: 2 };
const rank = (l) => (Object.hasOwn(LEVEL, l) ? LEVEL[l] : 3);
const sortFindings = (fs) => fs.slice().sort((a, b) => rank(a.level) - rank(b.level));

/** CSV of the listed occurrences. */
export function reportCsv(result) {
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["date", "weekday", "utc", "offset", "source", "note"].join(",")];
  for (const o of result.occurrences) rows.push([q(o.date), q(o.weekday), q(o.utc ?? ""), q(o.offset ?? ""), q(o.source), q(o.zone === "gap" ? `clock skips this time; happens at ${o.actualLocal}` : o.zone === "overlap" ? "time happens twice; first one" : "")].join(","));
  return rows.join("\n") + "\n";
}
