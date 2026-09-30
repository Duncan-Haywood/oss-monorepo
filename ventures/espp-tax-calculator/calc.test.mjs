import { test } from "node:test";
import assert from "node:assert/strict";
import { purchasePrice, dispose, qualifyingMonths, breakevenPrice, analyze, sampleInput, reportCsv, parseNum, money } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const LOT = (o = {}) => ({ shares: 250, price: 34, purchaseFmv: 52, offerFmv: 40, discount: 0.15, offerMonths: 6, rates: { ord: 0.35, ltcg: 0.188 }, otherGains: 0, ...o });

test("price paid uses the lower price with a lookback and the purchase price without", () => {
  near(purchasePrice({ offerFmv: 40, purchaseFmv: 52, discount: 0.15, lookback: true }), 34);
  near(purchasePrice({ offerFmv: 60, purchaseFmv: 52, discount: 0.15, lookback: true }), 44.2);
  near(purchasePrice({ offerFmv: 40, purchaseFmv: 52, discount: 0.15, lookback: false }), 44.2);
});

test("qualifying needs 12 months after purchase and 24 after the offering start", () => {
  assert.equal(qualifyingMonths(6), 18);
  assert.equal(qualifyingMonths(0), 24);
  assert.equal(qualifyingMonths(12), 12);
  assert.equal(dispose(LOT(), 60, 17).qualifying, false);
  assert.equal(dispose(LOT(), 60, 18).qualifying, true);
  assert.equal(dispose(LOT({ offerMonths: 12 }), 60, 11).qualifying, false);
});

test("disqualifying: the bargain element at purchase is wages, the rest is capital", () => {
  const d = dispose(LOT(), 52, 0);
  near(d.ordinary, 4500);
  near(d.capital, 0);
  near(d.tax, 4500 * 0.35);
  near(d.netProfit, 4500 - 1575);
  const later = dispose(LOT(), 60, 6);
  near(later.capital, 2000);
  near(later.capTax, 2000 * 0.35); // still short term at 6 months
  near(dispose(LOT(), 60, 12).capTax, 2000 * 0.188);
});

test("qualifying: ordinary income is the lesser of the gain and the offer-date discount", () => {
  const d = dispose(LOT(), 60, 18);
  near(d.ordinary, 6 * 250);
  near(d.capital, (60 - 40) * 250);
  near(d.tax, 1500 * 0.35 + 5000 * 0.188);
  const small = dispose(LOT(), 36, 18); // gain of 2 a share is under the 6 discount
  near(small.ordinary, 2 * 250);
  near(small.capital, 0);
});

test("qualifying sale below the price paid is a capital loss with no ordinary income", () => {
  const d = dispose(LOT(), 30, 18);
  near(d.ordinary, 0);
  near(d.capital, -4 * 250);
});

test("capital losses cancel other gains first, then deduct up to $3,000, then carry forward", () => {
  const disq = dispose(LOT({ otherGains: 0 }), 40, 0); // sold below the purchase-date price: loss of 12 a share
  near(disq.capital, -3000);
  near(disq.capTax, -3000 * 0.35);
  const withGains = dispose(LOT({ otherGains: 2000 }), 40, 0);
  near(withGains.capTax, -(2000 * 0.35 + 1000 * 0.35));
  const big = dispose(LOT({ shares: 1000, otherGains: 0 }), 40, 0);
  near(big.capital, -12000);
  near(big.capTax, -3000 * 0.35);
  near(big.carriedLoss, 9000);
});

test("breakeven price makes holding equal to selling now, and moves with the tax rate", () => {
  const lot = LOT();
  const now = dispose(lot, 52, 0).netProfit;
  const be = breakevenPrice(lot, now);
  near(dispose(lot, be, 18).netProfit, now, 0.01);
  assert.ok(be < 52 && be > 34);
  const rich = LOT({ rates: { ord: 0.5, ltcg: 0.25 } });
  const be2 = breakevenPrice(rich, dispose(rich, 52, 0).netProfit);
  near(dispose(rich, be2, 18).netProfit, dispose(rich, 52, 0).netProfit, 0.01);
});

test("analyze reproduces the worked example", () => {
  const a = analyze(sampleInput());
  near(a.price, 34);
  near(a.cash, 8500);
  near(a.sellNow.netProfit, 2925);
  near(a.holdQ.netProfit, 5035);
  near(a.taxPrize, 486);
  assert.equal(a.qm, 18);
  assert.ok(a.hold12 && !a.hold12.qualifying);
  assert.equal(a.sensitivity.length, 7);
  const flat = a.sensitivity.find((s) => s.shock === 0);
  near(flat.diff, dispose(a.lot, 52, 18).netProfit - a.sellNow.netProfit);
  assert.ok(a.sensitivity.every((s, i, arr) => i === 0 || s.diff >= arr[i - 1].diff));
});

test("the 1099-B basis warning appears and is sized", () => {
  const a = analyze(sampleInput());
  const f = a.findings.find((x) => /1099-B/.test(x.title));
  assert.ok(f);
  near(a.basisOverpay, 4500 * 0.35);
});

test("the $25,000 limit warning uses the offering-date price", () => {
  assert.ok(!analyze(sampleInput()).findings.some((f) => /25,000/.test(f.title)));
  assert.ok(analyze({ ...sampleInput(), shares: "1000" }).findings.some((f) => /25,000/.test(f.title)));
});

test("bad input is named, not guessed", () => {
  assert.match(analyze({ ...sampleInput(), offerFmv: "" }).error, /first day/);
  assert.match(analyze({ ...sampleInput(), discount: "20" }).error, /15/);
  assert.match(analyze({ ...sampleInput(), lookback: "" }).error, /lookback/);
  assert.match(analyze({ ...sampleInput(), shares: "0" }).error, /shares/);
  assert.match(analyze({ ...sampleInput(), offerMonths: "40" }).error, /months/);
  assert.match(analyze({ ...sampleInput(), ordRate: "90" }).error, /marginal/);
  assert.match(analyze({ ...sampleInput(), salePrice: "abc" }).error, /sell/);
  assert.ok(!analyze({ ...sampleInput(), salePrice: "" }).error);
});

test("CSV neutralises formula cells and lists the strategies", () => {
  const csv = reportCsv(analyze(sampleInput()));
  assert.match(csv, /Sell at purchase/);
  assert.match(csv, /Hold to qualifying date/);
  assert.doesNotMatch(csv, /^[=+@]/m);
});

test("parseNum and money", () => {
  assert.equal(parseNum("$1,234.5"), 1234.5);
  assert.equal(parseNum("18.8%"), 18.8);
  assert.ok(Number.isNaN(parseNum("x")));
  assert.equal(money(1234.6), "1,235");
});
