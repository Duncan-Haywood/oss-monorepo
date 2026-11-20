// Orders an XSD date, dateTime, time or duration (the forms IFCDATE,
// IFCDATETIME, IFCTIME and IFCDURATION hold) as a number, so IDS range bounds
// such as minInclusive="2052-08-11" or maxExclusive="PT5M30S" can be compared.
// Values without a time zone are read as UTC. Durations count a year as
// 365.2425 days and a month as a twelfth of that (XSD orders durations only
// partially; this is the usual total order). Returns null for anything else.
// Only XML whitespace (space, tab, CR, LF) around a value is dropped, as XSD's
// whiteSpace="collapse" does for these types. A day the month does not have
// (2023-02-29, 2024-04-31) keys as NaN, so it passes no range: XSD says it is
// not a date, and Date.parse would otherwise roll it into the next month.
const TZ = "(Z|[+-]\\d{2}:\\d{2})?";
const DATE_RE = new RegExp(`^-?\\d{4,}-\\d{2}-\\d{2}${TZ}$`);
const DATETIME_RE = new RegExp(`^-?\\d{4,}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?${TZ}$`);
const TIME_RE = new RegExp(`^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?${TZ}$`);
const DURATION_RE = /^(-)?P(?!$)(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?!$)(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
const xmlTrim = (s) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
export const daysInMonth = (y, m) => (m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31);
export function temporalKind(s) {
  if (typeof s !== "string") return null;
  const t = xmlTrim(s);
  if (DATE_RE.test(t)) return "date";
  if (DATETIME_RE.test(t)) return "dateTime";
  if (TIME_RE.test(t)) return "time";
  if (DURATION_RE.test(t)) return "duration";
  return null;
}
export function temporalKey(s) {
  const kind = temporalKind(s);
  if (!kind) return null;
  const t = xmlTrim(s);
  if (kind === "date" || kind === "dateTime") {
    const m = t.match(/^(-?\d{4,})-(\d{2})-(\d{2})/);
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo >= 1 && mo <= 12 && d > daysInMonth(y, mo)) return NaN;
  }
  const z = (x) => (/(Z|[+-]\d{2}:\d{2})$/.test(x) ? x : x + "Z");
  if (kind === "date") return Date.parse(z(t.slice(0, 10) + "T00:00:00" + t.slice(10)));
  if (kind === "dateTime") return Date.parse(z(t));
  if (kind === "time") return Date.parse(z("1970-01-01T" + t));
  const m = t.match(DURATION_RE);
  const n = (i) => Number(m[i] || 0);
  const day = 86400e3;
  const ms = n(2) * 365.2425 * day + n(3) * (365.2425 / 12) * day + n(4) * 7 * day + n(5) * day + n(6) * 3600e3 + n(7) * 60e3 + n(8) * 1e3;
  return m[1] ? -ms : ms;
}

// Strings of one shape (digits and fixed separators) from lo to hi inclusive,
// as an XSD pattern: "2024-01-05" to "2024-03-31" is every ISO date between.
// null when lo and hi differ in shape.
export function lexRange(lo, hi) {
  // Strings of one shape (digits and fixed separators) from lo to hi inclusive.
  if (lo === hi) return lo;
  const any = (s) => s.replace(/\d/g, "\\d");
  let i = 0;
  while (lo[i] === hi[i]) i++;
  const pre = lo.slice(0, i);
  if (!/\d/.test(lo[i])) return null;
  const a = +lo[i], b = +hi[i];
  const geq = (s) => {
    // Strings of s's shape at or above s.
    if (!s) return "";
    const j = s.search(/\d/);
    if (j < 0) return s;
    const head = s.slice(0, j), d = +s[j], rest = s.slice(j + 1);
    if (!/[1-9]/.test(rest.replace(/[^\d]/g, "")) && !rest.replace(/[\d]/g, "").length) return head + (d === 9 ? "9" : `[${d}-9]`) + any(rest);
    const alts = [s[j] + geq(rest)];
    if (d < 9) alts.push((d + 1 === 9 ? "9" : `[${d + 1}-9]`) + any(rest));
    return head + (alts.length > 1 ? `(${alts.join("|")})` : alts[0]);
  };
  const leq = (s) => {
    if (!s) return "";
    const j = s.search(/\d/);
    if (j < 0) return s;
    const head = s.slice(0, j), d = +s[j], rest = s.slice(j + 1);
    if (!/[0-8]/.test(rest.replace(/[^\d]/g, "")) && !rest.replace(/[\d]/g, "").length) return head + (d === 0 ? "0" : `[0-${d}]`) + any(rest);
    const alts = [s[j] + leq(rest)];
    if (d > 0) alts.unshift((d - 1 === 0 ? "0" : `[0-${d - 1}]`) + any(rest));
    return head + (alts.length > 1 ? `(${alts.join("|")})` : alts[0]);
  };
  const restLo = lo.slice(i + 1), restHi = hi.slice(i + 1);
  const alts = [String(a) + geq(restLo)];
  if (b - a > 1) alts.push((b - a === 2 ? String(a + 1) : `[${a + 1}-${b - 1}]`) + any(restLo));
  alts.push(String(b) + leq(restHi));
  return pre + `(${alts.join("|")})`;
}

