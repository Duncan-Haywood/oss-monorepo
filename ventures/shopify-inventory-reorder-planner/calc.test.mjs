import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeSales, normalizeStock, analyze, poCsv, summaryText, sampleSales, SAMPLE_STOCK, DEFAULTS, leadTimeQuantile } from "./calc.mjs";

const D = 86400000;
const asOf = Date.UTC(2026, 8, 28);
// constant demand: `perDay` units of a SKU every day for `days` days
function steady(sku, perDay, days, price = 10) {
  const out = [];
  for (let d = 0; d < days; d++) out.push({ t: asOf - d * D, sku, name: sku, qty: perDay, price });
  return out;
}

test("velocity, reorder point and order quantity on a perfectly steady SKU", () => {
  const r = analyze(steady("A", 2, 70), [{ sku: "A", name: "", onHand: 30, incoming: 0, cost: 4, price: null }], { asOf });
  const a = r.rows[0];
  assert.equal(a.velocity, 2); // no variation: safety stock is zero
  assert.equal(a.safety, 0);
  assert.equal(a.reorderPoint, 42); // 2/day * 21 days
  assert.equal(a.status, "reorder"); // 30 <= 42
  assert.equal(a.cover, 15);
  assert.equal(a.orderQty, 72); // 2 * (21+30) - 30
  assert.equal(a.orderCost, 288);
  assert.equal(a.atRisk, 2 * 10 * 6); // 21 - 15 = 6 days uncovered
});

test("incoming stock counts toward the position but not toward days of cover", () => {
  const r = analyze(steady("A", 2, 70), [{ sku: "A", name: "", onHand: 30, incoming: 40, cost: null, price: null }], { asOf });
  assert.equal(r.rows[0].status, "ok"); // 70 > 42
  assert.equal(r.rows[0].orderQty, 32); // 102 - 70
});

test("zero on-hand with sales is stocked-out and puts one lead time of revenue at risk", () => {
  const r = analyze(steady("A", 1, 60, 25), [{ sku: "A", name: "", onHand: 0, incoming: 0, cost: null, price: null }], { asOf });
  assert.equal(r.rows[0].status, "stocked-out");
  assert.equal(r.rows[0].atRisk, 1 * 25 * DEFAULTS.leadDays);
});

test("variable demand raises safety stock, and a higher service level raises it further", () => {
  const sales = [];
  for (let w = 0; w < 10; w++) sales.push({ t: asOf - w * 7 * D, sku: "V", name: "V", qty: w % 2 ? 2 : 20, price: 1 });
  const stock = [{ sku: "V", name: "", onHand: 500, incoming: 0, cost: null, price: null }];
  const lo = analyze(sales, stock, { asOf, serviceLevel: 0.9, safetyMethod: "normal" }).rows[0];
  const hi = analyze(sales, stock, { asOf, serviceLevel: 0.99, safetyMethod: "normal" }).rows[0];
  assert.ok(lo.safety > 0);
  assert.ok(hi.safety > lo.safety);
});

test("a SKU in stock with no sales in the window is dead and its cash is counted", () => {
  const r = analyze(steady("A", 1, 60), [{ sku: "A", name: "", onHand: 10, incoming: 0, cost: 1, price: null }, { sku: "Z", name: "", onHand: 50, incoming: 0, cost: 3, price: null }], { asOf });
  const z = r.rows.find((x) => x.sku === "Z");
  assert.equal(z.status, "dead");
  assert.equal(z.excessCash, 150);
  assert.equal(r.summary.excessCash, 150 + (r.rows.find((x) => x.sku === "A").excessCash ?? 0));
});

test("overstock is measured against days of cover, and only the excess is counted", () => {
  const r = analyze(steady("A", 1, 60), [{ sku: "A", name: "", onHand: 200, incoming: 0, cost: 2, price: null }], { asOf });
  assert.equal(r.rows[0].status, "overstock");
  assert.equal(r.rows[0].excessUnits, 80); // 200 - 120 days * 1/day
  assert.equal(r.rows[0].excessCash, 160);
});

test("recent surge is weighted into velocity once there are eight weeks of data", () => {
  const sales = steady("S", 1, 90);
  for (let d = 0; d < 28; d++) sales.push({ t: asOf - d * D, sku: "S", name: "S", qty: 2, price: 1 });
  const s = analyze(sales, [], { asOf }).rows[0];
  assert.ok(s.trend > 0.3);
  assert.ok(s.velocity > s.units / 90);
});

