// Rate plans: a short text format a person can copy from their utility's tariff sheet,
// turned into one import price and one export credit for every hour of the data.
// Pure functions, no I/O.
//
//   name: Example 4-9 pm plan (invented prices)
//   fixed: 15                      $ per month, whatever is used
//   import: 0.32                   the price for every hour no later line covers
//   import jun-sep 16-21: 0.52     months, day type and hours narrow a line;
//   import oct-may weekdays 16-21: 0.41   the LAST matching line wins
//   holidays: weekend              US federal holidays priced as weekend days
//   export: 0.04                   credit per kWh sent to the grid
//   export jun-sep 16-21: 0.20
//   export: import - 0.03          or: the import price of that hour, minus 0.03
//   export table weekdays:         or 12 lines (Jan..Dec) of 24 hourly credits
//
// Hours run from the start hour to the end hour, end not included, on the local wall
// clock, and may wrap past midnight (21-6). Months may wrap the year end (oct-may).

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthSet(spec) {
  const set = new Set();
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^([a-z]{3})[a-z]*(?:-([a-z]{3})[a-z]*)?$/);
    if (!m) return null;
    const a = MONTHS.indexOf(m[1]);
    const b = m[2] ? MONTHS.indexOf(m[2]) : a;
    if (a < 0 || b < 0) return null;
    for (let i = a; ; i = (i + 1) % 12) { set.add(i); if (i === b) break; }
  }
  return set;
}