// ---- exact day sets as XSD patterns ----
// dayPattern(lo, hi): one XSD pattern (ASCII digits only; XSD's \d is any
// Unicode digit) matching exactly the ISO days "YYYY-MM-DD" from lo to hi
// inclusive that exist: month lengths and leap years (proleptic Gregorian,
// years 0000-9999) are written into it, so 2024-02-30 and 2023-02-29 do not
// match. lo and hi are "YYYY-MM-DD" strings of days that exist, lo <= hi.
const P0 = (n, w) => String(n).padStart(w, "0");
const numRange = (a, b, w) => lexRange(P0(a, w), P0(b, w)).replace(/\\d/g, "[0-9]");
const cls = (ds) => (ds.length === 1 ? String(ds[0]) : `[${ds.join("")}]`);
const alt = (xs) => (xs.length === 1 ? xs[0] : `(${xs.join("|")})`);
// Two-digit strings from l to h whose number is a multiple of four.
function mult4(l, h) {
  const out = [], fullEven = [], fullOdd = [];
  for (let t = Math.floor(l / 10); t <= Math.floor(h / 10); t++) {
    const ds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => (t * 10 + k) % 4 === 0);
    const inside = ds.filter((k) => t * 10 + k >= l && t * 10 + k <= h);
    if (!inside.length) continue;
    if (inside.length === ds.length) (t % 2 ? fullOdd : fullEven).push(t);
    else out.push(`${t}${cls(inside)}`);
  }
  if (fullEven.length) out.unshift(`${cls(fullEven)}[048]`);
  if (fullOdd.length) out.unshift(`${cls(fullOdd)}[26]`);
  return out;
}
const isLeap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
// Four-digit years from ya to yb that are leap years, as pattern alternatives.
function leapYears(ya, yb) {
  const out = [];
  let fullFrom = null, fullTo = null;
  for (let c = Math.floor(ya / 100); c <= Math.floor(yb / 100); c++) {
    const lo = Math.max(ya, c * 100), hi = Math.min(yb, c * 100 + 99);
    if (lo === c * 100 && hi === c * 100 + 99) { if (fullFrom === null) fullFrom = c; fullTo = c; continue; }
    const yy = mult4(Math.max(lo - c * 100, 1), hi - c * 100);
    if (yy.length) out.push(P0(c, 2) + alt(yy));
    if (lo === c * 100 && isLeap(lo)) out.push(P0(lo, 4));
  }
  if (fullFrom !== null) {
    out.push(numRange(fullFrom, fullTo, 2) + "(0[48]|[2468][048]|[13579][26])");
    const cc = mult4(fullFrom, fullTo);
    if (cc.length) out.push(alt(cc) + "00");
  }
  return out;
}
const D2 = "[0-9]";
const MD_COMMON = `((0[13578]|1[02])-(0[1-9]|[12]${D2}|3[01])|(0[469]|11)-(0[1-9]|[12]${D2}|30)|02-(0[1-9]|1${D2}|2[0-8]))`;
// Whole months ma..mb of year y as alternatives, each written after "YYYY-".
function wholeMonths(y, ma, mb) {
  const byLen = new Map();
  for (let m = ma; m <= mb; m++) {
    const n = daysInMonth(y, m);
    if (!byLen.has(n)) byLen.set(n, []);
    byLen.get(n).push(P0(m, 2));
  }
  return [...byLen].map(([n, ms]) => `${alt(ms)}-${numRange(1, n, 2)}`);
}
export function dayPattern(lo, hi) {
  const [y1, m1, d1] = lo.split("-").map(Number), [y2, m2, d2] = hi.split("-").map(Number);
  const Y = (y) => P0(y, 4), M = (m) => P0(m, 2);
  if (y1 === y2 && m1 === m2) return `${Y(y1)}-${M(m1)}-${numRange(d1, d2, 2)}`;
  const parts = [];
  // Within one year: the first month's tail, whole months, the last month's head.
  const inYear = (y, ma, da, mb, db) => {
    const out = [];
    let a = ma, b = mb;
    if (da > 1) { out.push(`${M(ma)}-${numRange(da, daysInMonth(y, ma), 2)}`); a++; }
    if (db < daysInMonth(y, mb)) { b--; }
    if (a <= b) out.push(...wholeMonths(y, a, b));
    if (db < daysInMonth(y, mb)) out.push(`${M(mb)}-${numRange(1, db, 2)}`);
    return `${Y(y)}-${alt(out)}`;
  };
  if (y1 === y2) return inYear(y1, m1, d1, m2, d2);
  let ya = y1, yb = y2;
  if (!(m1 === 1 && d1 === 1)) { parts.push(inYear(y1, m1, d1, 12, 31)); ya++; }
  if (!(m2 === 12 && d2 === 31)) yb--;
  if (ya <= yb) {
    parts.push(`${numRange(ya, yb, 4)}-${MD_COMMON}`);
    const leaps = leapYears(ya, yb);
    if (leaps.length) parts.push(`${alt(leaps)}-02-29`);
  }
  if (!(m2 === 12 && d2 === 31)) parts.push(inYear(y2, 1, 1, m2, d2));
  return alt(parts);
}

