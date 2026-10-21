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
// Disposal year takes half of that year's table amount (half-year convention).
// -> { s179, bonus, macrs, total } in cents
export function assetTaxYear(a, year) {
  const t = a.tax;
  if (!t) return { s179: 0, bonus: 0, macrs: 0, total: 0 };
  const y0 = +a.date.slice(0, 4);
  const n = year - y0;
  const out = { s179: n === 0 ? t.s179 : 0, bonus: 0, macrs: 0 };
  const afterSec = a.cents - t.s179;
  const bonus = Math.round((afterSec * t.bonusPct) / 100);
  if (n === 0) out.bonus = bonus;
  if (n >= 0) {
    const table = MACRS_HALF_YEAR[t.macrsClass];
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
    const t = assetTaxYear(a, year);
    const book = schedule(a, through).filter((r) => r.date.startsWith(String(year))).reduce((s, r) => s + r.cents, 0);
    rows.push({ id: a.id, name: a.name, placed: a.date, class: a.tax.macrsClass, cost: a.cents, ...t, book, difference: t.total - book });
  }
  // Mid-quarter test: if more than 40% of the year's depreciable basis (cost less
  // 179) of property placed in service in the year went into service in Q4, the
  // half-year tables do not apply. Flagged, not recomputed.
  const placed = (books.assets ?? []).filter((a) => a.tax && a.date.startsWith(String(year)));
  const basis = placed.reduce((s, a) => s + a.cents - a.tax.s179, 0);
  const q4 = placed.filter((a) => +a.date.slice(5, 7) >= 10).reduce((s, a) => s + a.cents - a.tax.s179, 0);
  if (basis > 0 && q4 * 100 > basis * 40) warnings.push(`${((q4 * 100) / basis).toFixed(0)}% of ${year}'s depreciable basis was placed in service in October to December. Over 40% triggers the mid-quarter convention, whose tables this worksheet does not have; the half-year figures here are wrong in that case.`);
  if (untreated.length) warnings.push(`No tax treatment set for ${untreated.join(", ")}; they are left out. Set one with "asset tax ID --class 5".`);
  if (rows.some((r) => r.s179)) warnings.push("Section 179 dollar limits, the investment phase-out and the taxable-income limit are not checked.");
  if (rows.some((r) => a_bonus(books, r.id))) warnings.push("Bonus depreciation is applied at the percent you entered; check the rate in force for the year placed in service.");
  warnings.push("Business-use share, listed property and the placed-in-service date's own rules are not modelled.");
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { year, rows, totals: { s179: sum("s179"), bonus: sum("bonus"), macrs: sum("macrs"), total: sum("total"), book: sum("book"), difference: sum("difference") }, warnings };
}
const a_bonus = (books, id) => (books.assets ?? []).find((a) => a.id === id)?.tax?.bonusPct > 0;
