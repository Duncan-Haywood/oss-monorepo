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

// ---- dateTime ranges as XSD patterns ----
// The UTC offsets time zones used from 2000 to 2026 (ICU's tz data, every IANA
// zone sampled weekly; eval/datetime-pattern-2026-11-21.md), plus -12:00
// (Etc/GMT+12), in minutes east of UTC.
export const ZONE_OFFSETS = ["-12:00", "-11:00", "-10:00", "-09:30", "-09:00", "-08:00", "-07:00", "-06:00", "-05:00", "-04:30", "-04:00", "-03:30", "-03:00", "-02:30", "-02:00", "-01:00", "+00:00", "+01:00", "+02:00", "+03:00", "+03:30", "+04:00", "+04:30", "+05:00", "+05:30", "+05:45", "+06:00", "+06:30", "+07:00", "+08:00", "+08:30", "+08:45", "+09:00", "+09:30", "+09:45", "+10:00", "+10:30", "+11:00", "+11:30", "+12:00", "+12:45", "+13:00", "+13:45", "+14:00"];
const offMin = (s) => (s[0] === "-" ? -1 : 1) * (Number(s.slice(1, 3)) * 60 + Number(s.slice(4, 6)));
const DAY = 864e5, MAX_OFF = 23 * 60 + 59;
// Tuples of fixed-width numbers (fields [{ w, max, sep }], sep written before
// the field) from lo to hi inclusive, in order, as a pattern; every number in
// a field runs 0..max. Single-digit fields with max 9 are character classes.
function tupleRange(lo, hi, f) {
  const [h, ...rest] = f;
  const one = (a, b) => (h.w === 1 && h.max === 9 ? (a === b ? String(a) : `[${a}-${b}]`) : numPat(a, b, h.w));
  if (!rest.length) return one(lo[0], hi[0]);
  const s = rest[0].sep, rMin = rest.map(() => 0), rMax = rest.map((x) => x.max);
  const R = (a, b) => s + tupleRange(a, b, rest);
  if (lo[0] === hi[0]) return P0(lo[0], h.w) + R(lo.slice(1), hi.slice(1));
  const fromMin = lo.slice(1).every((x) => x === 0), toMax = hi.slice(1).every((x, i) => x === rMax[i]);
  const alts = [];
  let a = lo[0], b = hi[0];
  if (!fromMin) { alts.push(P0(a, h.w) + R(lo.slice(1), rMax)); a++; }
  if (!toMax) b--;
  if (a <= b) alts.push(one(a, b) + R(rMin, rMax));
  if (!toMax) alts.push(P0(hi[0], h.w) + R(rMin, hi.slice(1)));
  return alt(alts);
}
// w-digit numbers from a to b (ASCII digits).
function numPat(a, b, w) {
  const d = (n) => P0(n, w).split("").map(Number);
  return tupleRange(d(a), d(b), Array.from({ length: w }, () => ({ w: 1, max: 9, sep: "" })));
}
const HMS = [{ w: 2, max: 23, sep: "" }, { w: 2, max: 59, sep: ":" }, { w: 2, max: 59, sep: ":" }];
const hms = (sec) => [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60];
// An optional fractional second whose milliseconds fall in p..q; at p the
// digits past the third must clear loT ([digits, inclusive], or null: any),
// at q they must stay under hiT (null: any). The checker orders the whole
// fraction since 2026-11-21 (temporalCompare), not only its milliseconds.
// null when no fraction qualifies.
const P3 = (n) => P0(n, 3);
const cutZeros = (d) => d.replace(/0+$/, "");
function fracPat(p, q, loT = null, hiT = null) {
  if (p === 0 && q === 999 && !loT && !hiT) return "(\\.[0-9]+)?";
  let lo = loT ? [cutZeros(P3(p) + loT[0]), loT[1]] : [cutZeros(P3(p)), true];
  if (lo[0] === "" && lo[1]) lo = null;
  const hi = hiT ? [cutZeros(P3(q) + hiT[0]), hiT[1]] : q === 999 ? null : [cutZeros(P3(q + 1)), false];
  return fracPart(lo, hi);
}
const T24 = "24:00:00(\\.0+)?";
// Times of day "hh:mm:ss(.f)" whose milliseconds since midnight lie in
// ta..tb (0 <= ta <= tb <= DAY; DAY is "24:00:00", the next midnight), with
// the sub-millisecond tails loT at ta and hiT at tb (fracPat).
const zeroOkLo = (t) => !t || (t[0] === "" && t[1]);
const zeroOkHi = (t) => !t || t[1] || t[0] !== "";
function timePat(ta, tb, loT = null, hiT = null) {
  const alts = [];
  if (tb === DAY) {
    if ((ta < DAY || zeroOkLo(loT)) && zeroOkHi(hiT)) alts.push(T24);
    if (ta === DAY) return alts.length ? alt(alts) : null;
    tb = DAY - 1; hiT = null;
  }
  if (ta <= tb) {
    const sa = Math.floor(ta / 1000), sb = Math.floor(tb / 1000), ma = ta % 1000, mb = tb % 1000;
    const at = (sec, f) => (f === null ? null : tupleRange(hms(sec), hms(sec), HMS) + f);
    if (sa === sb) alts.push(at(sa, fracPat(ma, mb, loT, hiT)));
    else {
      let a = sa, b = sb;
      if (ma > 0 || loT) { alts.push(at(sa, fracPat(ma, 999, loT, null))); a++; }
      if (mb < 999 || hiT) b--;
      if (a <= b) alts.push(tupleRange(hms(a), hms(b), HMS) + "(\\.[0-9]+)?");
      if (mb < 999 || hiT) alts.push(at(sb, fracPat(0, mb, null, hiT)));
    }
  }
  const ys = alts.filter((x) => x !== null);
  return ys.length ? alt(ys.reverse()) : null;
}
const zonePat = (o) => (o === 0 ? ZONE.zero : `${o > 0 ? "\\+" : "\\-"}${P0(Math.floor(Math.abs(o) / 60), 2)}:${P0(Math.abs(o) % 60, 2)}`);
const ANY_ZONE = "(Z|[+\\-]([01][0-9]|2[0-3]):[0-5][0-9])?";
// A dateTime range as one XSD pattern for the strings ids.mjs passes on it
// (an instant test: a value without a zone is UTC, milliseconds kept, the
// day must exist, 24:00:00 is the next midnight). Exact for values with no
// zone, Z, +-00:00 or an offset a time zone uses (ZONE_OFFSETS); a value
// written with any other offset (+10:17) passes only when every offset would
// (more than a day inside the range), so near a bound the pattern refuses
// what the range takes. Bounds: dateTime strings, any form temporalKey reads.
// Returns the pattern, false when no string can pass, or null when a bound is
// not a dateTime.
export function dateTimeRangePattern(r) {
  // Each bound as its millisecond and the fraction digits past the third
  // (exactKey); the tighter one per side. aT / bT: the tail a value on the
  // bound's own millisecond must clear (null: any tail).
  let lo = null, hi = null;
  const tc = (x, y) => (x.k !== y.k ? (x.k < y.k ? -1 : 1) : (() => { const w = Math.max(x.f.length, y.f.length), p = x.f.padEnd(w, "0"), q = y.f.padEnd(w, "0"); return p === q ? 0 : p < q ? -1 : 1; })());
  for (const k of ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"]) {
    if (r[k] === undefined || r[k] === null) continue;
    if (temporalKind(String(r[k])) !== "dateTime") return null;
    const x = exactKey(String(r[k]));
    if (Number.isNaN(x.k)) return false;
    const inc = k.endsWith("Inclusive");
    if (k.startsWith("min")) { if (!lo || tc(x, lo) > 0 || (tc(x, lo) === 0 && !inc)) lo = { ...x, inc }; }
    else if (!hi || tc(x, hi) < 0 || (tc(x, hi) === 0 && !inc)) hi = { ...x, inc };
  }
  let A = -Infinity, B = Infinity, aT = null, bT = null;
  if (lo) { A = lo.k; aT = lo.f === "" && lo.inc ? null : [lo.f, lo.inc]; }
  if (hi) {
    B = hi.k; bT = [hi.f, hi.inc];
    if (hi.f === "" && !hi.inc) { B--; bT = null; }
  }
  if (A > B || (A === B && fracPat(0, 0, aT, bT) === null)) return false;
  const L0 = dayNo("0000-01-01") * DAY, L1 = (dayNo("9999-12-31") + 1) * DAY;
  // Local days (0 = 1970-01-01) whole for every offset up to +-23:59.
  // A bound with a tail is cleared by a whole millisecond more.
  const mA = Math.max(L0, A + (aT ? 1 : 0) + MAX_OFF * 6e4), mB = Math.min(L1, B - (bT ? 1 : 0) - MAX_OFF * 6e4);
  const midLo = Math.ceil(mA / DAY), midHi = Math.floor(mB / DAY) - 1;
  const parts = [];
  if (midLo <= midHi) parts.push(`${dayPattern(dayStr(midLo), dayStr(midHi))}T${alt([T24, "([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?"])}${ANY_ZONE}`);
  // The other days, per offset in use: whole, part (a time range) or none.
  const offs = ZONE_OFFSETS.map(offMin);
  const edge = new Map();
  for (const o of offs) {
    const x1 = Math.max(L0, A + o * 6e4), x2 = Math.min(L1, B + o * 6e4);
    if (x1 > x2) continue;
    const days = [];
    const d1 = Math.max(Math.floor(x1 / DAY) - 1, dayNo("0000-01-01")), d2 = Math.min(Math.floor(x2 / DAY), dayNo("9999-12-31"));
    if (midLo <= midHi) {
      for (let d = d1; d <= Math.min(d2, midLo - 1); d++) days.push(d);
      for (let d = Math.max(d1, midHi + 1); d <= d2; d++) days.push(d);
    } else for (let d = d1; d <= d2; d++) days.push(d);
    for (const d of days) {
      const ta = Math.max(x1, d * DAY) - d * DAY, tb = Math.min(x2, (d + 1) * DAY) - d * DAY;
      if (ta > tb) continue;
      // The bound's own tail applies where the bound itself cuts this day.
      const loT = x1 === A + o * 6e4 && x1 >= d * DAY ? aT : null, hiT = x2 === B + o * 6e4 && x2 <= (d + 1) * DAY ? bT : null;
      if (!edge.has(d)) edge.set(d, { whole: [], part: [] });
      const e = edge.get(d);
      if (ta === 0 && tb === DAY && !loT && !hiT) e.whole.push(o);
      else e.part.push([o, ta, tb, loT, hiT]);
    }
  }
  for (const d of [...edge.keys()].sort((a, b) => a - b)) {
    const { whole, part } = edge.get(d);
    const alts = [];
    if (whole.length) alts.push(`${alt([T24, "([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?"])}${alt(whole.map(zonePat))}`);
    // Offsets sharing a time range share one alternative.
    const byTime = new Map();
    for (const [o, ta, tb, loT, hiT] of part) { const k = JSON.stringify([ta, tb, loT, hiT]); if (!byTime.has(k)) byTime.set(k, []); byTime.get(k).push(o); }
    for (const [k, os] of byTime) { const [ta, tb, loT, hiT] = JSON.parse(k); const t = timePat(ta, tb, loT, hiT); if (t !== null) alts.push(t + alt(os.map(zonePat))); }
    if (alts.length) parts.push(`${dayStr(d)}T${alt(alts)}`);
  }
  return parts.length ? `${XWS}${alt(parts)}${XWS}` : false;
}

