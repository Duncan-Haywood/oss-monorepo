import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, perAcre, shareBeatsCashYield, negotiationRange, sensitivity, riskSummary, analyze } from "./calc.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("hand-worked defaults: 200 bu x $4.50 = $900 revenue, $630 costs", () => {
  const r = perAcre(200, 4.5, DEFAULTS);
  close(r.revenue, 900);
  close(r.allCosts, 630);
  // cash: landlord $250, operator 900 - 630 - 250 = 20
  close(r.cash.landlord, 250);
  close(r.cash.operator, 20);
  // share 50/50, landlord pays 50% of $380 shared inputs: landlord 450 - 190 = 260, operator 450 - 190 - 250 = 10
  close(r.share.landlord, 260);
  close(r.share.operator, 10);
  // flex: 200 + 30% x (900 - 800) = 230
  close(r.flex.landlord, 230);
  close(r.flex.operator, 900 - 630 - 230);
});

test("every lease splits the same pie: landlord + operator = revenue - all costs", () => {
  for (const [y, p] of [[120, 3.2], [200, 4.5], [260, 6]]) {
    const r = perAcre(y, p, DEFAULTS);
    for (const k of ["cash", "share", "flex"]) close(r[k].landlord + r[k].operator, r.revenue - r.allCosts);
  }
});

test("break-even yield: share beats cash above (250 + 190) / (0.5 x 4.5) = 195.56 bu", () => {
  const y = shareBeatsCashYield(DEFAULTS);
  close(y, 440 / 2.25);
  close(perAcre(y, DEFAULTS.price, DEFAULTS).share.landlord, DEFAULTS.cashRent);
  assert.ok(perAcre(y + 5, DEFAULTS.price, DEFAULTS).share.landlord > DEFAULTS.cashRent);
  assert.ok(perAcre(y - 5, DEFAULTS.price, DEFAULTS).share.landlord < DEFAULTS.cashRent);
  assert.equal(shareBeatsCashYield({ ...DEFAULTS, cropSharePct: 0 }), null);
});

test("negotiation range: operator ceiling 900 - 630 - 30 = 240 vs landlord share equivalent 260", () => {
  const n = negotiationRange(DEFAULTS);
  close(n.operatorCeiling, 240);
  close(n.landlordFloor, 260);
  close(n.gap, -20);
  assert.equal(n.overlaps, false);
  assert.equal(negotiationRange({ ...DEFAULTS, targetOperatorProfit: 0 }).overlaps, true);
});

test("a crop share moves with the crop; cash rent does not", () => {
  const risk = riskSummary(DEFAULTS);
  assert.equal(risk.cash.landlordSpread, 0);
  assert.ok(risk.share.landlordSpread > 0);
  assert.ok(risk.cash.operatorSpread > risk.share.operatorSpread, "operator carries all the risk on cash rent");
  assert.ok(risk.share.landlordWorst < risk.cash.landlordWorst);
});

test("sensitivity grid has 15 cells with correct corner values", () => {
  const g = sensitivity(DEFAULTS);
  assert.equal(g.length, 15);
  const low = g.find((c) => c.yieldFactor === 0.7 && c.priceFactor === 0.8);
  close(low.revenue, 140 * 3.6);
  // landlord share = 0.5 x 504 - 190 = 62
  close(low.share.landlord, 62);
  assert.equal(low.bestLandlord, "cash");
  const high = g.find((c) => c.yieldFactor === 1.3 && c.priceFactor === 1.2);
  assert.equal(high.bestLandlord, "share");
});

test("negative profits are kept, not clamped", () => {
  const r = perAcre(100, 3, DEFAULTS);
  assert.ok(r.cash.operator < 0);
  assert.ok(r.share.landlord < 0);
});

test("flex rent pays no bonus below the revenue threshold", () => {
  close(perAcre(150, 4.5, DEFAULTS).flex.landlord, DEFAULTS.flexBase);
});

test("field totals scale per-acre numbers by acres", () => {
  const a = analyze(DEFAULTS);
  close(a.field.cash.landlord, 250 * 160);
  close(a.field.share.operator, 10 * 160);
});

test("garbage input degrades to zeros rather than NaN", () => {
  const r = perAcre(NaN, undefined, { ...DEFAULTS, cashRent: "x" });
  assert.ok(Number.isFinite(r.cash.operator) && Number.isFinite(r.share.landlord));
  assert.ok(Number.isNaN(num("")) && num("$1,200") === 1200);
  assert.equal(money(-1234.4), "-$1,234");
});