test("without a stock file the plan is velocity only and says so", () => {
  const r = analyze(steady("A", 1, 30), [], { asOf });
  assert.equal(r.rows[0].status, "no-stock-data");
  assert.equal(r.rows[0].orderQty, 0);
  assert.ok(r.findings.some((f) => /No stock file/.test(f.title)));
});

test("ABC classes follow revenue share", () => {
  const sales = [...steady("BIG", 10, 30, 100), ...steady("MID", 1, 30, 10), ...steady("TINY", 1, 30, 0.1)];
  const abc = Object.fromEntries(analyze(sales, [], { asOf }).rows.map((x) => [x.sku, x.abc]));
  assert.deepEqual(abc, { BIG: "A", MID: "C", TINY: "C" });
});

test("Shopify order export: order-level rows inherit nothing, line rows inherit the date, cancelled and refunded orders drop out", () => {
  const csv = [
    "Name,Created at,Financial Status,Cancelled at,Lineitem name,Lineitem sku,Lineitem quantity,Lineitem price",
    "#1,2026-09-01 10:00:00 +0000,paid,,Mug,MUG,2,20.00",
    "#1,,,,Kettle,KET,1,40.00",
    "#2,2026-09-02 10:00:00 +0000,refunded,,Mug,MUG,9,20.00",
    "#3,2026-09-03 10:00:00 +0000,paid,2026-09-04,Mug,MUG,7,20.00",
    "#4,2026-09-05 10:00:00 +0000,paid,,Mug,MUG,-1,20.00",
    "#5,2026-09-06 10:00:00 +0000,paid,,,,,",
  ].join("\n");
  const n = normalizeSales(parseCsv(csv));
  assert.equal(n.error, undefined);
  assert.deepEqual(n.items.map((x) => [x.sku, x.qty]), [["MUG", 2], ["KET", 1], ["MUG", -1]]);
  const r = analyze(n.items, [], { asOf: Date.UTC(2026, 8, 6) });
  assert.equal(r.rows.find((x) => x.sku === "MUG").units, 1); // returns net against sales
});

test("missing columns are named", () => {
  assert.match(normalizeSales(parseCsv("a,b\n1,2")).error, /SKU or product-name/);
  assert.match(normalizeSales(parseCsv("sku,qty\nA,1")).error, /date column/);
  assert.match(normalizeSales(parseCsv("sku,date\nA,2026-01-01")).error, /quantity column/);
  assert.match(normalizeStock(parseCsv("x,y\n1,2")).error, /SKU column/);
});

test("unreadable rows are listed, not silently dropped", () => {
  const n = normalizeSales(parseCsv("sku,date,quantity\nA,2026-09-01,two\nB,not a date,1\nC,2026-09-02,3"));
  assert.equal(n.items.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line).sort(), [2, 3]);
});

test("invalid settings are refused", () => {
  assert.match(analyze(steady("A", 1, 10), [], { leadDays: 0 }).invalid, /Lead time/);
  assert.match(analyze([], []).invalid, /No sales/);
});

test("the worked example reaches every headline status and the purchase-order CSV matches the summary", () => {
  const s = normalizeSales(parseCsv(sampleSales()));
  const st = normalizeStock(parseCsv(SAMPLE_STOCK));
  const r = analyze(s.items, st.items);
  const status = Object.fromEntries(r.rows.map((x) => [x.sku, x.status]));
  assert.equal(status["TEA-SAMPLER"], "stocked-out");
  assert.equal(status["TEA-CHAI-100"], "reorder");
  assert.equal(status["MUG-STONE-BLU"], "overstock");
  assert.equal(status["MUG-OLD-RED"], "dead");
  const lines = poCsv(r).split("\n").slice(1);
  assert.equal(lines.length, r.rows.filter((x) => x.orderQty > 0).length);
  assert.equal(r.rows.reduce((t, x) => t + x.orderQty, 0), r.summary.poUnits);
  assert.match(summaryText(r), /not a forecast/);
});

test("rows and totals reconcile", () => {
  const r = analyze(...(() => { const s = normalizeSales(parseCsv(sampleSales())); return [s.items, normalizeStock(parseCsv(SAMPLE_STOCK)).items]; })());
  assert.equal(r.summary.skus, r.rows.length);
  assert.equal(Math.round(r.rows.reduce((t, x) => t + x.revenue, 0)), Math.round(r.summary.revenue));
});

