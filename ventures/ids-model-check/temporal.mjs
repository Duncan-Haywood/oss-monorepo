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

// ---- dateTime ranges as one XSD pattern ----
// dateTimeRangePattern(r): an XSD pattern passing exactly the strings ids.mjs
// passes on a range with xs:dateTime bounds (temporalCompare's order), for
// every value with no time zone, Z, +00:00 or -00:00, and for every value
// with any other zone that lies more than a day inside each bound (no zone
// can then move it out). Near a bound the instant depends on the zone
// minute by minute, and one pattern exact for all 2,879 zones would run to
// hundreds of kilobytes (the zone is written after the time, so the pattern
// must carry the local minute to it), so a zoned value there is matched
// exactly only for the zones in opts.zones (whole hours by default, the
// form IFC exporters write); other zones within a day of a bound do not
// match. r: { minInclusive, maxInclusive, minExclusive, maxExclusive }.
// Returns the pattern, false when no string can pass, or null when a bound
// is not an xs:dateTime.
// Instants are { s: whole seconds from 0000-01-01T00:00:00 local, f: the
// fraction's digits with trailing zeros cut }.
const DT_BOUND = /^[ \t\r\n]*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?[ \t\r\n]*$/;
const DAY0 = () => dayNo("0000-01-01");
function parseDtBound(str) {
  const m = String(str).match(DT_BOUND);
  if (!m) return null;
  if (temporalCompare(str, str) !== 0) return NaN;
  const d = dayNo(`${m[1]}-${m[2]}-${m[3]}`);
  let off = 0;
  if (m[8] && m[8] !== "Z") off = (m[8][0] === "-" ? -1 : 1) * (Number(m[8].slice(1, 3)) * 60 + Number(m[8].slice(4, 6)));
  return { s: (d - DAY0()) * 86400 + Number(m[4]) * 3600 + Number(m[5]) * 60 + Number(m[6]) - off * 60, f: (m[7] || "").replace(/0+$/, "") };
}
const cmpI = (a, b) => (a.s !== b.s ? (a.s < b.s ? -1 : 1) : (() => { const w = Math.max(a.f.length, b.f.length), p = a.f.padEnd(w, "0"), q = b.f.padEnd(w, "0"); return p === q ? 0 : p < q ? -1 : 1; })());
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
// Local lexical dateTimes "YYYY-MM-DDThh:mm:ss(.f)" (years 0000-9999) whose
// local instant lies in [a, b]: a, b are { s, f, inc } or null (open).
const ANY_T = ["", "([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?", "[0-5][0-9]:[0-5][0-9](\\.[0-9]+)?", "[0-5][0-9](\\.[0-9]+)?", "(\\.[0-9]+)?"];
const SEP = ["T", ":", ":", ""];
function fieldsOf(x) {
  const day = Math.floor(x.s / 86400), sod = x.s - day * 86400;
  return [day, Math.floor(sod / 3600), Math.floor((sod % 3600) / 60), sod % 60];
}
function localRange(a, b) {
  const MAXDAY = dayNo("9999-12-31") - DAY0();
  const F = (i, x, y) => (i === 0 ? dayPattern(dayStr(x + DAY0()), dayStr(y + DAY0())) : numRange(x, y, 2));
  const MAX = [MAXDAY, 23, 59, 59];
  const fa = a && fieldsOf(a), fb = b && fieldsOf(b);
  if (fa && fa[0] > MAXDAY) return null;
  if (fb && fb[0] < 0) return null;
  // Clip bounds that fall outside the years a value can be written in.
  let A = fa, B = fb;
  if (A && A[0] < 0) A = null;
  if (B && B[0] > MAXDAY) B = null;
  const cat = (...xs) => (xs.some((x) => x === null) ? null : xs.join(""));
  const alt2 = (xs) => { const ys = xs.filter((x) => x !== null); return ys.length ? (ys.length === 1 ? ys[0] : `(${ys.join("|")})`) : null; };
  // lower tail of A from level i on is the very start (00:00:00 inclusive)?
  const minTail = (i) => i <= 4 && A.slice(i).every((v) => v === 0) && a.f === "" && a.inc;
  const lv = (i, lo, hi) => {
    if (i === 4) return fracPart(lo ? [a.f, a.inc] : null, hi ? [b.f, b.inc] : null);
    if (lo && minTail(i)) lo = false;
    if (!lo && !hi) return ANY_T[i] || null;
    const L = lo ? A[i] : 0, H = hi ? B[i] : MAX[i];
    if (lo && hi && L === H) return cat(F(i, L, L), SEP[i], lv(i + 1, true, true));
    const alts = [];
    let s = L, e = H;
    // A lower bound at the very start of its field (00:00:00 inclusive) joins the middle run.
    if (lo && !minTail(i + 1)) { alts.push(cat(F(i, L, L), SEP[i], lv(i + 1, true, false))); s++; }
    if (hi) e--;
    if (s <= e) alts.push(F(i, s, e) + SEP[i] + ANY_T[i + 1]);
    if (hi) alts.push(cat(F(i, H, H), SEP[i], lv(i + 1, false, true)));
    return alt2(alts);
  };
  if (A && B && cmpI(a, b) > 0) return null;
  const main = A === null && B === null ? dayPattern("0000-01-01", "9999-12-31") + "T" + ANY_T[1] : lv(0, !!A, !!B);
  // 24:00:00 is the next day's midnight: the days D whose next midnight is in range.
  const inR = (t) => (!a || cmpI(t, a) > 0 || (cmpI(t, a) === 0 && a.inc)) && (!b || cmpI(t, b) < 0 || (cmpI(t, b) === 0 && b.inc));
  let n0 = a ? Math.ceil(a.s / 86400) : 1, n1 = b ? Math.floor(b.s / 86400) : MAXDAY + 1;
  if (a && !inR({ s: n0 * 86400, f: "" })) n0++;
  if (b && !inR({ s: n1 * 86400, f: "" })) n1--;
  n0 = Math.max(n0, 1); n1 = Math.min(n1, MAXDAY + 1);
  const midnight = n0 <= n1 ? `${dayPattern(dayStr(n0 - 1 + DAY0()), dayStr(n1 - 1 + DAY0()))}T24:00:00(\\.0+)?` : null;
  return alt2([main, midnight]);
}
const ZONE_ANY = `[+\\-]${OFFSET}`;
const zoneRe = (min) => (min === 0 ? ZONE.zero : `\\${min < 0 ? "-" : "+"}${P0(Math.floor(Math.abs(min) / 60), 2)}:${P0(Math.abs(min) % 60, 2)}`);
export const WHOLE_HOUR_ZONES = Array.from({ length: 47 }, (_, i) => (i - 23) * 60).filter((m) => m !== 0);
export function dateTimeRangePattern(r, opts = {}) {
  const zones = opts.zones || WHOLE_HOUR_ZONES;
  const b = {};
  for (const k of ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"]) {
    if (r[k] === undefined || r[k] === null) continue;
    const x = parseDtBound(r[k]);
    if (x === null) return null;
    if (Number.isNaN(x)) return false;
    b[k] = x;
  }
  // The tighter bound on each side.
  let lo = null, hi = null;
  const tighterLo = (x, inc) => { if (!lo || cmpI(x, lo) > 0 || (cmpI(x, lo) === 0 && !inc)) lo = { ...x, inc }; };
  const tighterHi = (x, inc) => { if (!hi || cmpI(x, hi) < 0 || (cmpI(x, hi) === 0 && !inc)) hi = { ...x, inc }; };
  if (b.minInclusive) tighterLo(b.minInclusive, true);
  if (b.minExclusive) tighterLo(b.minExclusive, false);
  if (b.maxInclusive) tighterHi(b.maxInclusive, true);
  if (b.maxExclusive) tighterHi(b.maxExclusive, false);
  if (lo && hi && (cmpI(lo, hi) > 0 || (cmpI(lo, hi) === 0 && !(lo.inc && hi.inc)))) return false;
  const shift = (x, min) => x && { ...x, s: x.s + min * 60 };
  const alts = [];
  const zero = localRange(lo, hi);
  if (zero) alts.push(zero + ZONE.zero);
  // More than a day inside both bounds: any zone (offsets reach 23:59).
  const D = 1439;
  const inLo = lo && { s: lo.s + D * 60, f: lo.f, inc: lo.inc }, inHi = hi && { s: hi.s - D * 60, f: hi.f, inc: hi.inc };
  const inner = localRange(inLo, inHi);
  if (inner) alts.push(inner + ZONE_ANY);
  // Within a day of a bound: the listed zones, each placed exactly.
  for (const z of zones) {
    if (z === 0) continue;
    const sLo = shift(lo, z), sHi = shift(hi, z);
    const pieces = [];
    if (!inner) pieces.push(localRange(sLo, sHi));
    else {
      if (lo) pieces.push(localRange(sLo, { ...inLo, inc: !inLo.inc }));
      if (hi) pieces.push(localRange({ ...inHi, inc: !inHi.inc }, sHi));
    }
    const ps = pieces.filter(Boolean);
    if (ps.length) alts.push(`(${ps.join("|")})${zoneRe(z)}`);
  }
  return alts.length ? `${XWS}(${alts.join("|")})${XWS}` : false;
}
