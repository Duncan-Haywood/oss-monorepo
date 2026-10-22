// Tax depreciation worksheet (US, MACRS general depreciation system, half-year
// convention). The books depreciate on a straight-line schedule (assets.mjs);
// the tax return uses its own: an optional Section 179 deduction, optional bonus
// depreciation, then the IRS percentage tables on what is left. This module
// computes that second schedule from `books.assets` plus a `tax` field on each
// asset: { macrsClass: 3|5|7|10|15|20, s179: cents, bonusPct: 0-100 }.
// It does not post anything. Whether you may elect 179 or bonus, the dollar
// limits, business-use share, listed property and the mid-quarter test's exact
// inputs are for you or your preparer; the worksheet flags what it cannot check.
// Rates: IRS Publication 946, Table A-1 (half-year). Pure functions.

import { schedule, booksThrough } from "./assets.mjs";

// Percent of the depreciable basis per recovery year, in thousandths of a percent.
const T = (a) => a.map((p) => Math.round(p * 1000));
export const MACRS_HALF_YEAR = {
  3: T([33.33, 44.45, 14.81, 7.41]),
  5: T([20.0, 32.0, 19.2, 11.52, 11.52, 5.76]),
  7: T([14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]),
  10: T([10.0, 18.0, 14.4, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28]),
  15: T([5.0, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.95]),
  20: T([3.75, 7.219, 6.677, 6.177, 5.713, 5.285, 4.888, 4.522, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 4.462, 4.461, 2.231]),
};

// Mid-quarter convention: property is treated as placed in service at the middle
// of its quarter, so year 1 gets 87.5, 62.5, 37.5 or 12.5% of a full year. The
// IRS tables (Pub 946 A-2 to A-5) are the declining balance method (200% for
// 3 to 10 years, 150% for 15 and 20) switching to straight line when that is
// larger. They are generated here that way and rounded to two decimals. The
// IRS rounds some repeated straight-line years by hand (a year can differ by
// 0.01 to 0.04 of a point from the printed row), so the totals are exact but
// a year may not match the printed table to the last digit; not checked
// against the publication (offline).
const QUARTER_FRACTION = [0.875, 0.625, 0.375, 0.125];
function midQuarterTable(life, quarter) {
  const rate = (life >= 15 ? 1.5 : 2) / life;
  const out = [];
  let basis = 1, used = 0, remainingLife = life;
  for (let y = 0; y <= life; y++) {
    let amt;
    if (y === 0) { amt = basis * rate * QUARTER_FRACTION[quarter - 1]; remainingLife = life - QUARTER_FRACTION[quarter - 1]; }
    else {
      const db = basis * rate;
      const sl = basis / remainingLife;
      amt = Math.min(basis, Math.max(db, sl));
      remainingLife -= 1;
    }
    out.push(amt); basis -= amt; used += amt;
  }
  const r = out.map((x) => Math.round(x * 10000) / 100);
  // Year after the last full year takes whatever rounding left, so the table adds to 100.
  while (r.length && r[r.length - 1] === 0) r.pop();
  r[r.length - 1] = Math.round((100 - r.slice(0, -1).reduce((s, x) => s + x, 0)) * 100) / 100;
  return r;
}
// 7-year rows as printed in Tables A-2 to A-5 (typed from memory, offline, not
// checked against the publication). The generator is a hair off in the repeated
// straight-line years (8.75/8.74 and the last year), so these replace it.
const PRINTED_7 = [
  [25.0, 21.43, 15.31, 10.93, 8.75, 8.74, 8.75, 1.09],
  [17.85, 23.47, 16.76, 11.97, 8.87, 8.87, 8.87, 3.34],
  [10.71, 25.51, 18.22, 13.02, 9.3, 8.85, 8.86, 5.53],
  [3.57, 27.55, 19.68, 14.06, 10.04, 8.73, 8.73, 7.64],
];
export const MACRS_MID_QUARTER = Object.fromEntries([3, 5, 7, 10, 15, 20].map((c) => [c, [1, 2, 3, 4].map((q) => T(c === 7 ? PRINTED_7[q - 1] : midQuarterTable(c, q)))]));

export const CLASSES = Object.keys(MACRS_HALF_YEAR).map(Number);

