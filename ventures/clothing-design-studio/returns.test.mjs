import test from "node:test";
import assert from "node:assert/strict";
import { returnsPlan } from "./returns.mjs";

// price 50, landed 15, ship out 5, fee 3% + 0.30 => fees 1.80. No returns: 50 - 15 - 1.80 - 5 = 28.20.
const base = { price: 50, landed: 15, shipOut: 5, feePct: 3, feeFixed: 0.3, returnPct: 0, resaleablePct: 100, salvagePct: 0 };

test("no returns: 28.20 per order", () => {
  const r = returnsPlan(base);
  assert.equal(r.perOrder.profit, 28.2);
  assert.equal(r.lostToReturnsPerOrder, 0);
});

test("20% refunded, all resellable, label 6 + handling 2: lose 10 sale + 8*0.2 ... computed by hand", () => {
  // sold 0.8: revenue 40, cogs 12, fees 1.8, out 5, back (6+2)*0.2 = 1.6 => 40-12-1.8-5-1.6 = 19.6
  const r = returnsPlan({ ...base, returnPct: 20, returnLabel: 6, handling: 2 });
  assert.equal(r.perOrder.profit, 19.6);
  assert.equal(r.lostToReturnsPerOrder, 8.6);
  assert.equal(r.total.profit, 1960);
});

test("unsellable returns are written off at landed cost less salvage", () => {
  // 20% returns, none resellable, salvage 40%: write-off 15*0.6*0.2 = 1.8; profit = 40-12-1.8-1.8-5 = 19.4
  const r = returnsPlan({ ...base, returnPct: 20, resaleablePct: 0, salvagePct: 40 });
  assert.equal(r.perOrder.writeOff, 1.8);
  assert.equal(r.perOrder.profit, 19.4);
});

test("exchanges keep the sale but cost a second parcel", () => {
  // 20% return, half swapped: exchanged 0.1, sold 0.9: 45 - 13.5 - 1.8 - 5*1.1 = 24.2
  const r = returnsPlan({ ...base, returnPct: 20, exchangePct: 50 });
  assert.equal(r.perOrder.profit, 24.2);
});

test("break-even return rate: profit crosses zero exactly there", () => {
  const o = { ...base, returnPct: 10, returnLabel: 6, handling: 2 };
  const r = returnsPlan(o);
  const be = r.breakEvenReturnPct;
  assert.ok(be > 50 && be < 100);
  assert.ok(Math.abs(returnsPlan({ ...o, returnPct: be }).perOrder.profit) < 0.3); // rounding of be to 0.1 point
});

test("price for a target profit hits the target", () => {
  const o = { ...base, returnPct: 25, returnLabel: 6, handling: 2, targetProfit: 20 };
  const r = returnsPlan(o);
  assert.ok(Math.abs(returnsPlan({ ...o, price: r.priceForTarget }).perOrder.profit - 20) < 0.05);
});

test("one point fewer returns is worth the slope", () => {
  const r = returnsPlan({ ...base, returnPct: 20, returnLabel: 6, handling: 2 });
  assert.equal(r.valueOfOnePointFewer, 0.43); // (28.2-19.6)/20 = 0.43
});

test("bad input returns an error, not a crash", () => {
  assert.ok(returnsPlan(null).error);
  assert.match(returnsPlan({ ...base, returnPct: 120 }).error, /Return rate/);
  assert.match(returnsPlan({ ...base, price: "x" }).error, /Price/);
});
