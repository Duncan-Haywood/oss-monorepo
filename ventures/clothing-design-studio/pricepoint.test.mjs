import test from "node:test";
import assert from "node:assert/strict";
import { elasticityFrom, atPrice, bestPrice, sensitivity, snap, priceCsv } from "./pricepoint.mjs";
const close = (a, b, e = 0.02) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("elasticity from a price test: 40 -> 100 sales, 50 -> 64 sales is 2", () => {
  close(elasticityFrom(40, 100, 50, 64), 2, 1e-9);        // (50/40)^-2 = 0.64
});
test("equal prices rejected", () => assert.throws(() => elasticityFrom(40, 10, 40, 12)));
test("hand-worked profit: 100 sold at 40, e=2, price 50, cost 20, no fee/VAT", () => {
  const r = atPrice(50, { refPrice: 40, refSales: 100, elasticity: 2, landed: 20, feePct: 0 });
  close(r.sales, 64, 1e-9); close(r.perPiece, 30, 1e-9); close(r.profit, 1920, 0.01);
});
test("closed form p* = e/(e-1) * cost: e=2, cost 15 -> 30, and the scan agrees", () => {
  const r = bestPrice({ refPrice: 40, refSales: 100, elasticity: 2, landed: 15, feePct: 0 });
  assert.equal(r.closedForm, 30);
  close(r.best.price, 30, 0.2);
});
test("VAT and fees raise the best price by 1/keep", () => {
  const r = bestPrice({ refPrice: 40, refSales: 100, elasticity: 2, landed: 15, feePct: 5, vatPct: 20 });
  close(r.closedForm, 30 / (0.95 / 1.2), 0.01);
});
test("elasticity at or below 1 is flagged and capped", () => {
  const r = bestPrice({ refPrice: 40, refSales: 100, elasticity: 0.8, landed: 15 });
  assert.ok(r.notes.some(n => /1 or below/.test(n)));
  close(r.best.price, 120, 0.7);
});
test("fixed cost lowers profit by exactly that amount at the same price", () => {
  const a = atPrice(45, { refPrice: 40, refSales: 100, elasticity: 2, landed: 15 });
  const b = atPrice(45, { refPrice: 40, refSales: 100, elasticity: 2, landed: 15, fixed: 500 });
  close(a.profit - b.profit, 500, 0.01);
});
test("a more elastic market gives a lower best price", () => {
  const s = sensitivity({ refPrice: 40, refSales: 100, landed: 15, feePct: 0 });
  for (let i = 1; i < s.length; i++) assert.ok(s[i].price <= s[i - 1].price + 0.01);
});
test("snap: 47.3 -> 46.99, 47.99 -> 47.99, whole", () => {
  assert.equal(snap(47.3), 46.99); assert.equal(snap(47.99), 47.99); assert.equal(snap(47.3, "whole"), 47); assert.equal(snap(47.3, ".95"), 46.95);
});
test("bad input throws, csv defuses and has a header", () => {
  assert.throws(() => bestPrice({ refPrice: -1, refSales: 10, elasticity: 2, landed: 5 }));
  assert.throws(() => bestPrice({ refPrice: 40, refSales: 10, elasticity: NaN, landed: 5 }));
  const c = priceCsv(bestPrice({ refPrice: 40, refSales: 100, elasticity: 2, landed: 15 }));
  assert.ok(c.startsWith("price,sales,"));
});
