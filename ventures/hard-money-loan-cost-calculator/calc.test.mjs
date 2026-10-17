import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, lenderCost, deal, crossover, sensitivity, num, money, toCsv } from "./calc.mjs";

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("interest accrues on the purchase advance for the whole hold and on each draw only after it is released", () => {
  const o = { ...DEFAULTS, aDraws: 3, aMinMonths: 0 };
  const c = lenderCost(o, "a");
  // purchase 170000 for 6 months; rehab 60000 in 3 draws of 20000 released at months 1, 2, 3 (rehabMonths 3)
  const balanceMonths = 170000 * 6 + 20000 * (5 + 4 + 3);
  close(c.interest, balanceMonths * 0.115 / 12);
});

test("points apply to the whole commitment, draw fees per draw, and totals add up", () => {
  const c = lenderCost(DEFAULTS, "a");
  close(c.commitment, 230000);
  close(c.pointsCost, 4600);
  close(c.drawFees, 450);
  close(c.total, c.interest + 4600 + 1500 + 450);
});

test("a minimum-interest floor raises interest on a short hold and not on a long one", () => {
  const short = lenderCost(DEFAULTS, "b", 3);
  assert.ok(short.floorApplied);
  close(short.interest, 234000 * 0.095 / 12 * 6);
  assert.equal(lenderCost(DEFAULTS, "b", 10).floorApplied, false);
});

test("extension fees start only once the hold passes the term, one per extension block", () => {
  assert.equal(lenderCost(DEFAULTS, "a", 9).extensions, 0);
  assert.equal(lenderCost(DEFAULTS, "a", 10).extensions, 1);
  assert.equal(lenderCost(DEFAULTS, "a", 12).extensions, 1);
  assert.equal(lenderCost(DEFAULTS, "a", 13).extensions, 2);
  close(lenderCost(DEFAULTS, "a", 13).extensionFees, 2 * 230000 * 0.01);
});

test("effective APR is above the quoted rate when points and fees are counted", () => {
  const c = lenderCost(DEFAULTS, "a");
  assert.ok(c.effectiveApr > DEFAULTS.aRate);
  close(c.effectiveApr, c.total / c.avgBalance / 0.5 * 100);
});

test("profit is sale net of selling costs minus purchase, rehab, holding and finance cost", () => {
  const d = deal(DEFAULTS, "a");
  close(d.profit, 340000 * 0.93 - 200000 - 60000 - 6600 - d.total);
  close(d.cash, 30000 + 0 + 4600 + 1500);
  close(d.roi, d.profit / d.cash * 100);
});

test("unfunded rehab and purchase gap count as cash in", () => {
  const o = { ...DEFAULTS, aRehabPct: 50 };
  close(lenderCost(o, "a").cashIn, 30000 + 30000 + 4600 * (200000 * 0.85 + 30000) / 230000 + 1500);
});

test("the lender that is cheaper flips at a computable hold length", () => {
  const x = crossover(DEFAULTS);
  assert.deepEqual(x, { month: 11, cheaperAfter: "B" });
  assert.ok(lenderCost(DEFAULTS, "a", 10).total < lenderCost(DEFAULTS, "b", 10).total);
  assert.ok(lenderCost(DEFAULTS, "a", 11).total > lenderCost(DEFAULTS, "b", 11).total);
});

test("identical lenders never cross over", () => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (k.startsWith("b")) o[k] = DEFAULTS["a" + k.slice(1)];
  assert.equal(crossover(o), null);
});

test("analyze names the better lender and warns on hold past term and high loan to value", () => {
  const a = analyze({ holdMonths: 14, arv: 280000 });
  assert.ok(a.warnings.some((w) => /extension fees/.test(w)));
  assert.ok(a.warnings.some((w) => /after-repair value/.test(w)));
  assert.ok(["A", "B"].includes(a.result.better));
});

test("analyze refuses impossible input instead of printing a number", () => {
  const a = analyze({ aAdvancePct: 120 });
  assert.equal(a.result, null);
  assert.ok(a.warnings.length);
  assert.equal(analyze({ purchase: 0 }).result, null);
});

test("sensitivity rows and csv carry both lenders", () => {
  const rows = sensitivity(DEFAULTS);
  assert.equal(rows[0].months, 3);
  const csv = toCsv(analyze({}));
  assert.match(csv, /^months,lender_a_finance_cost/);
  assert.equal(csv.trim().split("\n").length, rows.length + 1);
});

test("num and money parse and format", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
});

test("an absurd draw count is capped so the calculation still finishes", () => {
  const r = analyze({ ...DEFAULTS, aDraws: 1e12 });
  assert.ok(Number.isFinite(r.a?.total ?? 0));
});
