// Property test for the S-corporation comparison: seeded random profits, salaries, filing
// statuses and years (made up, no outside data). Invariants: the salary is clamped to
// [0, profit], K-1 + salary + employer FICA + unemployment + overhead = profit, FICA parts
// are equal halves, nothing is negative, savings = sole all-in less S-corp all-in, the sweep
// agrees with a direct call at the same salary, and the same inputs give the same answer.
import test from "node:test";
import assert from "node:assert/strict";
import { scorpCompare } from "./scorp.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("S-corp comparison holds its invariants on 400 random sole proprietors", () => {
  const r = rng(20261029), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 400; i++) {
    const year = r() < 0.5 ? 2025 : 2026, filing = ["single", "mfj", "hoh"][pick(0, 2)];
    const profit = pick(1_000_00, 600_000_00);
    const o = { year, filing, wageBase: year === 2025 ? 176_100_00 : 184_500_00, extraCost: pick(0, 3_000_00), service: r() < 0.3 };
    if (r() < 0.5) o.salary = pick(0, 700_000_00); else o.salaryPct = 0.3 + r() * 0.7;
    const x = scorpCompare(profit, o), tag = JSON.stringify({ profit, ...o }), s = x.scorp;
    assert.ok(s.salary >= 0 && s.salary <= profit, "salary clamped " + tag);
    assert.equal(s.k1 + s.salary + s.employerFica + s.futa + s.stateUnemployment + s.extraCost, profit, "profit splits exactly " + tag);
    assert.equal(s.employerFica, s.employeeFica, "equal FICA halves " + tag);
    for (const k of ["employerFica", "futa", "payrollTax", "incomeTax", "total"]) assert.ok(s[k] >= 0, k + " >= 0 " + tag);
    assert.ok(x.sole.total >= 0 && x.sole.selfEmploymentTax >= 0, "sole non-negative " + tag);
    assert.equal(x.savings, x.sole.allIn - s.allIn, "savings definition " + tag);
    assert.equal(s.allIn, s.total + s.extraCost, "all-in " + tag);
    const again = scorpCompare(profit, o);
    assert.deepEqual(again, x, "deterministic " + tag);
    for (const row of x.sweep) {
      const direct = scorpCompare(profit, { ...o, salary: row.salary });
      assert.equal(direct.scorp.allIn, row.allIn, `sweep ${row.salaryPct}% matches a direct call ` + tag);
    }
  }
});

test("a bigger overhead never raises the savings", () => {
  const r = rng(77), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 100; i++) {
    const profit = pick(20_000_00, 400_000_00), base = { year: 2026, wageBase: 184_500_00, salary: Math.round(profit / 2) };
    const lo = scorpCompare(profit, { ...base, extraCost: 500_00 }), hi = scorpCompare(profit, { ...base, extraCost: 2_500_00 });
    assert.ok(hi.savings <= lo.savings + 2, `overhead monotone at ${profit}`);
  }
});
