import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalizeSales, normalizeStock, analyze, poCsv, summaryText, sampleSales, SAMPLE_STOCK, DEFAULTS } from "./calc.mjs";

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
  const lo = analyze(sales, stock, { asOf, serviceLevel: 0.9 }).rows[0];
  const hi = analyze(sales, stock, { asOf, serviceLevel: 0.99 }).rows[0];
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
