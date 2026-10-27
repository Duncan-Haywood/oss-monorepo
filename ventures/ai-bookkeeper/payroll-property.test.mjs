// Property test for payroll: seeded random per-employee registers (made up, no outside data).
// Invariants: the quarters' 941 wages add up to the year's gross, W-2 box 1 matches the
// register, box 3 never passes the wage base, the 940 FUTA wages never pass $7,000 per
// person, and the 941 to W-2 tie-out is clean when the provider's figures are consistent.
import test from "node:test";
import assert from "node:assert/strict";
import { addPayroll, form941, form940, w2Summary, reconcile941W2, SS_WAGE_BASE, FUTA_WAGE_BASE } from "./payroll.mjs";
import { newBooks } from "./engine.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const m = (c) => (c / 100).toFixed(2);
const HEAD = "Pay Date,Employee,Gross Pay,Federal Income Tax,Social Security,Medicare,State Income Tax,Other Deductions,Net Pay,Employer Social Security,Employer Medicare,FUTA,SUTA";

test("payroll registers hold their invariants on 150 random years", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 150; i++) {
    const year = pick(2023, 2026), base = SS_WAGE_BASE[year];
    const names = Array.from({ length: pick(1, 4) }, (_, k) => `Emp${k}`);
    const pay = names.map(() => pick(100000, r() < 0.3 ? 4000000 : 600000)); // cents per run
    const ytd = names.map(() => 0);
    const rows = [], gross = {};
    for (let p = 0; p < 24; p++) {
      const date = `${year}-${String(1 + Math.floor(p / 2)).padStart(2, "0")}-${p % 2 ? 26 : 12}`;
      names.forEach((n, k) => {
        const g = pay[k];
        const taxable = Math.max(0, Math.min(g, base - ytd[k]));
        ytd[k] += g;
        const ss = Math.round(taxable * 0.062), med = Math.round(g * 0.0145);
        const fed = pick(0, Math.floor(g * 0.2)), st = pick(0, Math.floor(g * 0.05)), oth = pick(0, 20000);
        const ftaxable = Math.max(0, Math.min(g, FUTA_WAGE_BASE - (ytd[k] - g)));
        const futa = Math.round(ftaxable * 0.006);
        rows.push([date, n, m(g), m(fed), m(ss), m(med), m(st), m(oth), m(g - fed - ss - med - st - oth), m(ss), m(med), m(futa), "0.00"].join(","));
        gross[n] = (gross[n] ?? 0) + g;
      });
    }
    const tag = JSON.stringify({ year, n: names.length, pay });
    const { books, problems } = addPayroll(newBooks(), HEAD + "\n" + rows.join("\n") + "\n");
    assert.deepEqual(problems, [], tag);
    const total = Object.values(gross).reduce((a, x) => a + x, 0);
    assert.equal([1, 2, 3, 4].reduce((a, q) => a + form941(books, year, q).wages, 0), total, "941 wages " + tag);
    const w2 = w2Summary(books, year);
    for (const e of w2.employees) {
      assert.equal(e.box1, gross[e.employee], "box 1 " + tag);
      assert.ok(e.box3 <= Math.min(e.box1, base), "box 3 " + tag);
    }
    const f = form940(books, year);
    assert.ok(f.futaWages <= names.length * FUTA_WAGE_BASE && f.futaWages <= total, "940 base " + tag);
    assert.deepEqual(f.warnings, [], "940 warnings " + tag);
    const rec = reconcile941W2(books, year);
    assert.deepEqual(rec.warnings.filter((x) => !/other deductions|Additional/i.test(x)), [], "tie-out " + tag);
  }
});
