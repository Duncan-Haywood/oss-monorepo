import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money2, perMadePiece, costPerSellable, channel, priceForMargin, monthly, lossSensitivity, loadSensitivity, electricitySensitivity } from "./calc.mjs";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const O = { ...DEFAULTS };

test("num parses money-ish text and rejects junk", () => {
  assert.equal(num("$1,200"), 1200);
  assert.ok(Number.isNaN(num("abc")));
  assert.equal(money2(-3.456), "-$3.46");
});

test("per made piece: clay, glaze, shared firings, labour, studio", () => {
  const m = perMadePiece(O);
  near(m.clay, 1.8);
  near(m.glaze, 0.8);
  near(m.bisque, (60 * 0.16 + 12) / 40);
  near(m.glazeFire, (85 * 0.16 + 12) / 30);
  near(m.labour, (53 / 60) * 25);
  near(m.studio, 350 / 120);
});

test("losses raise the cost of a sellable piece by 1/(1-loss)", () => {
  const base = costPerSellable({ ...O, lossPct: 0 });
  const lossy = costPerSellable({ ...O, lossPct: 20 });
  near(lossy.total, base.total / 0.8);
  near(lossy.hoursPerSellable, base.hoursPerSellable / 0.8);
});

test("retail nets price less fee; wholesale is a share of retail with no fee", () => {
  const r = channel(O, "retail");
  near(r.net, 38 * 0.9);
  const w = channel(O, "wholesale");
  near(w.price, 19);
  near(w.net, 19);
  assert.ok(w.profit < r.profit);
});

test("price for target margin actually produces that margin", () => {
  const p = priceForMargin(O);
  const r = channel({ ...O, retailPrice: p.retail }, "retail");
  near(r.marginPct, O.targetMarginPct, 1e-6);
  const be = channel({ ...O, retailPrice: p.breakEvenRetail }, "retail");
  near(be.profit, 0, 1e-9);
});

test("impossible margin + fee returns null, not a negative price", () => {
  assert.equal(priceForMargin({ ...O, targetMarginPct: 60, feePct: 40 }).retail, null);
});

test("monthly profit equals sellable pieces times profit per sellable piece", () => {
  const m = monthly(O);
  near(m.sellable, 108);
  near(m.profit, 108 * channel(O, "retail").profit, 1e-6);
});

test("sensitivities move the right way", () => {
  const loss = lossSensitivity(O);
  assert.ok(loss[0].profit > loss[4].profit);
  const load = loadSensitivity(O);
  assert.ok(load[0].kilnPerPiece > load[4].kilnPerPiece);
  const el = electricitySensitivity(O);
  assert.ok(el[3].cost > el[0].cost);
});

test("zero and hostile inputs do not produce NaN or Infinity", () => {
  const z = { ...O, piecesPerBisque: 0, piecesPerGlaze: 0, piecesPerMonth: 0, lossPct: 100, retailPrice: 0 };
  const c = costPerSellable(z);
  assert.ok(Number.isFinite(c.total));
  const r = channel(z, "retail");
  assert.equal(r.marginPct, null);
});
