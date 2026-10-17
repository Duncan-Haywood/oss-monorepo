import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, jobCost, unitPrice, breakEvenQty, validate, sampleInput, toCsv, usd } from "./calc.mjs";

const base = { qty: 100, colors: 1, locations: 1, garmentCost: 4, spoilPct: 0, screenCost: 15, setupMinPerScreen: 12, jobSetupMin: 18,
  impressionsPerHour: 200, laborRate: 30, overheadRate: 10, inkPerImpression: 0.05, marginPct: 40, screenFeeCharged: 0, yourPrice: 0 };

test("hand-computed one-colour job: $460 cost, $7.67 a piece at 40% margin", () => {
  const v = validate(base);
  const c = jobCost(v, 100);
  assert.equal(c.hours, 1);
  assert.equal(c.parts.garments, 400);
  assert.equal(c.parts.screens, 15);
  assert.equal(c.parts.ink, 5);
  assert.equal(c.parts.labor, 30);
  assert.equal(c.parts.overhead, 10);
  assert.equal(c.total, 460);
  const u = unitPrice(v, 100);
  assert.ok(Math.abs(u.unit - 7.666667) < 1e-5);
  assert.equal(plan(base).unit, 7.67);
});

test("spoilage buys and prints extra garments: 100 at 5% means 106 pieces", () => {
  const c = jobCost(validate({ ...base, spoilPct: 5 }), 100);
  assert.equal(c.pieces, 106);
  assert.equal(c.parts.garments, 424);
});

test("screens multiply colours by locations and scale ink and press time", () => {
  const c = jobCost(validate({ ...base, colors: 3, locations: 2 }), 100);
  assert.equal(c.screens, 6);
  assert.equal(c.impressions, 600);
  assert.equal(c.parts.ink, 30);
  assert.equal(c.parts.screens, 90);
  assert.equal(c.printHours, 3);
  assert.equal(c.setupHours, (6 * 12 + 18) / 60);
});

test("a screen fee charged to the customer lowers the per-piece price, not the margin", () => {
  const v = validate({ ...base, screenFeeCharged: 15 });
  const u = unitPrice(v, 100);
  assert.ok(Math.abs(u.revenue - 766.666667) < 1e-5);
  assert.equal(u.screenFees, 15);
  assert.ok(Math.abs(u.unit - 7.516667) < 1e-5);
});

test("price per piece falls as quantity rises, flooring near garment plus run cost", () => {
  const r = plan(base);
  for (let i = 1; i < r.ladder.length; i++) assert.ok(r.ladder[i].unit <= r.ladder[i - 1].unit);
  assert.ok(r.ladder.at(-1).unit > base.garmentCost);
});

test("order quantity is included in the ladder and flagged", () => {
  const r = plan({ ...base, qty: 60 });
  assert.equal(r.ladder.filter((l) => l.isOrder).length, 1);
  assert.ok(r.ladder.some((l) => l.qty === 60));
});

test("break-even quantity at a given price is the first non-losing order", () => {
  const v = validate({ ...base, yourPrice: 7 });
  const q = breakEvenQty(v, 7);
  assert.ok(q > 1);
  const profit = (n) => n * 7 - jobCost(v, n).total;
  assert.ok(profit(q) >= 0);
  assert.ok(profit(q - 1) < 0);
});

test("a price below garment plus run cost never breaks even", () => {
  assert.equal(breakEvenQty(validate(base), 3), null);
});

test("your price below the quote reports a loss and the price you need", () => {
  const r = plan({ ...base, yourPrice: 4 });
  assert.ok(r.yours.profit < 0);
  assert.match(r.advice.join(" "), /loses/);
});

test("high setup share triggers the minimum-order advice", () => {
  const r = plan({ ...base, qty: 12, screenCost: 40, jobSetupMin: 60 });
  assert.match(r.advice.join(" "), /Setup/);
});

test("invalid input returns an error rather than NaN", () => {
  assert.ok(plan({ ...base, qty: 0 }).error);
  assert.ok(plan({ ...base, colors: 20 }).error);
  assert.ok(plan({ ...base, impressionsPerHour: 0 }).error);
  assert.ok(plan({ ...base, marginPct: 100 }).error);
  assert.ok(plan({ ...base, garmentCost: -1 }).error);
});

test("sample input plans cleanly and exports CSV", () => {
  const r = plan(sampleInput());
  assert.ok(!r.error);
  assert.ok(r.unit > 0 && Number.isFinite(r.profit));
  const csv = toCsv(r).trim().split("\n");
  assert.equal(csv[0], "quantity,price_each,your_cost_each");
  assert.equal(csv.length, r.ladder.length + 1);
  assert.equal(usd(1234.5), "$1,234.50");
});