function hourSet(spec) {
  const m = spec.match(/^(\d{1,2})(?::00)?-(\d{1,2})(?::00)?$/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  if (a > 24 || b > 24 || a === b) return null;
  const set = new Set();
  // do/while so that 0-24 (and 6-6+24 style full days) covers all 24 hours; a === b is refused above
  let h = a % 24; const end = b % 24;
  do { set.add(h); h = (h + 1) % 24; } while (h !== end);
  return set;
}

const DAYS = { weekdays: "weekday", weekday: "weekday", weekends: "weekend", weekend: "weekend", all: "all", everyday: "all" };

/** Reads the qualifiers between the keyword and the colon: months, day type, hours, in any order. */
function qualifiers(words, lineNo, errors) {
  const q = { months: null, days: "all", hours: null };
  for (const w of words) {
    if (DAYS[w]) q.days = DAYS[w];
    else if (/^\d/.test(w)) { const h = hourSet(w); if (h) q.hours = h; else errors.push(`Line ${lineNo}: "${w}" is not an hour range such as 16-21.`); }
    else { const m = monthSet(w); if (m) q.months = m; else errors.push(`Line ${lineNo}: "${w}" is not a month range (jun-sep), a day type (weekdays, weekends) or hours (16-21).`); }
  }
  return q;
}

const num = (s) => { const n = Number(String(s).replace(/[$\s]/g, "")); return Number.isFinite(n) ? n : NaN; };

/**
 * Parses one plan. Returns { ok, plan: {name, fixed, imports:[rule], exports:[rule], exportFromImport, tables, holidays}, errors }.
 * A rule is { months:Set|null, days, hours:Set|null, price }.
 */
export function parseTariff(text) {
  const errors = [];
  const plan = { name: "", fixed: 0, imports: [], exports: [], exportFromImport: null, tables: {}, holidays: false };
  const lines = String(text ?? "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/#.*$/, "").trim();
    if (!raw) continue;
    const lineNo = i + 1;
    const c = raw.indexOf(":");
    if (c < 0) { errors.push(`Line ${lineNo}: no colon; expected "import 16-21: 0.45" or similar.`); continue; }
    const words = raw.slice(0, c).trim().toLowerCase().split(/\s+/);
    const value = raw.slice(c + 1).trim();
    const key = words[0];
    if (key === "name") { plan.name = value.slice(0, 120); continue; }
    if (key === "fixed") { const v = num(value); if (Number.isFinite(v) && v >= 0) plan.fixed = v; else errors.push(`Line ${lineNo}: the fixed charge should be dollars a month.`); continue; }
    if (key === "holidays") { plan.holidays = /weekend/i.test(value); continue; }
    if (key === "export" && words[1] === "table") {
      const days = DAYS[words[2]] || "all";
      const rows = [];
      while (rows.length < 12 && i + 1 < lines.length) {
        const nxt = lines[i + 1].replace(/#.*$/, "").trim();
        if (!nxt) { i++; continue; }
        const vals = nxt.split(/[\s,;]+/).map(num);
        if (vals.length !== 24 || vals.some((v) => !Number.isFinite(v))) break;
        rows.push(vals); i++;
      }
      if (rows.length !== 12) errors.push(`Line ${lineNo}: an export table needs 12 lines (January to December) of 24 numbers; found ${rows.length}.`);
      else plan.tables[days] = rows;
      continue;
    }
    if (key !== "import" && key !== "export") { errors.push(`Line ${lineNo}: unknown line "${key}"; expected name, fixed, import, export or holidays.`); continue; }
    const q = qualifiers(words.slice(1), lineNo, errors);
    if (key === "export") {
      const m = value.match(/^import\s*(?:([-+])\s*\$?([\d.]+))?$/i);
      if (m) {
        if (words.length > 1) errors.push(`Line ${lineNo}: "export: import" applies to every hour; give it no months or hours.`);
        plan.exportFromImport = m[1] ? (m[1] === "-" ? -1 : 1) * num(m[2]) : 0;
        continue;
      }
    }
    const price = num(value);
    if (!Number.isFinite(price)) { errors.push(`Line ${lineNo}: "${value}" is not a price in dollars per kWh.`); continue; }
    if (price > 5 || price < -5) errors.push(`Line ${lineNo}: ${price} $/kWh is outside -5 to 5; prices are dollars, not cents (0.32, not 32).`);
    (key === "import" ? plan.imports : plan.exports).push({ ...q, price });
  }
  if (!plan.imports.length) errors.push("No import price: add a line such as \"import: 0.30\".");
  return { ok: errors.length === 0, plan, errors };
}

/** Splits text holding several plans separated by a line of three or more dashes. */
export function parseTariffs(text) {
  return String(text ?? "").split(/^\s*-{3,}\s*$/m).filter((s) => s.trim()).map(parseTariff);
}

// US federal holidays as most time-of-use tariffs list them (New Year's Day, Presidents' Day,
// Memorial Day, Independence Day, Labor Day, Veterans Day, Thanksgiving, Christmas), a
// Sunday holiday observed on the Monday and a Saturday one on the Friday. Utilities differ:
// some leave out Presidents' Day or Veterans Day; check the tariff sheet.
const nthDow = (y, m, dow, n) => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((dow - first + 7) % 7) + 7 * (n - 1); };
const lastDow = (y, m, dow) => { const last = new Date(Date.UTC(y, m + 1, 0)); return last.getUTCDate() - ((last.getUTCDay() - dow + 7) % 7); };
export function usHolidays(y) {
  const fixed = [[0, 1], [6, 4], [10, 11], [11, 25]].map(([m, d]) => {
    const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
    return Date.UTC(y, m, d + (dow === 0 ? 1 : dow === 6 ? -1 : 0));
  });
  const floating = [[0 + 1, 1, 3], [8, 1, 1], [10, 4, 4]].map(([m, dow, n]) => Date.UTC(y, m, nthDow(y, m, dow, n)));
  floating.push(Date.UTC(y, 4, lastDow(y, 4, 1)));
  // A Saturday New Year's Day of y+1 is observed on Fri Dec 31 of y: it belongs to this year's set.
  if (new Date(Date.UTC(y + 1, 0, 1)).getUTCDay() === 6) fixed.push(Date.UTC(y, 11, 31));
  return new Set([...fixed, ...floating].map((t) => new Date(t).toISOString().slice(0, 10)));
}

const matches = (r, month, weekend, hour) =>
  (!r.months || r.months.has(month)) && (r.days === "all" || (r.days === "weekend") === weekend) && (!r.hours || r.hours.has(hour));

/**
 * Prices for n consecutive wall-clock hours from `start` (ms, UTC frame = wall clock).
 * Returns { imp: Float64Array, exp: Float64Array, month: Int32Array (index into months), months: ["2025-01", ...], uncovered }.
 */
export function hourlyPrices(plan, start, n) {
  const imp = new Float64Array(n), exp = new Float64Array(n), month = new Int32Array(n);
  const months = [];
  const hol = new Map();
  let uncovered = 0;
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 3600000);
    const y = d.getUTCFullYear(), mo = d.getUTCMonth(), h = d.getUTCHours();
    const key = `${y}-${String(mo + 1).padStart(2, "0")}`;
    if (months[months.length - 1] !== key) months.push(key);
    month[i] = months.length - 1;
    let weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    if (plan.holidays && !weekend) {
      if (!hol.has(y)) hol.set(y, usHolidays(y));
      weekend = hol.get(y).has(d.toISOString().slice(0, 10));
    }
    let p = NaN;
    for (const r of plan.imports) if (matches(r, mo, weekend, h)) p = r.price;
    if (!Number.isFinite(p)) { uncovered++; p = 0; }
    imp[i] = p;
    let e = 0;
    const table = plan.tables[weekend ? "weekend" : "weekday"] || plan.tables.all;
    if (plan.exportFromImport != null) e = p + plan.exportFromImport;
    else if (table) e = table[mo][h];
    for (const r of plan.exports) if (matches(r, mo, weekend, h)) e = r.price;
    exp[i] = e;
  }
  return { imp, exp, month, months, uncovered };
}

export const EXAMPLE_TARIFFS = `name: Example A, 4-9 pm peak, low export credit (invented prices)
fixed: 15
import: 0.33
import jun-sep: 0.38
import 16-21: 0.44
import jun-sep 16-21: 0.55
holidays: weekend
export: 0.04
export jun-sep 16-21: 0.22
export oct-may 16-21: 0.09
---
name: Example B, same prices, export credited at import minus 0.03 (invented)
fixed: 15
import: 0.33
import jun-sep: 0.38
import 16-21: 0.44
import jun-sep 16-21: 0.55
holidays: weekend
export: import - 0.03
---
name: Example C, flat price, one-for-one net metering (invented)
fixed: 10
import: 0.30
export: import`;