// Red-team 2026-11-15: skipped rows were numbered by position after blank rows were dropped, so a blank line or a
// note with a line break in it made "line 3" point at the wrong row of the file.
test("a skipped row's line is its first line in the file, past blank lines and multi-line notes", () => {
  const n = normalizeSales(parseCsv('sku,date,quantity,notes\n\nA,2026-09-01,1,"gift\nwrap"\nB,2026-09-02,two,\r\n\r\nC,not a date,1,'));
  assert.deepEqual(n.skipped.map((s) => s.line), [5, 7]);
  const s = normalizeStock(parseCsv("sku,on hand\n\nA,3\n\nB,lots"));
  assert.deepEqual(s.skipped.map((x) => x.line), [5]);
});

// Red team 2026-11-19: Shopify's inventory export has one row per variant per location; the planner kept only
// the last row, so 40 units in a warehouse plus 5 in the shop read as 5 on hand and a false reorder.
test("stock rows for the same SKU (one per location) are added up, and the plan says so", () => {
  const st = normalizeStock(parseCsv("Handle,Title,SKU,Location,Incoming,Available,On hand,Cost per item\nmug,Mug,MUG,Warehouse,10,40,40,\nmug,Mug,MUG,Shop,0,5,5,4.00"));
  const r = analyze(steady("MUG", 1, 60, 20), st.items, { asOf });
  const m = r.rows[0];
  assert.equal(r.rows.length, 1);
  assert.equal(m.onHand, 45);
  assert.equal(m.incoming, 10);
  assert.equal(m.cost, 4); // first cost found on any of its rows
  assert.equal(m.status, "ok"); // 55 > 21
  assert.equal(m.orderQty, 0);
  assert.ok(r.findings.some((f) => /more than one stock row/.test(f.title)));
  assert.ok(!analyze(steady("MUG", 1, 60), [st.items[0]], { asOf }).findings.some((f) => /more than one stock row/.test(f.title)));
});

// Red team 2026-11-19: days that did not fill a whole week were piled into the oldest week, so perfectly steady
// demand over 66 or 69 days got safety stock (6 and 12 units at 2/day) it does not need.
test("a partial oldest week does not add variation to steady demand", () => {
  for (const days of [63, 64, 66, 69, 70]) {
    const a = analyze(steady("A", 2, days), [{ sku: "A", name: "", onHand: 30, incoming: 0, cost: null, price: null }], { asOf }).rows[0];
    assert.equal(a.safety, 0, `${days} days`);
    assert.equal(a.reorderPoint, 42, `${days} days`);
  }
});

test("amounts default to a decimal point in both files", () => {
  const s = normalizeSales(parseCsv("sku,date,quantity,price\nA,2026-09-01,1,12.50"));
  assert.equal(s.items[0].price, 12.5);
  const st = normalizeStock(parseCsv("sku,on hand,incoming,cost,price\nA,3,2,5.20,12.50\nB,1,,,"));
  assert.deepEqual(st.items.map((x) => [x.onHand, x.incoming, x.cost, x.price]), [[3, 2, 5.2, 12.5], [1, 0, null, null]]);
});

test("nothing is at risk on a SKU that is fine", () => {
  const r = analyze(steady("A", 2, 70), [{ sku: "A", name: "", onHand: 200, incoming: 0, cost: null, price: null }, { sku: "Z", name: "", onHand: 5, incoming: 0, cost: null, price: null }], { asOf });
  assert.deepEqual(r.rows.map((x) => [x.sku, x.status, x.atRisk]), [["Z", "dead", 0], ["A", "ok", 0]]);
  assert.equal(r.summary.atRisk, 0);
});

test("the top-revenue warning names only A SKUs that need action", () => {
  const sales = [...steady("BIG", 10, 30, 100), ...steady("SMALL", 1, 30, 1)];
  const quiet = analyze(sales, [{ sku: "BIG", name: "", onHand: 5000, incoming: 0, cost: null, price: null }, { sku: "SMALL", name: "", onHand: 0, incoming: 0, cost: null, price: null }], { asOf });
  assert.ok(!quiet.findings.some((f) => /top-revenue/.test(f.title)));
  const loud = analyze(sales, [{ sku: "BIG", name: "", onHand: 0, incoming: 0, cost: null, price: null }, { sku: "SMALL", name: "", onHand: 0, incoming: 0, cost: null, price: null }], { asOf });
  assert.match(loud.findings.find((f) => /top-revenue/.test(f.title)).title, /^1 of your/);
});

