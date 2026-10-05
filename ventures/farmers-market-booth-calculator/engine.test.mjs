import test from "node:test";
import assert from "node:assert/strict";
import { computeMarkets, summarize, money, pct } from "./engine.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const one = (m, g = {}) => computeMarkets({ ...g, markets: [{ name: "A", feePct: 0, ...m }] }).rows[0];

test("profit subtracts every cost", () => {
  const r = one({ sales: 1000, boothFee: 50, hours: 10, miles: 20 }, { cogsPct: 30, wastePct: 5, cardSharePct: 50, cardFeePct: 3, mileCost: 0.5 });
  close(r.profit, 1000 - 300 - 50 - 15 - 50 - 10);
  close(r.perHour, r.profit / 10);
});

test("percent of sales fee comes off sales", () => {
  const r = one({ sales: 1000, boothFee: 0, hours: 5, miles: 0, feePct: 10 }, { cogsPct: 0, wastePct: 0, cardSharePct: 0 });
  close(r.profit, 900);
});

test("break-even and target sales hit zero profit and the target wage", () => {
  const g = { cogsPct: 35, wastePct: 6, cardSharePct: 70, cardFeePct: 2.6, mileCost: 0.7, targetWage: 25 };
  const r = one({ sales: 500, boothFee: 80, hours: 8, miles: 40, feePct: 5 }, g);
  assert.ok(Math.abs(one({ sales: r.breakEven, boothFee: 80, hours: 8, miles: 40, feePct: 5 }, g).profit) < 1e-6);
  close(one({ sales: r.targetSales, boothFee: 80, hours: 8, miles: 40, feePct: 5 }, g).perHour, 25, 1e-6);
});

test("defaults: the festival earns least and is flagged reprice-or-cut", () => {
  const r = computeMarkets();
  assert.equal(r.best.name, "Saturday downtown");
  assert.equal(r.worst.name, "Big weekend festival");
  assert.equal(money(r.best.profit), "$448.62");
  assert.equal(money(r.worst.perHour), "$13.81");
  assert.equal(r.worst.verdict, "reprice-or-cut");
  assert.equal(r.dropWorst, true);
  assert.match(summarize(r).text, /Dropping Big weekend festival/);
});

test("a market that cannot cover its fixed costs is losing", () => {
  const r = one({ sales: 100, boothFee: 120, hours: 6, miles: 10 });
  assert.equal(r.verdict, "losing");
  assert.ok(r.profit < 0);
});

test("margin of zero or less never divides by zero", () => {
  const r = one({ sales: 100, boothFee: 10, hours: 2, miles: 0, feePct: 70 }, { cogsPct: 30, wastePct: 5, cardSharePct: 0 });
  assert.equal(r.breakEven, null);
  assert.equal(r.targetSales, null);
});

test("a 20 percent worse day is computed from the same costs", () => {
  const r = computeMarkets().rows[0];
  assert.equal(money(r.down20.profit), "$345.70");
  assert.equal(money(r.up20.profit), "$551.54");
});

test("bad input is named", () => {
  assert.throws(() => computeMarkets({ cogsPct: 60, wastePct: 40 }), /under 100/);
  assert.throws(() => computeMarkets({ cardSharePct: 120 }), /Card share/);
  assert.throws(() => computeMarkets({ markets: [] }), /at least one/);
  assert.throws(() => computeMarkets({ markets: [{ name: "X", sales: "abc", boothFee: 1, feePct: 0, hours: 1, miles: 0 }] }), /X: sales/);
  assert.throws(() => computeMarkets({ markets: [{ name: "X", sales: 1, boothFee: 1, feePct: 0, hours: 0, miles: 0 }] }), /hours/);
});

test("formatters", () => {
  assert.equal(money(-5), "-$5.00");
  assert.equal(pct(5), "5.0%");
});
