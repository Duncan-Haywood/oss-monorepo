// League schedule generator, dates.mjs: Dates and times: weekday names, ISO days, the next play day, parsing of dates, weekdays and clock times.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MAX_SCAN_DAYS = 2000;

// ---------------------------------------------------------------- dates

/** Days since 1970-01-01 for a real calendar date, or null. */
export function toDay(y, m, d) {
  if (![y, m, d].every(Number.isInteger) || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / 86400000;
}

export function dayIso(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

export function dayOfWeek(day) {
  return new Date(day * 86400000).getUTCDay();
}

/** "Tue 6 Oct 2026" */
export function dayLabel(day) {
  const d = new Date(day * 86400000);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Accepts YYYY-MM-DD and M/D/YYYY. order "dmy" reads 05/01/2027 as 5 January,
 * "mdy" as May 1; left out, each date decides alone (US unless the first
 * number is over 12).
 */
export function parseDate(text, order) {
  const s = String(text ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toDay(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    // 25/12/2026 can only be day/month; 5/6/2026 stays month/day (US), as before.
    const dayFirst = order === "dmy" ? b <= 12 : order !== "mdy" && a > 12 && b <= 12;
    return dayFirst ? toDay(Number(m[3]), b, a) : toDay(Number(m[3]), a, b);
  }
  // 25.12.2026 (day.month.year, used across Europe): never month-first.
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return toDay(Number(m[3]), Number(m[2]), Number(m[1]));
  // "25 Dec 2026", "25 December 2026", "Dec 25, 2026", "December 25 2026"
  const mon = (t) => { const i = MONTH_WORDS.findIndex((n) => t.toLowerCase() === n || (t.length >= 3 && n.startsWith(t.toLowerCase()))); return i < 0 ? 0 : i + 1; };
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m && mon(m[2])) return toDay(Number(m[3]), mon(m[2]), Number(m[1]));
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m && mon(m[1])) return toDay(Number(m[3]), mon(m[1]), Number(m[2]));
  return null;
}
const MONTH_WORDS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const RANGE_SPLIT = /\s+(?:to|through|thru|until)\s+|\s+[–—-]\s+|\.\./i;

// One day/month order for a whole box of dates: whoever typed 20/12/2026
// means 05/01/2027 as 5 January, not May 1 (a UK holiday blackout once
// blocked 133 days of a season). { order: "dmy" | "mdy" | undefined, mixed }:
// mixed when both orders appear and some date could be read either way.
export function dateOrder(text) {
  const pairs = [...String(text ?? "").matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/\d{4}(?![\d/])/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const dmy = pairs.some(([a, b]) => a > 12 && b <= 12), mdy = pairs.some(([a, b]) => b > 12 && a <= 12);
  return { order: dmy && !mdy ? "dmy" : mdy && !dmy ? "mdy" : undefined, mixed: dmy && mdy && pairs.some(([a, b]) => a <= 12 && b <= 12 && a !== b) };
}
export const MIXED_ORDER = "Some dates put the day first (25/12/2026) and some the month first (12/25/2026), so a date like 05/01/2027 could be either. Use YYYY-MM-DD.";

/** "2026-12-24, 2026-12-30 to 2027-01-02" -> { days, errors }. Ranges are capped at 366 days.
 * known: an order from dateOrder() over the whole input, when the list is one line of it. */
export function parseDateList(text, known) {
  const days = [];
  const errors = [];
  const tokens = String(text ?? "").split(/[,;\n]+/);
  let order = known;
  if (order === undefined) {
    const o = dateOrder(text);
    if (o.mixed) errors.push(MIXED_ORDER);
    order = o.order;
  }
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    const parts = token.split(RANGE_SPLIT).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 1) {
      const d = parseDate(parts[0], order);
      if (d === null) errors.push(`"${token}" is not a date. Use YYYY-MM-DD (or 25/12/2026, 25 Dec 2026).`);
      else days.push(d);
    } else if (parts.length === 2) {
      const a = parseDate(parts[0], order);
      const b = parseDate(parts[1], order);
      if (a === null || b === null) errors.push(`"${token}" is not a date range. Use YYYY-MM-DD to YYYY-MM-DD.`);
      else if (b < a) errors.push(`"${token}" ends before it starts.`);
      else if (b - a > 365) errors.push(`"${token}" is longer than a year.`);
      else for (let d = a; d <= b; d++) days.push(d);
    } else errors.push(`"${token}" is not a date or a range.`);
  }
  return { days: [...new Set(days)].sort((x, y) => x - y), errors };
}

export function parseWeekdays(input) {
  const list = Array.isArray(input) ? input : String(input ?? "").split(/[\s,;/]+/);
  const out = new Set();
  const errors = [];
  for (const raw of list) {
    if (typeof raw === "number" && raw >= 0 && raw <= 6 && Number.isInteger(raw)) { out.add(raw); continue; }
    const t = String(raw).trim().toLowerCase();
    if (!t) continue;
    let idx = WEEKDAY_NAMES.findIndex((n) => n === t || (t.length >= 3 && n.startsWith(t)));
    if (idx < 0 && /^[0-6]$/.test(t)) idx = Number(t);
    if (idx < 0) errors.push(`"${raw}" is not a weekday.`);
    else out.add(idx);
  }
  return { weekdays: [...out].sort((a, b) => a - b), errors };
}

/** "6:30pm", "18:00", "7pm" -> "18:30" or null. */
export function parseTime(text) {
  const m = String(text ?? "").trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "pm" && h !== 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function nextPlayDay(from, weekdaySet, skipSet) {
  let d = from;
  for (let guard = 0; guard < MAX_SCAN_DAYS; guard++, d++) {
    if (weekdaySet.has(dayOfWeek(d)) && !skipSet.has(d)) return d;
  }
  return null;
}

export { nextPlayDay, MAX_SCAN_DAYS };