// A date range with plain-date bounds as one XSD pattern that passes exactly
// the strings ids.mjs passes on the range: the day must exist, and for each
// time-zone sign the written day is shifted as the instant test needs (a day
// written east of UTC starts before its UTC midnight, so it needs a day more
// to clear a lower bound; one written west needs a day less to stay under an
// upper bound); XML whitespace may surround it, as the range check drops it.
// r: { minInclusive, maxInclusive, minExclusive, maxExclusive } (strings,
// any may be absent). Returns the pattern, false when no string can pass, or
// null when a bound is not a plain date.
const BOUND_DAY = /^[ \t\r\n]*(\d{4})-(\d{2})-(\d{2})[ \t\r\n]*$/;
const dayNo = (s) => {
  const m = String(s).match(BOUND_DAY);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return NaN;
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  return Math.round(t.getTime() / 864e5);
};
const dayStr = (n) => {
  const t = new Date(n * 864e5);
  return P0(t.getUTCFullYear(), 4) + "-" + P0(t.getUTCMonth() + 1, 2) + "-" + P0(t.getUTCDate(), 2);
};
const OFFSET = `(00:(0[1-9]|[1-5]${D2})|(0[1-9]|1${D2}|2[0-3]):[0-5]${D2})`;
const ZONE = { zero: "(Z|[+\\-]00:00)?", east: `\\+${OFFSET}`, west: `\\-${OFFSET}` };
const XWS = "[ \\t\\r\\n]*";
export function dateRangePattern(r) {
  const b = {};
  for (const k of ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"]) {
    if (r[k] === undefined || r[k] === null) continue;
    const n = dayNo(r[k]);
    if (n === null) return null;
    if (Number.isNaN(n)) return false;
    b[k] = n;
  }
  const FIRST = dayNo("0000-01-01"), LAST = dayNo("9999-12-31");
  const alts = [];
  for (const sign of ["zero", "east", "west"]) {
    let lo = FIRST, hi = LAST;
    if (b.minInclusive !== undefined) lo = Math.max(lo, b.minInclusive + (sign === "east" ? 1 : 0));
    if (b.minExclusive !== undefined) lo = Math.max(lo, b.minExclusive + (sign === "west" ? 0 : 1));
    if (b.maxInclusive !== undefined) hi = Math.min(hi, b.maxInclusive - (sign === "west" ? 1 : 0));
    if (b.maxExclusive !== undefined) hi = Math.min(hi, b.maxExclusive - (sign === "east" ? 0 : 1));
    if (lo <= hi) alts.push(`${dayPattern(dayStr(lo), dayStr(hi))}${ZONE[sign]}`);
  }
  return alts.length ? `${XWS}(${alts.join("|")})${XWS}` : false;
}
