import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, evaluate, search, yearSaving, allowed, cycle, baselineMask, num, money, toCsv } from "./calc.mjs";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const base = { other: 22000, standard: 32000, agi: 180000, cap: 2000, rate: 0.37 };

test("itemizing: gifts above the 0.5% floor stack on other deductions and only the excess over the standard deduction pays", () => {
  // 22,000 + (26,000 - 900) - 32,000 = 15,100 saved at 37%
  const y = yearSaving({ ...base, deposit: 26000, direct: 0 });
  near(y.saving, 15100 * 0.37);
  assert.equal(y.itemized, true);
});

test("not itemizing: direct cash up to the cap is deducted, DAF money is not", () => {
  near(yearSaving({ ...base, deposit: 0, direct: 8000 }).saving, 2000 * 0.37);
  near(yearSaving({ ...base, deposit: 8000, direct: 0 }).saving, 0);
  near(yearSaving({ ...base, deposit: 0, direct: 500 }).saving, 500 * 0.37);
});

test("the 60% of AGI ceiling caps the deduction", () => {
  const y = yearSaving({ ...base, other: 0, standard: 0, agi: 100000, deposit: 90000, direct: 0 });
  near(y.saving, (60000 - 500) * 0.37);
});

test("baseline schedule is the same direct gift every year", () => {
  const o = { ...DEFAULTS, years: 4, inflationPct: 0 };
  const e = evaluate(o, baselineMask(4));
  near(e.total, 4 * 0.37 * 2000);
  assert.equal(e.deposited, 0);
});

test("a bunch year deposits this year plus the DAF-funded part of each covered year", () => {
  const o = { ...DEFAULTS, years: 4, inflationPct: 0, dafGrowthPct: 0 };
  const e = evaluate(o, [true, false, false, false]);
  near(e.rows[0].deposit, 8000 + 3 * 6000);
  near(e.rows[1].direct, 2000);
  near(e.left, 0, 1e-6); // every dollar deposited is granted, nothing stranded
});

test("DAF growth is reported as money left for charity, not as tax saving", () => {
  const o = { ...DEFAULTS, years: 4, inflationPct: 0, dafGrowthPct: 5 };
  const flat = evaluate({ ...o, dafGrowthPct: 0 }, [true, false, false, false]);
  const grown = evaluate(o, [true, false, false, false]);
  near(grown.total, flat.total);
  assert.ok(grown.left > 0);
});

test("search is exact: no allowed schedule beats it (brute force, 9 years)", () => {
  const o = { ...DEFAULTS, years: 9, maxGap: 4 };
  const best = search(o);
  let top = -Infinity;
  for (let bits = 1; bits < 1 << 9; bits++) {
    const m = Array.from({ length: 9 }, (_, i) => Boolean((bits >> i) & 1));
    if (!allowed(m, 4)) continue;
    top = Math.max(top, evaluate(o, m).total);
  }
  near(best.total, top);
  assert.ok(allowed(best.mask, 4));
});

test("the optimum is never worse than any regular cycle or than giving directly", () => {
  for (const o of [DEFAULTS, { ...DEFAULTS, otherItemized: 5000 }, { ...DEFAULTS, ratePct: 10, agi: 60000, standardDeduction: 15000, otherItemized: 9000 }]) {
    const a = analyze(o);
    for (const s of a.schedules) assert.ok(a.best.total + 1e-6 >= s.total, s.label);
    assert.ok(a.best.total + 1e-6 >= a.base.total);
  }
});

test("a longer allowed gap never lowers the optimum", () => {
  const lo = search({ ...DEFAULTS, maxGap: 2 }).total;
  const hi = search({ ...DEFAULTS, maxGap: 5 }).total;
  assert.ok(hi + 1e-9 >= lo);
});

test("gap rule: bunch years must cover the whole horizon within the limit", () => {
  assert.equal(allowed([true, false, false, true], 3), true);
  assert.equal(allowed([true, false, false, false, true], 3), false);
  assert.equal(allowed([true, false, false, false, false], 3), false); // tail too long
  assert.equal(allowed([false, false], 3), false);
});

test("cycle helper marks every k-th year from the offset", () => {
  assert.deepEqual(cycle(7, 3, 1), [false, true, false, false, true, false, false]);
});

test("giving directly wins when no allowed schedule beats it", () => {
  const a = analyze({ ...DEFAULTS, otherItemized: 5000, ratePct: 10 });
  if (!a.bunching) assert.deepEqual(a.bunchYears, []);
  assert.ok(a.gain >= 0);
});

test("someone far above the standard deduction already is itemizing: bunching adds nothing to find", () => {
  const a = analyze({ ...DEFAULTS, otherItemized: 60000 });
  assert.ok(a.gain < 1e-6 || a.gain / a.base.total < 0.05, String(a.gain));
});

test("missing inputs are named, not guessed", () => {
  assert.ok(analyze({ ...DEFAULTS, annualGift: 0 }).warnings[0].match(/each year/));
  assert.ok(analyze({ ...DEFAULTS, agi: 0 }).warnings.some((w) => /adjusted gross income/.test(w)));
  assert.ok(analyze({ ...DEFAULTS, standardDeduction: 0 }).warnings.some((w) => /standard deduction/.test(w)));
});

test("appreciated-stock funding shows the capital gains avoided on deposits only", () => {
  const a = analyze({ ...DEFAULTS, stockSharePct: 100, stockGainSharePct: 50, ltRatePct: 20 });
  near(a.stockSaving, a.best.deposited * 0.5 * 0.2);
  assert.equal(analyze(DEFAULTS).stockSaving, 0);
});

test("a deposit over 60% of AGI is flagged", () => {
  const a = analyze({ ...DEFAULTS, annualGift: 40000, agi: 100000, maxGap: 4 });
  assert.ok(a.warnings.some((w) => /60%/.test(w)));
});

test("formatting and csv", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(num("$1,200"), 1200);
  const csv = toCsv(analyze(DEFAULTS));
  assert.equal(csv.trim().split("\n").length, 1 + DEFAULTS.years);
});
