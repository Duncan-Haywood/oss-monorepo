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
