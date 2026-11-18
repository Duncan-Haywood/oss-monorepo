import test from "node:test";
import assert from "node:assert/strict";
import { atMove, stress, breakEvenMove, forward, priceToCover, notes } from "./fx.mjs";

const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
// 10,000 USD order, 30% deposit at 0.92 EUR/USD, 2,000 EUR other costs, 20,000 EUR revenue
const o = { orderForeign: 10000, depositPct: 30, rate: 0.92, otherHome: 2000, revenueHome: 20000 };

test("no move: 9,200 + 2,000 = 11,200 cost, 8,800 profit", () => {
  const r = atMove(o, 0); close(r.cost, 11200); close(r.profit, 8800); close(r.marginPct, 44);
});
test("balance 10% dearer: 2,760 + 7,084 + 2,000 = 11,844; profit down 644", () => {
  const r = atMove(o, 0.1); close(r.depositHome, 2760); close(r.balanceHome, 7084); close(r.cost, 11844);
  const s = stress(o, [0, 0.1]); close(s[1].profitChange, -644); close(s[1].costChange, 644);
});
test("break-even: balance rate 2.177142857 EUR/USD, a 136.6% rise", () => {
  close(breakEvenMove(o), (20000 - 2000 - 2760) / 7000 / 0.92 - 1);
  const m = breakEvenMove(o); close(atMove(o, m).profit, 0, 1e-6);
});
test("all up front has no balance to move", () => {
  assert.equal(breakEvenMove({ ...o, depositPct: 100 }), null);
  close(atMove({ ...o, depositPct: 100 }, 0.5).cost, 11200);
});
test("forward at 0.95 with 30 fee: 2,760 + 6,650 + 30 + 2,000 = 11,440", () => {
  const f = forward(o, 0.95, 30); close(f.lockedCost, 11440); close(f.lockedProfit, 8560);
  close(f.premiumPct, (0.95 / 0.92 - 1) * 100);
  close(atMove(o, f.evenMove).cost, f.lockedCost); // spot after that move costs the same
});
test("price to cover a 10% move over 500 garments is 644/500", () => close(priceToCover(o, 0.1, 500), 1.288));
test("a fall in the rate never asks for a price rise", () => close(priceToCover(o, -0.1, 500), 0));
test("bad input is refused", () => {
  assert.throws(() => atMove({ ...o, rate: 0 }, 0)); assert.throws(() => atMove(o, -1));
  assert.throws(() => atMove({ ...o, depositPct: 120 }, 0)); assert.throws(() => atMove({ ...o, orderForeign: NaN }, 0));
});
test("notes warn on a thin cushion", () => {
  const thin = { ...o, revenueHome: 11300 };
  assert.ok(notes(thin).some(n => /under 5%/.test(n)));
  assert.ok(notes({ ...o, depositPct: 100 }).some(n => /up front/.test(n)));
});
