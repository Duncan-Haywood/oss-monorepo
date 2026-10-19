// US substantial presence test (IRC 7701(b)(3), IRS Pub. 519). Pure functions over the
// US stays the visitor types; no network. Arithmetic on their dates, not tax advice.

export const DAYS_CURRENT_MIN = 31;
export const WEIGHTED_MIN = 183;
// Sixths keep the weighted total exact: current + prior/3 + prior2/6 = (6c + 2p1 + p2) / 6.
const SIXTHS_MIN = WEIGHTED_MIN * 6;

export const INPUT_NOTES = [
  { what: "2025-03-04 to 2025-11-20", detail: "One stay in the United States per line, first and last day inclusive. Any part of a day counts as a day present, so the days you land and leave both count." },
  { what: "2025-03-04 to present", detail: "An ongoing stay: \"present\" or \"today\" means the as-of date you set." },
  { what: "2022-08-15 to 2024-05-10 exempt", detail: "Days that do not count: F, J, M or Q students, teachers and trainees who are exempt individuals, a medical condition that arose while here, crew members, Canada or Mexico commuters, or a transit stop under 24 hours. Add the word exempt, or medical, crew, commuter or transit." },
  { what: "2024: 120 days", detail: "If you only know a year's total, give it. Used for any year with no dated stays." },
  { what: "Labels and comments", detail: "Text after # is ignored. Lines starting with # are skipped." },
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
const yearOf = (n) => new Date(n * MS).getUTCFullYear();
const daysIn = (y) => toDay(`${y}-12-31`) - toDay(`${y}-01-01`) + 1;

const EXEMPT_WORDS = "exempt|medical|crew|commuter|transit";

export function parseStays(text, asOf) {
  const asOfDay = toDay(asOf);
  const stays = [];
  const totals = {};
  const errors = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const t = /^(\d{4})\s*[:=-]\s*(\d{1,3})\s*(?:days?)?$/i.exec(line);
    if (t) {
      const y = +t[1], n = +t[2];
      if (n > daysIn(y)) { errors.push(`Line ${i + 1}: ${y} has only ${daysIn(y)} days.`); continue; }
      totals[y] = n;
      continue;
    }
    const m = new RegExp(`^(\\d{4}-\\d{2}-\\d{2})\\s*(?:to|-|–|—|until)\\s*(\\d{4}-\\d{2}-\\d{2}|present|today|now)(?:\\s+(${EXEMPT_WORDS}))?$`, "i").exec(line);
    if (!m) { errors.push(`Line ${i + 1}: expected "YYYY-MM-DD to YYYY-MM-DD", "... to present", or "YYYY: N days", got "${line}".`); continue; }
    const start = toDay(m[1]);
    const end = /^(present|today|now)$/i.test(m[2]) ? asOfDay : toDay(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end)) { errors.push(`Line ${i + 1}: not a real calendar date in "${line}".`); continue; }
    if (end < start) { errors.push(`Line ${i + 1}: the end date is before the start date.`); continue; }
    stays.push({ start, end, exempt: Boolean(m[3]), line: i + 1 });
  }
  return { stays, totals, errors };
}

// Days present in `year`, per day-set: exempt days are removed from the count.
function dayCounts(stays) {
  const present = new Set();
  const exempt = new Set();
  for (const s of stays) for (let d = s.start; d <= s.end; d++) (s.exempt ? exempt : present).add(d);
  for (const d of exempt) present.delete(d);
  const byYear = {};
  const exemptByYear = {};
  for (const d of present) byYear[yearOf(d)] = (byYear[yearOf(d)] || 0) + 1;
  for (const d of exempt) exemptByYear[yearOf(d)] = (exemptByYear[yearOf(d)] || 0) + 1;
  return { present, byYear, exemptByYear };
}

export const sixthsOf = (c, p1, p2) => 6 * c + 2 * p1 + p2;
export const weighted = (c, p1, p2) => sixthsOf(c, p1, p2) / 6;
export const meets = (c, p1, p2) => c >= DAYS_CURRENT_MIN && sixthsOf(c, p1, p2) >= SIXTHS_MIN;

// Most days you can spend in the US this calendar year and still not meet the test.
export function maxSafeDays(p1, p2) {
  const byWeight = Math.floor((SIXTHS_MIN - 1 - 2 * p1 - p2) / 6);
  return Math.max(DAYS_CURRENT_MIN - 1, byWeight);
}