test("the thin-history note counts SKUs under five units, not five", () => {
  const five = [0, 1, 2, 3, 4].map((d) => ({ t: asOf - d * D, sku: "F", name: "F", qty: 1, price: 1 }));
  assert.ok(!analyze([...five, ...steady("A", 1, 30)], [], { asOf }).findings.some((f) => /fewer than 5/.test(f.title)));
  assert.ok(analyze([...five.slice(1), ...steady("A", 1, 30)], [], { asOf }).findings.some((f) => /^1 SKU\(s\) sold fewer than 5/.test(f.title)));
});

test("text cells with a number in them do not vote on the decimal mark", async () => {
  const { detectDecimalComma } = await import("./calc.mjs");
  assert.equal(detectDecimalComma([["name", "price"], ["Tea 0,25", "1.50"], ["Box 0,5", ""]]), false);
});

test("lead-time quantile: the serviceLevel share of every run of lead days", () => {
  // 10 days and a lead of 3 give 8 runs; the three that hold day 2 sum to 9, the other five to 0
  const d = new Float64Array([0, 0, 9, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(leadTimeQuantile(d, 3, 0.5), 0); // 5 of 8 runs are empty
  assert.equal(leadTimeQuantile(d, 3, 0.9), 9);
  assert.equal(leadTimeQuantile(new Float64Array([1, -4, 1, 1, 1, 1, 1]), 2, 1), 2); // returns count as zero
  assert.equal(leadTimeQuantile(new Float64Array(5), 3, 0.95), null); // under two lead times of history
});

test("a SKU sold once a week takes its reorder point from lead-time demand; a daily seller keeps the weekly rule", () => {
  const weekly = [];
  for (let w = 0; w < 26; w++) weekly.push({ t: asOf - w * 7 * D, sku: "W", name: "W", qty: w === 3 ? 60 : 6, price: 1 });
  const daily = [];
  for (let d = 0; d < 182; d++) daily.push({ t: asOf - d * D, sku: "S", name: "S", qty: 1 + (d % 3), price: 1 });
  const r = analyze([...weekly, ...daily], [], { asOf, leadDays: 14 });
  const w = r.rows.find((x) => x.sku === "W"), sd = r.rows.find((x) => x.sku === "S");
  assert.equal(w.safetyFrom, "lead-time");
  assert.equal(sd.safetyFrom, "weekly");
  // 14-day runs hold two weekly orders: 12 normally, 66 around the big week (14 of 169 runs);
  // the 95% run is 66, so the reorder point covers the big order the normal curve smooths away.
  assert.equal(w.reorderPoint, 66);
  const n = analyze(weekly, [], { asOf, leadDays: 14, safetyMethod: "normal" }).rows[0];
  assert.ok(n.reorderPoint < 66);
});

test("a big export (200,000 order lines) is analysed without overflowing the stack", () => {
  const big = [];
  for (let i = 0; i < 200000; i++) big.push({ t: asOf - (i % 365) * D, sku: "K" + (i % 500), name: "", qty: 1, price: 2 });
  const r = analyze(big, [], { asOf });
  assert.equal(r.summary.skus, 500);
});

test("a wholesale invoice export (StockCode, Description, InvoiceDate) is read", () => {
  const t = parseCsv("Invoice,StockCode,Description,Quantity,InvoiceDate,Price,Customer ID,Country\n489434,85048,15CM CHRISTMAS GLASS BALL 20 LIGHTS,12,2009-12-01 07:45:00,6.95,13085,United Kingdom\nC489449,22087,PAPER BUNTING WHITE LACE,-12,2009-12-01 10:33:00,2.95,16321,Australia\n");
  const n = normalizeSales(t);
  assert.equal(n.error, undefined);
  assert.equal(n.items.length, 2);
  assert.deepEqual([n.items[0].sku, n.items[0].name, n.items[0].qty, n.items[0].price], ["85048", "15CM CHRISTMAS GLASS BALL 20 LIGHTS", 12, 6.95]);
  assert.equal(n.items[1].qty, -12);
});