const clone = (x) => JSON.parse(JSON.stringify(x));

// Record the tax treatment of an asset. -> { books, asset } or throws.
export function setTaxTreatment(booksIn, id, { macrsClass, s179 = 0, bonusPct = 0 } = {}) {
  const books = clone(booksIn);
  const a = (books.assets ?? []).find((x) => x.id === id);
  if (!a) throw new Error(`No asset ${id}.`);
  const cls = +macrsClass;
  if (!CLASSES.includes(cls)) throw new Error(`MACRS class must be one of ${CLASSES.join(", ")} years.`);
  const sec = typeof s179 === "number" ? s179 : Math.round(parseFloat(String(s179).replace(/[$,]/g, "")) * 100);
  if (!Number.isInteger(sec) || sec < 0 || sec > a.cents) throw new Error("Section 179 must be zero or more and no more than the cost (cents).");
  const bp = +bonusPct;
  if (!(bp >= 0 && bp <= 100)) throw new Error("Bonus percent must be between 0 and 100.");
  a.tax = { macrsClass: cls, s179: sec, bonusPct: bp };
  return { books, asset: a };
}

// One asset's tax depreciation in `year`. Year 1 is the year placed in service.
// Disposal year takes half of that year's table amount (half-year convention); under mid-quarter it takes 12.5, 37.5, 62.5 or 87.5% by the quarter of disposal. `midQuarter` uses the mid-quarter tables for the asset's quarter.
// -> { s179, bonus, macrs, total } in cents
export function assetTaxYear(a, year, midQuarter = false) {
  const t = a.tax;
  if (!t) return { s179: 0, bonus: 0, macrs: 0, total: 0 };
  const y0 = +a.date.slice(0, 4);
  const n = year - y0;
  const out = { s179: n === 0 ? t.s179 : 0, bonus: 0, macrs: 0 };
  const afterSec = a.cents - t.s179;
  const bonus = Math.round((afterSec * t.bonusPct) / 100);
  if (n === 0) out.bonus = bonus;
  if (n >= 0) {
    const quarter = Math.floor((+a.date.slice(5, 7) - 1) / 3) + 1;
    const table = midQuarter ? MACRS_MID_QUARTER[t.macrsClass][quarter - 1] : MACRS_HALF_YEAR[t.macrsClass];
    const base = afterSec - bonus;
    const pct = (k) => table[k] ?? 0;
    // Cumulative rounding so the years add to the basis exactly.
    const cum = (k) => (k < 0 ? 0 : k >= table.length - 1 ? base : Math.round((base * table.slice(0, k + 1).reduce((s, p) => s + p, 0)) / 100000));
    const dispYear = a.disposed ? +a.disposed.date.slice(0, 4) : null;
    if (dispYear === null || year <= dispYear) {
      let amt = pct(n) === 0 ? 0 : cum(n) - cum(n - 1);
      if (dispYear === year) {
        // Half-year: half of the year's amount. Mid-quarter: the disposal quarter's midpoint (12.5, 37.5, 62.5, 87.5%).
        const dq = Math.floor((+a.disposed.date.slice(5, 7) - 1) / 3);
        amt = midQuarter ? Math.round((amt * (2 * dq + 1)) / 8) : Math.round(amt / 2);
      }
      out.macrs = amt;
    }
  }
  out.total = out.s179 + out.bonus + out.macrs;
  return out;
}

// The mid-quarter test for the year property was placed in service: true when
// more than 40% of that year's depreciable basis (cost less 179) went into
// service in October to December. Then every item placed that year uses the
// mid-quarter tables for its own quarter.
export function usesMidQuarter(books, year) {
  const placed = (books.assets ?? []).filter((a) => a.tax && a.date.startsWith(String(year)));
  const basis = placed.reduce((s, a) => s + a.cents - a.tax.s179, 0);
  const q4 = placed.filter((a) => +a.date.slice(5, 7) >= 10).reduce((s, a) => s + a.cents - a.tax.s179, 0);
  return basis > 0 && q4 * 100 > basis * 40;
}

