// Orders an XSD date, dateTime, time or duration (the forms IFCDATE,
// IFCDATETIME, IFCTIME and IFCDURATION hold) as a number, so IDS range bounds
// such as minInclusive="2052-08-11" or maxExclusive="PT5M30S" can be compared.
// Values without a time zone are read as UTC. Durations count a year as
// 365.2425 days and a month as a twelfth of that (XSD orders durations only
// partially; this is the usual total order). Returns null for anything else.
const TZ = "(Z|[+-]\\d{2}:\\d{2})?";
const DATE_RE = new RegExp(`^-?\\d{4,}-\\d{2}-\\d{2}${TZ}$`);
const DATETIME_RE = new RegExp(`^-?\\d{4,}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?${TZ}$`);
const TIME_RE = new RegExp(`^\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?${TZ}$`);
const DURATION_RE = /^(-)?P(?!$)(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?!$)(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;
export function temporalKind(s) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (DATE_RE.test(t)) return "date";
  if (DATETIME_RE.test(t)) return "dateTime";
  if (TIME_RE.test(t)) return "time";
  if (DURATION_RE.test(t)) return "duration";
  return null;
}
export function temporalKey(s) {
  const kind = temporalKind(s);
  if (!kind) return null;
  const t = s.trim();
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
