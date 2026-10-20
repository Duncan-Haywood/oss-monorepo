import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, payment, simulate, analyze, breakEvenReturn, toCsv, num, money } from "./calc.mjs";

const near = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test("payment matches the textbook figure", () => {
  near(payment(300000, 0.06 / 12, 360), 1798.65, 0.01);
  near(payment(12000, 0, 12), 1000, 1e-9);
  assert.equal(payment(0, 0.005, 12), 0);
});

test("money and num parse what people paste", () => {
  assert.equal(num("$1,250.50"), 1250.5);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("when the investment return equals the mortgage rate and nothing is taxed, every path ends level", () => {
  const o = { ...DEFAULTS, returnPct: 6.5, gainsTaxPct: 0, interestTaxSavingPct: 0, recastFee: 0 };
  const a = simulate(o, "invest").final, b = simulate(o, "prepay").final, c = simulate(o, "recast").final;
  near(a, b, 0.5);
  near(a, c, 0.5);
});

test("a recast fee costs exactly its future value", () => {
  const o = { ...DEFAULTS, returnPct: 6.5, gainsTaxPct: 0, recastFee: 1000 };
  const a = simulate(o, "invest").final, c = simulate(o, "recast").final;
  near(a - c, 1000 * Math.pow(1 + 0.065 / 12, 27 * 12), 1);
});

test("break-even equals the mortgage rate without taxes and exceeds it with tax on gains", () => {
  near(breakEvenReturn({ ...DEFAULTS, gainsTaxPct: 0 }), 6.5, 0.01);
  assert.ok(breakEvenReturn({ ...DEFAULTS, gainsTaxPct: 15 }) > 6.5 + 0.3);
});

test("a higher return never makes paying down the loan relatively better", () => {
  let prev = -Infinity;
  for (let r = 0; r <= 14; r += 1) {
    const p = { ...DEFAULTS, returnPct: r };
    const d = simulate(p, "invest").final - simulate(p, "prepay").final;
    assert.ok(d >= prev - 1e-6);
    prev = d;
  }
});

test("prepaying shortens the loan and the months saved match a direct amortisation", () => {
  const o = { ...DEFAULTS, lump: 0, extraMonthly: 500 };
  const a = analyze(o);
  const i = o.ratePct / 1200;
  const P = payment(o.balance, i, o.yearsLeft * 12);
  let bal = o.balance, m = 0;
  while (bal > 0.005) { bal = bal * (1 + i) - (P + 500); m++; }
  assert.equal(a.rows[1].payoffMonths, m);
  assert.equal(a.monthsSaved, o.yearsLeft * 12 - m);
  assert.ok(a.interestSavedByPrepay > 0);
});

test("a recast lowers the payment and leaves the term alone", () => {
  const a = analyze({ ...DEFAULTS, extraMonthly: 0 });
  assert.ok(a.rows[2].payment < a.originalPayment);
  assert.equal(a.rows[2].payoffMonths, 27 * 12);
});

test("no extra and no lump makes all three paths identical", () => {
  const a = analyze({ ...DEFAULTS, extraMonthly: 0, lump: 0, recastFee: 0 });
  near(a.rows[0].final, a.rows[1].final, 0.01);
  near(a.rows[0].final, a.rows[2].final, 0.01);
  assert.ok(a.warnings.some((w) => /nothing to compare/.test(w)));
});

test("with a high return investing wins, with a low one prepaying wins", () => {
  assert.equal(analyze({ ...DEFAULTS, returnPct: 11 }).best.key, "invest");
  assert.equal(analyze({ ...DEFAULTS, returnPct: 3 }).best.key, "prepay");
});

test("zero-rate loans and lump sums above the balance do not break", () => {
  const z = analyze({ ...DEFAULTS, ratePct: 0 });
  assert.ok(Number.isFinite(z.rows[0].final));
  const big = analyze({ ...DEFAULTS, lump: 500000 });
  assert.ok(big.warnings.some((w) => /larger than the loan balance/.test(w)));
  assert.equal(big.rows[1].payoffMonths, 0);
});

test("bad inputs return warnings, not NaN", () => {
  assert.ok(analyze({ ...DEFAULTS, balance: 0 }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, gainsTaxPct: 150 }).warnings.length);
  assert.ok(analyze({ ...DEFAULTS, yearsLeft: 0 }).warnings.length);
});

test("interest tax saving moves money toward the investing paths only when set", () => {
  const a = analyze({ ...DEFAULTS, interestTaxSavingPct: 0 });
  const b = analyze({ ...DEFAULTS, interestTaxSavingPct: 24 });
  assert.ok(b.rows[0].final > a.rows[0].final);
  assert.ok(b.warnings.some((w) => /itemise/.test(w)));
});

test("csv has a header, one row per year, and numeric cells", () => {
  const lines = toCsv(analyze(DEFAULTS)).split("\n");
  assert.equal(lines.length, 1 + 27 + 1);
  assert.match(lines[1], /^0,/);
  for (const c of lines[5].split(",")) assert.ok(Number.isFinite(Number(c)));
});

test("an absurd years-left figure is refused instead of exhausting memory", () => {
  const r = analyze({ ...DEFAULTS, yearsLeft: 1e12 });
  assert.equal(r.rows.length, 0);
  assert.ok(r.warnings.some((w) => /100 years or less/.test(w)));
});