// Section 179 dollar limit and investment threshold (cents) by year placed in
// service. 2026 ($2,560,000 / $4,090,000, Rev. Proc. 2025-32) and 2025
// ($2,500,000 / $4,000,000, the 2025 law) agree across several published
// secondary sources (checked 2026-10-22); the IRS host was unreachable from
// the build container, so the Rev. Proc. text itself is still unread. 2024 is
// Rev. Proc. 2023-34. Check before filing; pass `limits` to override.
export const S179_LIMITS = {
  2024: { limit: 122000000, threshold: 305000000 },
  2025: { limit: 250000000, threshold: 400000000 },
  2026: { limit: 256000000, threshold: 409000000 },
};

// Elected 179 for one placed-in-service year against the dollar limit reduced
// dollar-for-dollar by the cost placed in service above the threshold.
// -> null when the year has no limits; else { limit, threshold, placedCost, allowed, elected, excess }
export function s179Check(books, placedYear, limits = S179_LIMITS) {
  const lim = limits[placedYear];
  if (!lim) return null;
  const placed = (books.assets ?? []).filter((a) => a.tax && +a.date.slice(0, 4) === placedYear);
  const placedCost = placed.reduce((s, a) => s + a.cents, 0);
  const elected = placed.reduce((s, a) => s + a.tax.s179, 0);
  const allowed = Math.max(0, lim.limit - Math.max(0, placedCost - lim.threshold));
  return { year: placedYear, limit: lim.limit, threshold: lim.threshold, placedCost, allowed, elected, excess: Math.max(0, elected - allowed) };
}

// The taxable-income limit and carryforward, following Form 4562 lines 9-13.
// `businessIncome` is the year's taxable income from active trades or
// businesses computed before the 179 deduction (cents; may be negative);
// `carryIn` is the disallowed amount carried from earlier years. The year's
// election counts at the lesser of what was elected and the dollar limit, plus
// the carry-in; the deduction is the lesser of that and the income (floor 0).
// -> null when businessIncome is null and nothing carries in;
//    else { elected, dollarLimited, carryIn, income, deductible, carryOut }
export function s179IncomeLimit(books, year, { limits = S179_LIMITS, businessIncome = null, carryIn = 0 } = {}) {
  if (businessIncome === null && !carryIn) return null;
  const c = s179Check(books, year, limits);
  const elected = (books.assets ?? []).filter((a) => a.tax && +a.date.slice(0, 4) === year).reduce((s, a) => s + a.tax.s179, 0);
  const dollarLimited = c ? Math.min(elected, c.allowed) : elected;
  const pool = dollarLimited + carryIn;
  const income = businessIncome === null ? pool : Math.max(0, businessIncome);
  const deductible = Math.min(pool, income);
  return { year, elected, dollarLimited, carryIn, income: businessIncome, deductible, carryOut: pool - deductible };
}

