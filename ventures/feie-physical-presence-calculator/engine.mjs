// Physical presence test (Form 2555, IRC 911) day counter. Pure functions over
// the date ranges the visitor types; no network. Arithmetic on their dates, not tax advice.

export const LIMITS = { 2023: 120000, 2024: 126500, 2025: 130000, 2026: 132900 };
export const DAYS_REQUIRED = 330;

export const INPUT_NOTES = [
  { what: "2025-03-04 to 2025-11-20", detail: "One stay in a foreign country per line, first and last full day inclusive. Dates are YYYY-MM-DD." },
  { what: "2025-03-04 to present", detail: "An ongoing stay: \"present\" or \"today\" means the as-of date you set." },
  { what: "Labels and comments", detail: "Text after # is ignored. Lines starting with # are skipped." },
  { what: "Travel days", detail: "Count a day only if you were in a foreign country for the whole 24 hours, midnight to midnight. Leave the days you flew or crossed out of each range yourself." },
];

const MS = 86400000;
export const toDay = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN;
  return Math.round(t / MS);
};
export const fromDay = (n) => new Date(n * MS).toISOString().slice(0, 10);
const addYear = (day, years) => { const d = new Date(day * MS); d.setUTCFullYear(d.getUTCFullYear() + years); return Math.round(d.getTime() / MS); };

export function parseTrips(text, asOf) {
  const asOfDay = toDay(asOf);
  const trips = [];
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = /^(\d{4}-\d{2}-\d{2})\s*(?:to|-|–|—|until)\s*(\d{4}-\d{2}-\d{2}|present|today|now)$/i.exec(line);
    if (!m) { errors.push(`Line ${i + 1}: expected "YYYY-MM-DD to YYYY-MM-DD" or "YYYY-MM-DD to present", got "${line}".`); continue; }
    const start = toDay(m[1]);
    const end = /^(present|today|now)$/i.test(m[2]) ? asOfDay : toDay(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) { errors.push(`Line ${i + 1}: not a real calendar date in "${line}".`); continue; }
    if (end < start) { errors.push(`Line ${i + 1}: the end date is before the start date.`); continue; }
    trips.push({ start, end, line: i + 1 });
  }
  return { trips, errors };
}

export function mergeTrips(trips) {
  const sorted = [...trips].sort((a, b) => a.start - b.start);
  const out = [];
  for (const t of sorted) {
    const last = out[out.length - 1];
    if (last && t.start <= last.end + 1) last.end = Math.max(last.end, t.end);
    else out.push({ start: t.start, end: t.end });
  }
  return out;
}

function prefixOf(merged, lo, hi) {
  const len = hi - lo + 2;
  const pre = new Int32Array(len);
  const mark = new Uint8Array(len - 1);
  for (const t of merged) for (let d = Math.max(t.start, lo); d <= Math.min(t.end, hi); d++) mark[d - lo] = 1;
  for (let i = 1; i < len; i++) pre[i] = pre[i - 1] + mark[i - 1];
  return (a, b) => pre[Math.min(b, hi) - lo + 1] - pre[Math.max(a, lo) - lo];
}