// ---- exact order of dateTimes and times, past the millisecond ----
// Date.parse keeps three fraction digits, so 00:00:00.0004 and 00:00:00 key
// alike and "after midnight, exclusive" refused a value XSD's order puts
// after it. temporalCompare(a, b) orders two values of one kind exactly:
// whole milliseconds by Date.parse (with the fraction cut off), then the
// fraction's remaining digits as written. -1, 0 or 1; NaN when either is
// not a value of that kind (or a day the month lacks, or 24:00:00 with a
// fraction that is not zero, which XSD refuses and Date.parse does too).
const FRAC_RE = /(\d{2}:\d{2}:\d{2})\.(\d+)/;
function exactKey(s) {
  const kind = temporalKind(s);
  if (!kind) return null;
  if (kind !== "dateTime" && kind !== "time") return { kind, k: temporalKey(s), f: "" };
  const t = xmlTrim(s);
  const m = t.match(FRAC_RE);
  const frac = m ? m[2] : "";
  if (/(^|T)24:/.test(t) && /[1-9]/.test(frac)) return { kind, k: NaN, f: "" };
  const k = temporalKey(m ? t.replace(FRAC_RE, (_, hms, f) => `${hms}.${f.slice(0, 3)}`) : t);
  return { kind, k, f: frac.slice(3).replace(/0+$/, "") };
}
export function temporalCompare(a, b) {
  const x = exactKey(a), y = exactKey(b);
  if (!x || !y || x.kind !== y.kind || Number.isNaN(x.k) || Number.isNaN(y.k) || x.k === null || y.k === null) return NaN;
  if (x.k !== y.k) return x.k < y.k ? -1 : 1;
  const w = Math.max(x.f.length, y.f.length);
  const p = x.f.padEnd(w, "0"), q = y.f.padEnd(w, "0");
  return p === q ? 0 : p < q ? -1 : 1;
}