// The worksheet for a tax year: a row per asset with a tax treatment, the book
// depreciation for the same year for comparison, and warnings.
export function taxDepreciation(books, year, { limits = S179_LIMITS, businessIncome = null, carryIn = 0 } = {}) {
  const through = booksThrough(books);
  const rows = [];
  const warnings = [];
  const untreated = [];
  for (const a of books.assets ?? []) {
    if (!a.tax) { if (+a.date.slice(0, 4) <= year) untreated.push(a.id); continue; }
    if (+a.date.slice(0, 4) > year) continue;
    const mq = usesMidQuarter(books, +a.date.slice(0, 4));
    const t = assetTaxYear(a, year, mq);
    const book = schedule(a, through).filter((r) => r.date.startsWith(String(year))).reduce((s, r) => s + r.cents, 0);
    rows.push({ midQuarter: mq, id: a.id, name: a.name, placed: a.date, class: a.tax.macrsClass, cost: a.cents, ...t, book, difference: t.total - book });
  }
  for (const y of [...new Set(rows.filter((r) => r.midQuarter).map((r) => +r.placed.slice(0, 4)))]) warnings.push(`More than 40% of ${y}'s depreciable basis was placed in service in October to December, so the mid-quarter convention applies to everything placed in service in ${y} (tables generated by the IRS method; a year can differ from the printed Pub 946 row by a few hundredths of a point). The test counts only assets with a tax treatment set here; add the rest or check it with your preparer.`);
  if (untreated.length) warnings.push(`No tax treatment set for ${untreated.join(", ")}; they are left out. Set one with "asset tax ID --class 5".`);
  const money = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const y of [...new Set(rows.filter((r) => r.s179).map((r) => +r.placed.slice(0, 4)))]) {
    const c = s179Check(books, y, limits);
    if (!c) warnings.push(`No Section 179 limits on file for ${y}; the dollar limit and phase-out are not checked.`);
    else if (c.excess) warnings.push(`Section 179 elected for ${y} is ${money(c.elected)} but the limit after the investment phase-out is ${money(c.allowed)} (limit ${money(c.limit)}, ${money(c.placedCost)} placed in service against a ${money(c.threshold)} threshold); ${money(c.excess)} is over and is not allowed. The worksheet still shows what you entered.`);
  }
  const s179Income = s179IncomeLimit(books, year, { limits, businessIncome, carryIn });
  if (s179Income && s179Income.carryOut) warnings.push(`Section 179 is limited to taxable business income: ${money(s179Income.deductible)} is deductible this year and ${money(s179Income.carryOut)} carries to ${year + 1} (Form 4562 lines 9-13). The worksheet rows still show what you elected.`);
  if (rows.some((r) => r.s179)) warnings.push(`Section 179 limits agree with published secondary sources but are unchecked against the IRS text; ${businessIncome === null && !carryIn ? "pass the year's taxable business income to apply the taxable-income limit and carryforward" : "the taxable-income limit uses the income you supplied, before the 179 deduction"}.`);
  for (const r of rows) {
    const bp = (books.assets ?? []).find((a) => a.id === r.id)?.tax?.bonusPct ?? 0;
    const py = +r.placed.slice(0, 4);
    if (bp > maxBonusPct(py)) warnings.push(`${r.id}: bonus ${bp}% is above the ${maxBonusPct(py)}% allowed for property placed in service in ${py}. The worksheet still uses your figure.`);
  }
  for (const y of [...new Set(rows.filter((r) => a_bonus(books, r.id) && r.placed.startsWith("2025")).map(() => 2025))]) warnings.push("Bonus for 2025: 100% applies only to property acquired after 19 January 2025; property acquired before that date gets 40%. The worksheet has no acquisition date, so check it.");
  if (rows.some((r) => a_bonus(books, r.id))) warnings.push("Bonus depreciation is applied at the percent you entered; the checks above cover only the year's maximum, not an election out by class.");
  warnings.push("Business-use share, listed property and the placed-in-service date's own rules are not modelled.");
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { year, s179Income, rows, totals: { s179: sum("s179"), bonus: sum("bonus"), macrs: sum("macrs"), total: sum("total"), book: sum("book"), difference: sum("difference") }, warnings };
}
// Highest bonus depreciation percent for property placed in service in a year:
// 100 to 2022, then the 2017 act's phase-down (80, 60), and 100 again for
// property acquired after 19 January 2025 (Pub. L. 119-21), which is all of 2026
// on. 2025 is 100 here but is 40 for property acquired before that date; the
// worksheet has no acquisition date, so it says so. From secondary summaries
// (irs.gov unreachable), so confirm.
export function maxBonusPct(year) {
  if (year <= 2022) return 100;
  if (year === 2023) return 80;
  if (year === 2024) return 60;
  return 100;
}
const a_bonus = (books, id) => (books.assets ?? []).find((a) => a.id === id)?.tax?.bonusPct > 0;

// The worksheet as CSV for a preparer: one row per asset, then totals, then the notes.
export function taxDepreciationCsv(w) {
  const d = (c) => (c / 100).toFixed(2);
  const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
  const rows = [`Asset,Name,Placed in service,MACRS class,Cost,Section 179,Bonus,MACRS ${w.year},Tax depreciation ${w.year},Book depreciation ${w.year},Difference`];
  for (const r of w.rows) rows.push([r.id, q(r.name), r.placed, r.class, d(r.cost), d(r.s179), d(r.bonus), d(r.macrs), d(r.total), d(r.book), d(r.difference)].join(","));
  const t = w.totals;
  rows.push(["Total", "", "", "", "", d(t.s179), d(t.bonus), d(t.macrs), d(t.total), d(t.book), d(t.difference)].join(","));
  for (const x of w.warnings) rows.push(`Note,${q(x)}`);
  return rows.join("\n") + "\n";
}