export function analyze(input = {}) {
  const asOf = input.asOf || new Date().toISOString().slice(0, 10);
  const taxYear = Math.round(Number(input.taxYear ?? 2025));
  const income = Math.max(0, Number(input.income ?? 0)) || 0;
  const limit = Number(input.limit) > 0 ? Number(input.limit) : (LIMITS[taxYear] ?? LIMITS[2025]);
  const { trips, errors } = parseTrips(input.trips, asOf);
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) throw new Error("Tax year must be a four-digit year.");
  if (Number.isNaN(toDay(asOf))) throw new Error("The as-of date must be YYYY-MM-DD.");
  if (!trips.length) throw new Error(errors[0] || "Enter at least one foreign stay, e.g. 2025-01-10 to 2025-12-20.");
  const merged = mergeTrips(trips);
  const first = merged[0].start, last = merged[merged.length - 1].end;
  const lo = first - 366, hi = last + 366;
  const count = prefixOf(merged, lo, hi);
  let best = null;
  let earliest = null;
  for (let s = first - 364; s <= last; s++) {
    const e = addYear(s, 1) - 1;
    const c = count(s, e);
    if (!best || c > best.days || (c === best.days && s < best.start)) best = { start: s, end: e, days: c };
  }
  // earliest date on which some 12-month span holds DAYS_REQUIRED foreign days
  for (let e = first; e <= last + 366 && !earliest; e++) {
    const s = addYear(e + 1, -1);
    if (count(s, e) >= DAYS_REQUIRED) earliest = e;
  }
  const spanDays = best.end - best.start + 1;
  const qualifies = best.days >= DAYS_REQUIRED;
  const slack = best.days - DAYS_REQUIRED;
  const outside = spanDays - best.days;
  const maxOutside = spanDays - DAYS_REQUIRED;

  const yStart = toDay(`${taxYear}-01-01`), yEnd = toDay(`${taxYear}-12-31`);
  const daysInYear = yEnd - yStart + 1;
  const foreignInYear = count(yStart, yEnd);
  // the qualifying period that covers the most days of the tax year, among spans with 330+ foreign days
  let yearWindow = null;
  for (let s = first - 364; s <= last; s++) {
    const e = addYear(s, 1) - 1;
    if (count(s, e) < DAYS_REQUIRED) continue;
    const overlap = Math.max(0, Math.min(e, yEnd) - Math.max(s, yStart) + 1);
    if (!yearWindow || overlap > yearWindow.overlap) yearWindow = { start: s, end: e, overlap };
  }
  const qDaysInYear = yearWindow ? yearWindow.overlap : 0;
  const prorated = limit * qDaysInYear / daysInYear;
  const excluded = Math.min(income, prorated);
  const years = [];
  for (let y = new Date(first * MS).getUTCFullYear(); y <= new Date(last * MS).getUTCFullYear(); y++) {
    const a = toDay(`${y}-01-01`), b = toDay(`${y}-12-31`);
    years.push({ year: y, foreignDays: count(a, b), daysInYear: b - a + 1 });
  }
  // what-if: how long a US stay still leaves the best window qualifying
  const windowShortfall = Math.max(0, DAYS_REQUIRED - best.days);
  return {
    asOf, taxYear, income, limit, errors, merged, best, qualifies, slack, outside, maxOutside, spanDays, earliest,
    foreignInYear, daysInYear, qDaysInYear, yearWindow, prorated, excluded, taxableAfter: Math.max(0, income - excluded), years, windowShortfall,
  };
}

export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function summarize(r) {
  const win = `${fromDay(r.best.start)} to ${fromDay(r.best.end)}`;
  const head = r.qualifies
    ? `Your best 12-month span (${win}) holds ${r.best.days} full foreign days, ${r.slack} more than the ${DAYS_REQUIRED} the physical presence test needs; you could be outside a foreign country ${r.maxOutside} days of it.`
    : `Your best 12-month span (${win}) holds ${r.best.days} full foreign days, ${r.windowShortfall} short of the ${DAYS_REQUIRED} the physical presence test needs.`;
  const lines = [head];
  if (r.earliest) lines.push(`The first date a 12-month span holds ${DAYS_REQUIRED} foreign days is ${fromDay(r.earliest)}.`);
  if (r.income > 0) lines.push(`For ${r.taxYear} with ${money(r.income)} of foreign earned income and a ${money(r.limit)} limit: ${r.qDaysInYear > 0 ? `${r.qDaysInYear} of ${r.daysInYear} days fall in a qualifying period (${fromDay(r.yearWindow.start)} to ${fromDay(r.yearWindow.end)}), prorated limit ${money(r.prorated)}, excluded ${money(r.excluded)}, ${money(r.taxableAfter)} left in income` : "no exclusion under this test on these dates"}.`);
  return { status: r.qualifies ? "ok" : "short", text: lines.join("\n") };
}

export const SAMPLE = [
  "2024-09-15 to 2025-01-20  # moved to Lisbon",
  "2025-02-03 to 2025-05-30",
  "2025-06-12 to 2025-09-28  # back from the US visit",
  "2025-10-05 to present",
].join("\n");
export const SAMPLE_OPTIONS = { asOf: "2026-02-28", taxYear: 2025, income: 95000 };
