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

// Quality audit 2026-11-13 (round 62): headers were matched by prefix and the
// first match won, so "Net Profit" became the payout and "Buyer" the cost.
test("parseSales gives each header to one field and never reads a profit column as payout", () => {
  const a = parseSales("Event,Platform,Qty,Net Profit,Cost,Payout\nG,StubHub,2,70,200,270");
  assert.equal(a.rows.length, 1);
  assert.equal(a.rows[0].payout, 270);
  assert.equal(a.rows[0].cost, 200);
  const b = parseSales("Event,Sold On,Buyer,Qty,Cost,Sale Price,Fees\nG,SeatGeek,Pat,2,200,300,30");
  assert.equal(b.skipped, 0);
  assert.deepEqual([b.rows[0].platform, b.rows[0].cost, b.rows[0].gross, b.rows[0].payout], ["SeatGeek", 200, 300, 270]);
});

test("parseSales multiplies a per-ticket cost column by qty", () => {
  const { rows } = parseSales("event,platform,qty,cost per ticket,payout\nG,StubHub,2,100,270");
  assert.equal(rows[0].cost, 200);
});

test("parseSales skips a row whose fees cell is blank when there is no payout", () => {
  const r = parseSales("event,platform,qty,cost,sale,fees\nG,StubHub,2,200,300,");
  assert.equal(r.rows.length, 0);
  assert.equal(r.skipped, 1);
  const p = parseSales("event,platform,qty,cost,fees,payout\nG,StubHub,2,200,,270");
  assert.equal(p.rows[0].payout, 270);
});

test("hand-computed break-even, effective fee and break-even sale chance", () => {
  const input = { qty: 4, costPerTicket: 85.5, feePct: 10, flatFeePerTicket: 2.5, deliveryPerOrder: 15 };
  // (342 + 15 + 4 * 2.5) / (4 * 0.9) = 101.94
  assert.equal(Math.round(breakEvenList(input) * 100) / 100, 101.94);
  // fees 44 + 10 = 54, plus delivery 15, over gross 440 = 15.68%
  assert.equal(Math.round(netIfSold(110, input).effectiveFeePct * 100) / 100, 15.68);
  // loss if unsold 342 - 160 = 182; swing 29 + 182 = 211; 182 / 211 = 0.86
  assert.equal(Math.round(expectedProfit(110, input, { pSell: 0.7, salvagePerTicket: 40 }).breakEvenPSell * 100) / 100, 0.86);
});

// Quality audit round 62, second blind audit (portfolio/quality/blind-pairs/2026-11-13-h/ticket-resale-profit-calculator.json):
// figures worked by hand, each one killed a seeded bug the suite let through.
test("break-even counts the per-ticket fee and delivery: (2*120 + 2*1 + 5) / (2 * 0.9)", () => {
  assert.equal(breakEvenList({ qty: 2, costPerTicket: 120, feePct: 10, flatFeePerTicket: 1, deliveryPerOrder: 5 }), 137.22);
});

test("unsold tickets keep their salvage value", () => {
  const r = expectedProfit(150, { qty: 2, costPerTicket: 120, feePct: 10 }, { pSell: 0.5, salvagePerTicket: 100 });
  assert.equal(r.ifUnsold, 200 - 240);
  assert.equal(r.expected, 0.5 * 30 + 0.5 * -40);
});

test("a sale with gross above cost but payout below it is a loss", () => {
  const r = analyzeSales(parseSales("event,platform,cost,sale,fees\nA,StubHub,100,105,15"));
  assert.deepEqual(r.losers, [{ event: "A", platform: "StubHub", loss: 10 }]);
});

test("an unquoted thousands comma skips the row instead of shifting its columns", () => {
  const bare = parseSales("Show,StubHub,2,$1,200.00,$1,400.00,$140");
  assert.deepEqual([bare.rows.length, bare.skipped], [0, 1]);
  const hdr = parseSales("event,platform,cost,payout\nShow,StubHub,$1,200.00,$1,260.00");
  assert.deepEqual([hdr.rows.length, hdr.skipped], [0, 1]);
  const quoted = parseSales('Show,StubHub,2,"$1,200.00","$1,400.00",$140');
  assert.deepEqual([quoted.rows[0].cost, quoted.rows[0].gross, quoted.rows[0].payout], [1200, 1400, 1260]);
  assert.equal(parseSales("Show,StubHub,2,100,150,15,").rows.length, 1, "a trailing empty cell is not extra width");
});

test("edges: a $0 list price is valid (giving tickets away), and hand-built rows report 0 skipped", () => {
  const free = netIfSold(0, { ...order, flatFeePerTicket: 1 });
  assert.equal(free.gross, 0);
  assert.equal(free.payout, -2);
  assert.throws(() => netIfSold(-0.01, order), /non-negative/);
  const report = analyzeSales({ rows: [{ event: "A", platform: "X", qty: 1, cost: 10, gross: 20, payout: 18 }] });
  assert.equal(report.skipped, 0);
  assert.equal(report.count, 1);
});
