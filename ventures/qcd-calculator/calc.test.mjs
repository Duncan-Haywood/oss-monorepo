import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, FIGURES, bracketTax, taxableSocialSecurity, scenario, analyze, num, toCsv } from "./calc.mjs";

test("bracket tax is progressive and exact at a boundary", () => {
  assert.equal(bracketTax(0, "single"), 0);
  assert.ok(Math.abs(bracketTax(12400, "single") - 1240) < 1e-9);
  assert.ok(Math.abs(bracketTax(50400, "single") - (1240 + 38000 * 0.12)) < 1e-9);
});

test("taxable Social Security follows the 0 / 50% / 85% tiers", () => {
  assert.equal(taxableSocialSecurity(5000, 20000, "single"), 0); // provisional 15k
  assert.equal(taxableSocialSecurity(20000, 20000, "single"), 2500); // provisional 30k: half of 5k over 25k
  assert.equal(taxableSocialSecurity(100000, 20000, "single"), 17000); // capped at 85%
  assert.equal(taxableSocialSecurity(100000, 0, "single"), 0);
});

test("a QCD removes the gift from AGI and cash does not", () => {
  const o = { ...DEFAULTS };
  const cash = scenario(o, "cash"), qcd = scenario(o, "qcd"), none = scenario(o, "none");
  assert.equal(none.agi, cash.agi);
  assert.ok(qcd.agi < cash.agi);
  assert.equal(qcd.qcd, 10000);
});

test("the QCD cannot exceed the IRA distribution or the annual limit; the excess is treated as cash", () => {
  const big = scenario({ ...DEFAULTS, giving: 150000, iraDistribution: 200000 }, "qcd");
  assert.equal(big.qcd, FIGURES.qcdLimit);
  assert.equal(big.cash, 150000 - FIGURES.qcdLimit);
  const small = scenario({ ...DEFAULTS, giving: 50000, iraDistribution: 40000 }, "qcd");
  assert.equal(small.qcd, 40000);
});

test("a QCD never costs more tax than the same cash gift", () => {
  for (const giving of [0, 1000, 5000, 20000, 60000]) {
    for (const filingStatus of ["single", "mfj"]) {
      const a = analyze({ filingStatus, numOver65: filingStatus === "mfj" ? 2 : 1, giving, iraDistribution: 70000 });
      assert.ok(a.advantage >= -1e-6, `${filingStatus} ${giving}`);
    }
  }
});

test("an itemizer deducts a cash gift above the 0.5% AGI floor", () => {
  const o = { ...DEFAULTS, itemizedOther: 40000, giving: 10000 };
  const cash = scenario(o, "cash");
  assert.equal(cash.itemizes, true);
  assert.ok(Math.abs(cash.deduction - (40000 + 10000 - 0.005 * cash.agi)) < 1e-6);
});

test("a non-itemizer gets only the capped cash-gift deduction", () => {
  const cash = scenario({ ...DEFAULTS, itemizedOther: 0, giving: 10000 }, "cash");
  assert.equal(cash.itemizes, false);
  assert.equal(cash.deduction, FIGURES.standard.single + FIGURES.extra65.single + FIGURES.nonItemizerCap.single);
});

test("zero gift gives zero advantage and zero cost", () => {
  const a = analyze({ giving: 0 });
  assert.equal(a.advantage, 0);
  assert.equal(a.costQcd, 0);
});

test("cost of giving is the gift less the tax saved", () => {
  const a = analyze({});
  assert.ok(Math.abs(a.costQcd - (a.opts.giving - (a.none.total - a.qcd.total))) < 1e-9);
  assert.ok(a.costQcd < a.costCash);
});

test("RMD left after the QCD", () => {
  assert.equal(analyze({ rmd: 40000, giving: 10000 }).rmdLeft, 30000);
  assert.equal(analyze({ rmd: 5000, giving: 10000 }).rmdLeft, 0);
});

test("warnings: age, oversize gift, bad input", () => {
  assert.ok(analyze({ age: 65 }).warnings.some((w) => /70 1\/2/.test(w)));
  assert.ok(analyze({ giving: 90000, iraDistribution: 1000 }).warnings.some((w) => /larger than the IRA/.test(w)));
  const bad = analyze({ giving: NaN });
  assert.equal(bad.result, null);
});

test("num parses money text and the CSV has a header", () => {
  assert.equal(num("$1,234"), 1234);
  assert.ok(Number.isNaN(num("")));
  assert.match(toCsv(analyze({})), /^line,usd\n/);
});