// Digit strings (the fraction after the point; empty is 0) whose value lies
// between lo and hi: { re } for the non-empty ones (null if none) and ok0
// when the empty string (value 0) qualifies. lo / hi: [digits, inclusive]
// or null for no bound; digits have no trailing zeros.
function fracSet(lo, hi) {
  if (lo && lo[0] === "" && lo[1]) lo = null;
  const zeroOk = !lo && (!hi || hi[0] !== "" || hi[1]);
  if (!lo && !hi) return { re: "[0-9]+", ok0: true };
  // Above 0, no upper bound: some digit not zero.
  if (lo && lo[0] === "" && !hi) return { re: "0*[1-9][0-9]*", ok0: false };
  if (hi && hi[0] === "") {
    // Value at most 0 (all zeros) when inclusive, else nothing.
    return hi[1] && !lo ? { re: "0+", ok0: true } : { re: null, ok0: false };
  }
  const groups = [];
  for (let d = 0; d <= 9; d++) {
    const c = String(d);
    let nlo = null, nhi = null;
    if (lo) {
      const l0 = lo[0] === "" ? "0" : lo[0][0];
      if (c < l0) continue;
      if (c === l0) nlo = [lo[0].slice(1), lo[1]];
    }
    if (hi) {
      const h0 = hi[0][0];
      if (c > h0) continue;
      if (c === h0) nhi = [hi[0].slice(1), hi[1]];
    }
    const sub = fracSet(nlo, nhi);
    if (!sub.re && !sub.ok0) continue;
    const tail = sub.re && sub.ok0 ? (sub.re === "[0-9]+" ? "[0-9]*" : `(${sub.re})?`) : sub.re ? `(${sub.re})` : "";
    const key = tail;
    const g = groups.find((x) => x.tail === key);
    if (g) g.ds.push(d);
    else groups.push({ tail: key, ds: [d] });
  }
  if (!groups.length) return { re: null, ok0: zeroOk };
  const digitCls = (ds) => {
    if (ds.length === 1) return String(ds[0]);
    if (ds.length === 10) return "[0-9]";
    const runs = [];
    for (const d of ds) { const r = runs[runs.length - 1]; if (r && r[1] === d - 1) r[1] = d; else runs.push([d, d]); }
    return "[" + runs.map(([a, b]) => (a === b ? a : b === a + 1 ? `${a}${b}` : `${a}-${b}`)).join("") + "]";
  };
  const alts = groups.map((g) => digitCls(g.ds) + g.tail);
  return { re: alts.length === 1 ? alts[0] : `(${alts.join("|")})`, ok0: zeroOk };
}
// The fraction part ("" or "." and digits) as a pattern, or null if none.
function fracPart(lo, hi) {
  const { re, ok0 } = fracSet(lo, hi);
  if (!re && !ok0) return null;
  if (!re) return "";
  return ok0 ? `(\\.${re})?` : `\\.${re}`;
}
