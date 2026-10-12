import test from "node:test";
import assert from "node:assert/strict";
import { netIfSold, listForProfit, breakEvenList, expectedProfit, priceSweep, comparePlatforms, parseSales, analyzeSales, summarizeSales } from "./engine.mjs";

const order = { qty: 2, costPerTicket: 120, feePct: 10 };

test("netIfSold subtracts the percentage fee, flat fee and delivery", () => {
  const n = netIfSold(150, { ...order, flatFeePerTicket: 1, deliveryPerOrder: 5 });
  assert.equal(n.gross, 300);
  assert.equal(n.sellerFee, 32); // 30 + 2
  assert.equal(n.payout, 263); // 300 - 32 - 5
  assert.equal(n.profit, 23);
  assert.equal(n.roi, 9.58);
});

test("break-even and target-profit list prices round-trip through netIfSold", () => {
  const be = breakEvenList(order);
  assert.equal(be, 133.33);
  assert.ok(Math.abs(netIfSold(be, order).profit) < 0.5);
  const p = listForProfit(100, order);
  assert.ok(Math.abs(netIfSold(p, order).profit - 100) < 0.5);
});

test("expected profit goes negative at thin margin and a realistic sale chance", () => {
  const e = expectedProfit(150, order, { pSell: 0.8 });
  assert.equal(e.ifSold, 30);
  assert.equal(e.ifUnsold, -240);
  assert.equal(e.expected, -24);
  assert.equal(e.breakEvenPSell, 0.89);
  assert.equal(expectedProfit(150, order, { pSell: 1 }).expected, 30);
});

test("salvage value of an unsold ticket lowers the sale chance you need", () => {
  const e = expectedProfit(150, order, { pSell: 0.5, salvagePerTicket: 100 });
  assert.ok(e.breakEvenPSell < expectedProfit(150, order, { pSell: 0.5 }).breakEvenPSell);
});

test("sweep starts at break-even and rises", () => {
  const rows = priceSweep(order);
  assert.equal(rows.length, 9);
  assert.ok(rows[0].profit <= 0.5 && rows[8].profit > rows[0].profit);
});

test("comparePlatforms ranks the lowest seller fee first and honours overrides", () => {
  const c = comparePlatforms(150, order);
  assert.equal(c.at(-1).key, "ticketmaster");
  const o = comparePlatforms(150, order, { seatgeek: 5 });
  assert.equal(o[0].key, "seatgeek");
});

test("bad input is rejected rather than guessed", () => {
  assert.throws(() => netIfSold(-1, order), RangeError);
  assert.throws(() => breakEvenList({ ...order, feePct: 100 }), RangeError);
  assert.throws(() => breakEvenList({ ...order, qty: 1.5 }), RangeError);
  assert.throws(() => expectedProfit(150, order, { pSell: 2 }), RangeError);
});

test("parseSales reads headers by name, sale+fees or payout, money formats and skips junk", () => {
  const { rows, skipped } = parseSales(`event,platform,qty,cost,payout
A,StubHub,2,"$1,000.00","$1,350.00"
B,SeatGeek,1,(50),20
no platform,,1,10,10
# comment
C,StubHub,x,40,abc`);
  assert.equal(rows.length, 2);
  assert.equal(skipped, 2);
  assert.equal(rows[0].cost, 1000);
  assert.equal(rows[0].payout, 1350);
  assert.equal(rows[1].cost, -50);
});

test("headerless rows use event,platform,qty,cost,sale,fees", () => {
  const { rows } = parseSales("Show,StubHub,2,100,150,15");
  assert.deepEqual([rows[0].gross, rows[0].payout], [150, 135]);
});

test("analyzeSales totals per platform and lists losing sales", () => {
  const r = analyzeSales(parseSales("event,platform,qty,cost,sale,fees\nA,StubHub,2,100,150,15\nB,stubhub,1,60,50,5\nC,SeatGeek,2,80,120,12"));
  assert.equal(r.count, 3);
  const sh = r.platforms.find((p) => p.platform === "StubHub");
  assert.equal(sh.sales, 2);
  assert.equal(sh.profit, 135 + 45 - 160);
  assert.equal(sh.feePct, 10);
  assert.equal(r.total.profit, 135 + 45 + 108 - 240);
  assert.equal(r.losers.length, 1);
  assert.equal(r.losers[0].event, "B");
  assert.equal(summarizeSales(r).status, "ok");
  assert.equal(summarizeSales(analyzeSales({ rows: [] })).status, "none");
});
