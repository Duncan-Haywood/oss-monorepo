import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, GRAMS_PER_OZT, GRAMS_PER_DWT, num, money, pct, normCdf, lines, lot, maxOffer, offerLadder, spotScenarios, risk, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const one = { ...DEFAULTS, i1Karat: 24, i1Weight: GRAMS_PER_OZT, i2Weight: 0, i3Weight: 0, i4Weight: 0, spot: 3000, weightLossPct: 0,
  payoutPct: 100, refineFee: 0, shipInsure: 0, handling: 0, offerPct: 80, daysToSettle: 0 };

test("one troy ounce of 24K melts at the spot price", () => {
  const r = lot(one);
  near(r.melt, 3000);
  near(r.paid, 2400);
  near(r.profit, 600);
  near(r.margin, 25);
});

test("karat sets the fine content and pennyweights convert to grams", () => {
  const ls = lines({ ...one, i1Karat: 14, i1Weight: 10, unit: GRAMS_PER_DWT });
  near(ls[0].grams, 15.5517384);
  near(ls[0].fineG, 15.5517384 * 14 / 24);
});

test("rows with no weight are skipped", () => {
  assert.equal(lines({ ...DEFAULTS, i1Weight: 0, i2Weight: 0, i3Weight: 0, i4Weight: 0 }).length, 0);
  assert.equal(lines(DEFAULTS).length, 3);
});

test("assay loss, payout share and fees reduce what the refiner sends", () => {
  const r = lot({ ...one, weightLossPct: 5, payoutPct: 96, refineFee: 30, shipInsure: 20 });
  near(r.refinerGross, 3000 * 0.95 * 0.96);
  near(r.refinerNet, 3000 * 0.95 * 0.96 - 50);
});

test("cost of capital is charged on money paid plus handling for the wait", () => {
  const r = lot({ ...one, handling: 100, capitalRatePct: 10, daysToSettle: 73 });
  near(r.carry, (2400 + 100) * 0.10 * 0.2);
  near(r.profit, 3000 - 2400 - 100 - r.carry);
});

test("max offer for zero margin makes profit zero, and a target margin is met exactly", () => {
  const o = { ...DEFAULTS };
  const be = maxOffer(o, 0);
  near(lot(o, be.pct).profit, 0, 1e-6);
  const t = maxOffer(o, 8);
  near(lot(o, t.pct).margin, 8, 1e-6);
  assert.ok(t.pct < be.pct);
});

test("max offer never goes below zero when fees swamp a tiny lot", () => {
  const o = { ...DEFAULTS, i1Weight: 1, i2Weight: 0, i3Weight: 0 };
  assert.equal(maxOffer(o, 8).dollars, 0);
});

test("ladder profit falls as the offer rises", () => {
  const rows = offerLadder(DEFAULTS);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].profit < rows[i - 1].profit);
});

test("an unhedged lot moves with the gold price; a hedged one does not", () => {
  const up = spotScenarios(DEFAULTS);
  assert.ok(up[5].profit > up[3].profit && up[0].profit < up[3].profit);
  const h = spotScenarios({ ...DEFAULTS, hedged: 1 });
  assert.equal(new Set(h.map((r) => r.profit.toFixed(6))).size, 1);
});

test("normal CDF matches known values", () => {
  near(normCdf(0), 0.5, 1e-6);
  near(normCdf(1.96), 0.975, 1e-3);
  near(normCdf(-1), 0.1587, 1e-3);
});

test("risk: break-even move is the price drop that wipes the profit", () => {
  const o = { ...DEFAULTS, daysToSettle: 30 };
  const rk = risk(o);
  const wiped = lot(o, o.offerPct, rk.breakEvenMove);
  near(wiped.profit, 0, 1e-6);
  assert.ok(rk.pLoss > 0 && rk.pLoss < 100);
  const lock = risk({ ...o, hedged: 1 });
  assert.equal(lock.swing, 0);
});

test("analyze fills defaults and returns a result", () => {
  const a = analyze({});
  assert.equal(a.warnings.filter((w) => /loses money/.test(w)).length, 0);
  assert.ok(a.result.base.melt > 0);
  assert.equal(a.ladder.length, 8);
  assert.equal(a.moves.length, 6);
});

test("analyze rejects bad input without a result", () => {
  assert.equal(analyze({ spot: 0 }).result, null);
  assert.equal(analyze({ i1Karat: 30 }).result, null);
  assert.equal(analyze({ payoutPct: 120 }).result, null);
  assert.equal(analyze({ i1Weight: 0, i2Weight: 0, i3Weight: 0 }).result, null);
});

test("analyze warns when the offer loses money", () => {
  const a = analyze({ offerPct: 99, payoutPct: 96 });
  assert.ok(a.warnings.some((w) => /loses money|more than the refiner pays/.test(w)));
});

test("formatters", () => {
  assert.equal(num("$1,234.5"), 1234.5);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(12.34), "12.3%");
});

test("csv has both tables", () => {
  const csv = toCsv(analyze({}));
  assert.match(csv, /offer_pct_of_melt/);
  assert.match(csv, /gold_price_move_pct/);
  assert.equal(toCsv(analyze({ spot: 0 })), "");
});
