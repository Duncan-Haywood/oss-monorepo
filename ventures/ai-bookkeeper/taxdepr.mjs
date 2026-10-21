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
export const MACRS_MID_QUARTER = Object.fromEntries([3, 5, 7, 10, 15, 20].map((c) => [c, [1, 2, 3, 4].map((q) => T(midQuarterTable(c, q)))]));

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
// Disposal year takes half of that year's table amount (half-year convention). `midQuarter` uses the mid-quarter tables for the asset's quarter.
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
      if (dispYear === year) amt = Math.round(amt / 2);
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

// Section 179 dollar limit and the investment level where it starts to shrink,
// by year placed in service, in cents. 2023 to 2025 are from memory of the
// statute and Rev. Procs. and 2026 (Rev. Proc. 2025-32) from secondary sources
// only: none is checked against the IRS's own page. The limit falls by $1 for
// each $1 of qualifying property placed in service above the threshold.
export const S179_LIMITS = {
  2023: { limit: 116000000, threshold: 289000000 },
  2024: { limit: 122000000, threshold: 305000000 },
  2025: { limit: 250000000, threshold: 400000000 },
  2026: { limit: 256000000, threshold: 409000000 },
};

// The most Section 179 a year's purchases can support, or null for a year without a table.
export function s179Allowed(books, year) {
  const t = S179_LIMITS[year];
  if (!t) return null;
  const placed = (books.assets ?? []).filter((a) => a.date.startsWith(String(year)));
  const invested = placed.reduce((s, a) => s + a.cents, 0);
  const allowed = Math.max(0, t.limit - Math.max(0, invested - t.threshold));
  const elected = placed.reduce((s, a) => s + (a.tax?.s179 ?? 0), 0);
  return { ...t, invested, allowed, elected, over: Math.max(0, elected - allowed) };
}

// The worksheet for a tax year: a row per asset with a tax treatment, the book
// depreciation for the same year for comparison, and warnings.
export function taxDepreciation(books, year) {
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
  if (rows.some((r) => r.s179)) {
    const lim = s179Allowed(books, year);
    const d = (c) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (!lim) warnings.push(`Section 179 dollar limits are not tabled for ${year}, so the limit and the investment phase-out are not checked; the taxable-income limit never is.`);
    else {
      if (lim.over) warnings.push(`Section 179 elected for ${year} (${d(lim.elected)}) is ${d(lim.over)} over the most ${year} purchases support (${d(lim.allowed)}: limit ${d(lim.limit)}, reduced dollar for dollar above ${d(lim.threshold)} of property placed in service; you placed ${d(lim.invested)}).`);
      warnings.push(`Section 179 limits for ${year} are typed from secondary sources, not the IRS page, and the taxable-income limit is not checked.`);
    }
  }
  if (rows.some((r) => a_bonus(books, r.id))) warnings.push("Bonus depreciation is applied at the percent you entered; check the rate in force for the year placed in service.");
  warnings.push("Business-use share, listed property and the placed-in-service date's own rules are not modelled.");
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { year, rows, totals: { s179: sum("s179"), bonus: sum("bonus"), macrs: sum("macrs"), total: sum("total"), book: sum("book"), difference: sum("difference") }, warnings };
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
