import test from "node:test";
import assert from "node:assert/strict";
import { computeProceeds, summarize, money, pct } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("defaults: $9.99, 30% then 15%, 3% refunds, 8% churn", () => {
  const r = computeProceeds();
  close(r.keptBeforeFee, 9.99 * 0.97);
  close(r.netYear1, 9.99 * 0.97 * 0.7);
  close(r.netYear2, 9.99 * 0.97 * 0.85);
  assert.equal(money(r.ltv), "$86.35");
  assert.equal(r.payback, 5);
  assert.equal(money(r.maxCacTwelveMonthPayback), "$53.62");
});

test("lifetime value is the survival-weighted sum of nets, with the fee step at month 13", () => {
  const r = computeProceeds({ churnPct: 0, horizon: 24, refundPct: 0, storeFeePct: 30, storeFeeYear2Pct: 10, price: 10 });
  close(r.ltv, 12 * 7 + 12 * 9);
  assert.equal(r.expectedPaidMonths, 24);
});

test("tax included in the price comes off before the fee", () => {
  const r = computeProceeds({ price: 12, taxPct: 20, refundPct: 0, storeFeePct: 30 });
  close(r.exTax, 10);
  close(r.netYear1, 7);
});

test("web checkout nets price less percent and fixed fee, after refunds", () => {
  const r = computeProceeds({ price: 10, refundPct: 10, webFeePct: 3, webFixed: 0.5 });
  close(r.webNet, 9 - (0.3 + 0.5));
});

test("a high-churn app that never pays back says so", () => {
  const r = computeProceeds({ churnPct: 20, cac: 40 });
  assert.equal(r.payback, null);
  assert.ok(r.ltvToCac < 1);
  assert.equal(summarize(r).status, "warn");
  assert.match(summarize(r).text, /does not pay back/);
});

test("zero churn and zero cost do not divide by zero", () => {
  const r = computeProceeds({ churnPct: 0, cac: 0 });
  assert.equal(r.avgLifetimeMonths, null);
  assert.equal(r.ltvToCac, null);
  assert.equal(summarize(r).status, "ok");
});

test("scenarios mark exactly one current row", () => {
  const r = computeProceeds();
  assert.equal(r.churnScenarios.filter((s) => s.current).length, 1);
  assert.equal(r.feeScenarios.filter((s) => s.current).length, 1);
  assert.equal(computeProceeds({ storeFeePct: 15 }).feeScenarios.filter((s) => s.current).length, 1);
  assert.ok(computeProceeds({ storeFeePct: 20, storeFeeYear2Pct: 12 }).feeScenarios.some((s) => s.fee1 === 20 && s.current));
});

test("bad input is named, not silently zeroed", () => {
  assert.throws(() => computeProceeds({ storeFeePct: 100 }), /under 100/);
  assert.throws(() => computeProceeds({ churnPct: 120 }), /over 100/);
  assert.throws(() => computeProceeds({ price: "abc" }), /Price/);
  assert.throws(() => computeProceeds({ horizon: 0 }), /Horizon/);
  assert.throws(() => computeProceeds({ horizon: 500 }), /120 or less/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