// If you spend the most days allowed each year, what the next years allow. STEADY_DAYS is the most days a year
// you can repeat forever (9c < 1098 per the sixths test, so 121).
export const STEADY_DAYS = Math.floor((SIXTHS_MIN - 1) / 9);
export function outlook(c, p1, years = 3) {
  const rows = [];
  let a = c, b = p1;
  for (let i = 1; i <= years; i++) {
    const max = maxSafeDays(a, b);
    rows.push({ offset: i, max });
    b = a; a = max;
  }
  return rows;
}

// Last day you can be in the US on a trip that starts on `start` and stay under the test this year, assuming one
// unbroken stay and that the dated stays already entered stay as they are.
export function latestDeparture(start, roomLeft, year) {
  const s = toDay(start);
  if (Number.isNaN(s)) return { error: "The trip start must be YYYY-MM-DD." };
  if (yearOf(s) !== year) return { error: `The trip must start in ${year}.` };
  if (roomLeft <= 0) return { none: true };
  const last = s + roomLeft - 1;
  if (yearOf(last) !== year) return { yearEnd: true };
  return { last };
}

export function analyze(input = {}) {
  const asOf = input.asOf || new Date().toISOString().slice(0, 10);
  if (Number.isNaN(toDay(asOf))) throw new Error("The as-of date must be YYYY-MM-DD.");
  const year = Math.round(Number(input.year ?? yearOf(toDay(asOf))));
  if (!Number.isInteger(year) || year < 1990 || year > 2100) throw new Error("Test year must be a four-digit year.");
  const planned = Math.max(0, Math.floor(Number(input.planned ?? 0)) || 0);
  const { stays, totals, errors } = parseStays(input.stays, asOf);
  if (!stays.length && !Object.keys(totals).length) throw new Error(errors[0] || "Enter at least one US stay, e.g. 2025-01-10 to 2025-03-20, or a year total such as 2024: 120 days.");

  const { present, byYear, exemptByYear } = dayCounts(stays);
  const warnings = [];
  const yr = (y) => {
    if (byYear[y] !== undefined || exemptByYear[y] !== undefined) {
      if (totals[y] !== undefined) warnings.push(`${y}: dated stays and a "${totals[y]} days" total were both given; the dated stays are used.`);
      return { days: byYear[y] || 0, exempt: exemptByYear[y] || 0, source: "stays" };
    }
    if (totals[y] !== undefined) return { days: totals[y], exempt: 0, source: "total" };
    return { days: 0, exempt: 0, source: "none" };
  };
  const cur = yr(year), p1 = yr(year - 1), p2 = yr(year - 2);

  const sixths = sixthsOf(cur.days, p1.days, p2.days);
  const w = sixths / 6;
  const meetsCurrent = cur.days >= DAYS_CURRENT_MIN;
  const meetsWeighted = sixths >= SIXTHS_MIN;
  const resident = meetsCurrent && meetsWeighted;
  const safeMax = maxSafeDays(p1.days, p2.days);
  const roomLeft = Math.max(0, safeMax - cur.days);
  const over = Math.max(0, cur.days - safeMax);

  // Day on which the test is first met, from the dated stays of the test year.
  let crossing = null;
  let n = 0;
  const yStart = toDay(`${year}-01-01`), yEnd = toDay(`${year}-12-31`);
  if (stays.length && byYear[year] !== undefined) {
    for (let d = yStart; d <= yEnd; d++) {
      if (!present.has(d)) continue;
      n++;
      if (meets(n, p1.days, p2.days)) { crossing = d; break; }
    }
  }
  let firstDay = null;
  for (let d = yStart; d <= yEnd; d++) if (present.has(d)) { firstDay = d; break; }

  // Where a planned extra stay would take the total.
  const withPlanned = cur.days + planned;
  const plannedMeets = meets(withPlanned, p1.days, p2.days);

  // The cut-off for the next test year: what this year's days weigh when they become "prior".
  const nextYear = { sixths: sixthsOf(0, cur.days, p1.days) };
  const nextRoom = maxSafeDays(cur.days, p1.days);

  const tripStart = input.tripStart ? String(input.tripStart).trim() : null;
  const trip = tripStart ? latestDeparture(tripStart, roomLeft, year) : null;

  if (resident && cur.days < WEIGHTED_MIN) warnings.push(`You meet the test but were here fewer than ${WEIGHTED_MIN} days in ${year}: the closer connection exception (Form 8840) may apply if your tax home and closer connection were to a foreign country. It is claimed, not automatic.`);
  if (!resident && (cur.exempt || p1.exempt || p2.exempt)) warnings.push("Exempt days are left out of every count. They are only exempt if you really were an exempt individual; check Pub. 519 and Form 8843.");
  if (resident && firstDay) warnings.push(`If you meet the test, your US residency generally starts on the first day you were present in ${year}${firstDay ? ` (${fromDay(firstDay)})` : ""}; up to 10 days of nominal presence can be ignored if you have a closer connection to a foreign country in that period.`);

  return {
    asOf, year, planned, errors, warnings, stays, cur, p1, p2,
    sixths, weighted: w, meetsCurrent, meetsWeighted, resident,
    safeMax, roomLeft, over, crossing, firstDay,
    withPlanned, plannedMeets, nextRoom, tripStart, trip,
    outlook: outlook(cur.days, p1.days),
    parts: { c: cur.days, p1: p1.days / 3, p2: p2.days / 6 },
  };
}

