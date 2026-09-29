import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, normalizeReport, classify, analyze, parseCosts, sampleData } from "./calc.mjs";

const sample = () => {
  const d = sampleData();
  const n = normalizeReport(parseCsv(d.report));
  assert.equal(n.error, null);
  return { d, n, costs: parseCosts(d.costs).costs };
};

test("parseDate reads eBay's short month names, day-first and ISO", () => {
  assert.deepEqual(parseDate("Sep 28, 2026"), { y: 2026, mo: 8, d: 28 });
  assert.deepEqual(parseDate("28 Sep 2026"), { y: 2026, mo: 8, d: 28 });
  assert.deepEqual(parseDate("28-Sep-26"), { y: 2026, mo: 8, d: 28 });
  assert.deepEqual(parseDate("2026-09-28"), { y: 2026, mo: 8, d: 28 });
  assert.equal(parseDate("nope"), null);
});

test("parseMoney treats -- as zero and keeps signs", () => {
  assert.equal(parseMoney("--"), 0);
  assert.equal(parseMoney("-$1.20"), -1.2);
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("the header row is found below the preamble and every row is read", () => {
  const { d, n } = sample();
  assert.ok(n.rows.length > 300);
  assert.equal(n.skipped.length, 0);
  assert.match(d.report.split("\n")[0], /Transaction report/);
});

test("a file without the expected columns is refused with the columns named", () => {
  assert.match(normalizeReport(parseCsv("a,b\n1,2")).error, /Transaction creation date/);
  assert.match(normalizeReport([]).error, /empty/);
});

test("classify puts each row type in one bucket", () => {
  const c = (type, description = "") => classify({ typeKey: type.toLowerCase(), descKey: description.toLowerCase() });
  assert.equal(c("Order"), "order");
  assert.equal(c("Refund"), "refund");
  assert.equal(c("Shipping label"), "labels");
  assert.equal(c("Payout"), "payout");
  assert.equal(c("Other fee", "Promoted Listings - Standard fee"), "ads");
  assert.equal(c("Other fee", "Insertion fee"), "listing");
  assert.equal(c("Other fee", "Store subscription fee"), "subscription");
  assert.equal(c("Other fee", "International fee"), "international");
  assert.equal(c("Claim"), "disputes");
  assert.equal(c("Other fee", "something new"), "other");
});

test("the waterfall reconciles to the sum of every non-payout net amount", () => {
  const { n, costs } = sample();
  const r = analyze(n.rows, { costs });
  const nonPayout = n.rows.filter((x) => classify(x) !== "payout").reduce((a, x) => a + x.net, 0);
  assert.ok(Math.abs(nonPayout - r.summary.operating) < 0.01, `${nonPayout} vs ${r.summary.operating}`);
  assert.ok(Math.abs(r.months.reduce((a, m) => a + m.net, 0) - r.summary.operating) < 0.01);
});

test("payouts are excluded, not counted as costs", () => {
  const { n } = sample();
  assert.equal(analyze(n.rows).summary.payouts, 1200);
});

test("per-item net sums to the attributed net and shop-level rows stay separate", () => {
  const { n, costs } = sample();
  const r = analyze(n.rows, { costs });
  const itemNet = r.items.reduce((a, l) => a + l.net, 0);
  assert.ok(Math.abs(itemNet - r.summary.attributedNet) < 0.01);
  assert.ok(r.summary.shopLevel < 0); // store subscription and insertion fees
  assert.equal(r.items.length, 4);
});

test("label, refund and ad rows are tied to the item through the order number", () => {
  const t = [
    "Transaction creation date,Type,Order number,Net amount,Item ID,Item title,Quantity,Item subtotal,Shipping and handling,Final value fee - fixed,Final value fee - variable,Description",
    "Sep 1 2026,Order,01-1,$86.00,111,Camera,1,$100.00,$0.00,-$0.40,-$13.60,",
    "Sep 1 2026,Shipping label,01-1,-$8.00,111,,,,,,,Label",
  ].join("\n");
  const n = normalizeReport(parseCsv(t));
  assert.equal(n.error, null);
  const r = analyze(n.rows, { costs: { Camera: 40 } });
  assert.equal(r.items[0].labels, -8);
  assert.ok(Math.abs(r.items[0].net - 78) < 0.001);
  assert.ok(Math.abs(r.items[0].profit - 38) < 0.001);
  assert.equal(r.summary.buckets.taxAndAdjustments, 0);
});

test("tax and other differences between Net amount and the fee columns are shown, not lost", () => {
  const t = [
    "Transaction creation date,Type,Order number,Net amount,Item title,Quantity,Item subtotal,Shipping and handling,Final value fee - fixed,Final value fee - variable",
    "Sep 1 2026,Order,01-1,$100.00,Thing,1,$90.00,$0.00,-$0.30,-$9.00",
  ].join("\n");
  const r = analyze(normalizeReport(parseCsv(t)).rows);
  assert.ok(Math.abs(r.summary.buckets.taxAndAdjustments - 19.3) < 0.001);
  assert.ok(Math.abs(r.summary.operating - 100) < 0.001);
});

test("a fully refunded order returns its unit to stock unless told otherwise", () => {
  const { n, costs } = sample();
  const on = analyze(n.rows, { costs, returnsResellable: true });
  const off = analyze(n.rows, { costs, returnsResellable: false });
  assert.ok(on.summary.cogsTotal < off.summary.cogsTotal);
});

test("unit costs match by title or custom label; items without one stay out of profit", () => {
  const { n } = sample();
  const first = analyze(n.rows).items[0];
  const byLabel = analyze(n.rows, { costs: { [first.label]: 10 } });
  assert.equal(byLabel.items.find((x) => x.name === first.name).cost, 10);
  assert.equal(byLabel.summary.allCosted, false);
  assert.equal(byLabel.items.filter((x) => x.profit === null).length, 3);
});

test("findings surface free-shipping label gap, refunds and ads on the sample", () => {
  const { n, costs } = sample();
  const titles = analyze(n.rows, { costs }).findings.map((f) => f.title).join("|");
  assert.match(titles, /kept .*% of sales/);
  assert.match(titles, /more on shipping labels than buyers paid/);
});

test("no rows means an explicit invalid result", () => {
  assert.ok(analyze([]).invalid);
});

test("parseCosts reads name,cost lines with commas in the name and reports bad lines", () => {
  const c = parseCosts("name,cost\nWidget, large,4.50\nbad line\nGadget,$2");
  assert.equal(c.costs["Widget, large"], 4.5);
  assert.equal(c.costs.Gadget, 2);
  assert.deepEqual(c.bad, [3]);
});
