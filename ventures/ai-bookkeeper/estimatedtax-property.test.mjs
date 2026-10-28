// Property test for the federal estimate and payment plan: seeded random incomes and options (made up, no outside data).
// Invariants: bracket tax never falls as income rises and never rises faster than the top rate, the total is
// income tax plus SE tax plus Additional Medicare, the plan never pays a negative amount and sums to what is
// required less what is paid (or zero when exempt), and the balance with the return is never negative.
import test from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { bracketTax, estimatedTax, BRACKETS } from "./estimatedtax.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const books = (income, yr) => {
  const { books: b } = importStatement(newBooks(), `Date,Description,Amount\n${yr}-03-01,CLIENT PAYMENT ACME,${income}\n`, "1000");
  return confirm(b, { [b.transactions[0].id]: "4000" });
};

test("bracket tax is monotone and its slope never exceeds the top rate", () => {
  const r = rng(20261027);
  for (const year of [2025, 2026]) for (const [filing, t] of Object.entries(BRACKETS[year])) {
    for (let i = 0; i < 300; i++) {
      const a = Math.floor(r() * 80_000_000), d = Math.floor(r() * 5_000_000);
      const lo = bracketTax(a, t.b), hi = bracketTax(a + d, t.b);
      assert.ok(hi >= lo, `monotone ${year} ${filing} ${a}`);
      assert.ok(hi - lo <= Math.ceil(d * 0.37) + 1, `slope ${year} ${filing} ${a} +${d}`);
    }
    assert.equal(bracketTax(0, t.b), 0);
  }
});

test("estimate and plan hold their invariants on 400 random sole proprietors", () => {
  const r = rng(77), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const dates = ["2026-01-10", "2026-04-20", "2026-06-20", "2026-09-20", "2027-01-05"];
  for (let i = 0; i < 400; i++) {
    const income = pick(0, 600_000), filing = ["single", "mfj", "hoh"][pick(0, 2)];
    const o = { year: 2026, filing, wageBase: 18450000, monthsElapsed: pick(1, 12), wages: r() < 0.4 ? pick(0, 300_000) * 100 : 0,
      withholding: r() < 0.4 ? pick(0, 50_000) * 100 : 0, paid: r() < 0.3 ? pick(0, 20_000) * 100 : 0,
      priorYearTax: r() < 0.5 ? pick(0, 120_000) * 100 : undefined, priorAgi: pick(0, 400_000) * 100,
      asOf: r() < 0.7 ? dates[pick(0, 4)] : undefined };
    const tag = JSON.stringify({ income, ...o });
    const e = estimatedTax(books(income.toFixed(2), 2026), o);
    assert.equal(e.totalTax, e.incomeTax + e.se.tax + e.addlMedicare, "total " + tag);
    assert.ok(e.incomeTax >= 0 && e.se.tax >= 0 && e.taxable >= 0 && e.qbiDeduction >= 0, "non-negative " + tag);
    assert.ok(e.payments.every((p) => p.cents >= 0), "payments non-negative " + tag);
    const sum = e.payments.reduce((s, p) => s + p.cents, 0);
    const remaining = e.safeHarbor.exempt ? 0 : Math.max(0, e.safeHarbor.required - o.paid);
    const anyDue = e.payments.some((p) => p.status === "due");
    assert.equal(sum, anyDue ? remaining : 0, "plan sums to what is still required " + tag);
    assert.ok(e.balanceWithReturn >= 0, "balance " + tag);
    assert.ok(e.safeHarbor.required >= 0, "required " + tag);
    if (e.safeHarbor.prior != null) assert.ok(e.safeHarbor.required <= e.safeHarbor.prior, "never above the prior-year figure " + tag);
    assert.ok(e.safeHarbor.required <= e.safeHarbor.current90, "never above 90% of this year " + tag);
  }
});

test("more profit never lowers the total tax", () => {
  const r = rng(5);
  for (let i = 0; i < 150; i++) {
    const a = Math.floor(r() * 400_000), b = a + Math.floor(r() * 50_000), filing = ["single", "mfj", "hoh"][Math.floor(r() * 3)];
    const o = { year: 2026, filing, wageBase: 18450000, wages: Math.floor(r() * 2) * Math.floor(r() * 250_000) * 100 };
    const lo = estimatedTax(books(a.toFixed(2), 2026), o).totalTax, hi = estimatedTax(books(b.toFixed(2), 2026), o).totalTax;
    assert.ok(hi >= lo, `${filing} ${a} -> ${b}: ${lo} then ${hi}`);
  }
});

test("built-in earned income credit: rises to the maximum, then never rises, and ends within the schedule", () => {
  const eic = (year, kids, filing, wages) => estimatedTax(books("1.00", year), { year, wages: wages * 100, withholding: 0, eitcChildren: kids, filing, qbi: false }).eitcCredit;
  const max = { 2025: [649, 4328, 7152, 8046], 2026: [664, 4427, 7316, 8231] };
  for (const year of [2025, 2026]) for (const filing of ["single", "mfj"]) for (let kids = 0; kids <= 3; kids++) {
    let prev = 0, peaked = false, ended = false;
    for (let w = 0; w <= 80_000; w += 250) {
      const c = eic(year, kids, filing, w);
      assert.ok(c >= 0 && c <= max[year][kids] * 100 + 100, `${year} ${filing} ${kids}: ${c} at ${w}`);
      if (c < prev) peaked = true;
      if (peaked) assert.ok(c <= prev, `${year} ${filing} ${kids} rises again at ${w}`);
      if (peaked && c === 0) ended = true;
      if (ended) assert.equal(c, 0);
      prev = c;
    }
    assert.ok(ended, `${year} ${filing} ${kids}: credit never ends by $80,000`);
  }
});