const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

export function summarize(r) {
  const line1 = `${r.year}: ${r.cur.days} day${r.cur.days === 1 ? "" : "s"} counted + ${r.p1.days} in ${r.year - 1} ÷ 3 (${f1(r.parts.p1)}) + ${r.p2.days} in ${r.year - 2} ÷ 6 (${f1(r.parts.p2)}) = ${f1(r.weighted)} weighted days against the ${WEIGHTED_MIN} needed.`;
  const verdict = r.resident
    ? `You meet the substantial presence test for ${r.year}${r.crossing ? `; you crossed it on ${fromDay(r.crossing)}` : ""}.`
    : !r.meetsCurrent
      ? `You do not meet the test for ${r.year}: fewer than ${DAYS_CURRENT_MIN} days present this year (${r.cur.days}).`
      : `You do not meet the test for ${r.year}: ${f1(WEIGHTED_MIN - r.weighted)} weighted days under ${WEIGHTED_MIN}.`;
  const lines = [verdict, line1];
  if (!r.resident) lines.push(`You can be in the US ${r.roomLeft} more day${r.roomLeft === 1 ? "" : "s"} in ${r.year} (${r.safeMax} in all) and still stay under the test.`);
  else if (r.over > 0) lines.push(`You are ${r.over} day${r.over === 1 ? "" : "s"} past the most you could spend in ${r.year} (${r.safeMax}) and stay under the test.`);
  if (r.planned > 0) lines.push(`Adding a planned ${r.planned} day${r.planned === 1 ? "" : "s"} makes ${r.withPlanned} in ${r.year}: ${r.plannedMeets ? "that meets the test" : "that stays under the test"}.`);
  if (r.trip && r.trip.error) lines.push(r.trip.error);
  else if (r.trip && r.trip.last) lines.push(`A trip starting ${r.tripStart} can run to ${fromDay(r.trip.last)} and keep you under the test.`);
  else if (r.trip && r.trip.yearEnd) lines.push(`A trip starting ${r.tripStart} can run to the end of ${r.year} and keep you under the test.`);
  else if (r.trip && r.trip.none) lines.push(`There is no room left in ${r.year} for another day.`);
  return { status: r.resident ? "meets" : "under", text: lines.join("\n") };
}

// I-94 travel history (i94.cbp.dhs.gov "Get Travel History") pasted as text: one row per
// crossing, a date, Arrival or Departure, and a port. Rows are paired in date order into
// stays. Dates may be MM/DD/YYYY, YYYY-MM-DD or "Mar 4, 2024"-style month names.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function dateIn(line) {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(line);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(line);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(line);
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export function importI94(text) {
  const rows = [];
  const notes = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const kind = /\b(arriv\w*|entry|entered)\b/i.test(line) ? "in" : /\b(depart\w*|exit\w*)\b/i.test(line) ? "out" : null;
    const iso = dateIn(line);
    if (!kind || !iso || Number.isNaN(toDay(iso))) continue;
    rows.push({ iso, kind, day: toDay(iso) });
  }
  rows.sort((a, b) => a.day - b.day || (a.kind === "in" ? -1 : 1));
  const lines = [];
  let open = null;
  for (const r of rows) {
    if (r.kind === "in") {
      if (open) notes.push(`Two arrivals in a row (${open.iso}, ${r.iso}): a departure may be missing between them; the first stay was ended on the day before the second arrival.`);
      if (open) lines.push(`${open.iso} to ${fromDay(r.day - 1)}`);
      open = r;
    } else if (open) { lines.push(`${open.iso} to ${r.iso}`); open = null; }
    else notes.push(`Departure on ${r.iso} has no earlier arrival in what you pasted, so it was skipped. If you were already in the US, add a line starting before it.`);
  }
  if (open) lines.push(`${open.iso} to present`);
  return { lines, notes, rows: rows.length };
}

export const SAMPLE = [
  "2023-03-01 to 2023-06-28  # three-month client stint",
  "2024-03-01 to 2024-06-28",
  "2025-03-01 to 2025-05-30",
].join("\n");
export const SAMPLE_OPTIONS = { asOf: "2025-06-15", year: 2025, planned: 40 };
