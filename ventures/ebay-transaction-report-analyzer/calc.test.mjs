import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, normalizeReport, classify, analyze, parseCosts, sampleData } from "./calc.mjs";

const sample = () => {
  const d = sampleData();
  const n = normalizeReport(parseCsv(d.report));
  assert.equal(n.error, null);
  return { d, n, costs: parseCosts(d.costs).costs };
};

test("parseDate reads eBay's short month names, ISO and month-first slashes", () => {
  assert.deepEqual(parseDate("Sep 1, 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("Sep 01, 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("1 Sep 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("2026-09-01"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("09/30/2026"), { y: 2026, mo: 8, d: 30 });
  assert.equal(parseDate("nope"), null);
});

test("parseMoney treats -- as zero and keeps the sign", () => {
  assert.equal(parseMoney("--"), 0);
  assert.equal(parseMoney("-1.20"), -1.2);
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(5.00)"), -5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("the header is found below report metadata and the sample parses with no skipped rows", () => {
  const { n } = sample();
  assert.equal(n.skipped.length, 0);
  assert.ok(n.rows.length > 300);
});

test("bad files give a helpful error and unreadable rows are listed by line", () => {
  assert.match(normalizeReport(parseCsv("a,b\n1,2")).error, /No header row/);
  const csv = 'Transaction creation date,Type,Order number,Net amount,Item ID\nnot a date,Order,1,5.00,9\n"Sep 1, 2026",Order,2,abc,9\n"Sep 2, 2026",Order,3,7.00,9';
  const n = normalizeReport(parseCsv(csv));
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [2, 3]);
});

test("classify keeps ads out of other fees and leaves payouts out of the money", () => {
  const c = (type, description = "") => classify({ typeKey: type.toLowerCase(), description });
  assert.equal(c("Order"), "sale");
  assert.equal(c("Shipping label"), "labels");
  assert.equal(c("Other fee", "Promoted Listings - General fee"), "ads");
  assert.equal(c("Other fee", "Insertion fee"), "listing");
  assert.equal(c("Other fee", "Store subscription"), "subscription");
  assert.equal(c("Refund"), "refund");
  assert.equal(c("Payout"), "payout");
  assert.equal(c("Claim"), "disputes");
  assert.equal(c("Other fee", "Mystery"), "otherfee");
});

test("the waterfall ties back to the Net amount column, payouts aside", () => {
  const { n } = sample();
  const r = analyze(n.rows);
  const net = n.rows.filter((x) => classify(x) !== "payout").reduce((a, x) => a + x.net, 0);
  assert.ok(Math.abs(r.summary.operating - net) < 0.01, `${r.summary.operating} vs ${net}`);
  assert.equal(r.summary.payouts, 2000);
});

test("per-item net across items equals the order-attributed net", () => {
  const { n } = sample();
  const r = analyze(n.rows);
  const sum = r.items.reduce((a, x) => a + x.net, 0);
  assert.ok(Math.abs(sum - r.summary.attributedNet) < 0.01);
  assert.equal(r.items.length, 4);
});

test("costs turn into profit, and the Millennium Falcon resale loses money", () => {
  const { n, costs } = sample();
  const r = analyze(n.rows, { costs });
  assert.equal(r.summary.allCosted, true);
  const falcon = r.items.find((i) => i.name.includes("Millennium"));
  assert.ok(falcon.profit < 0);
  assert.ok(r.findings.some((f) => /lose money/.test(f.title)));
  assert.ok(Math.abs(r.summary.profit - (r.summary.operating - r.summary.cogsTotal)) < 0.01);
});

test("costs can be matched by custom label or item number", () => {
  const { n } = sample();
  const byLabel = analyze(n.rows, { costs: { "APP-J001L": 22 } });
  assert.ok(byLabel.items.find((i) => i.label === "APP-J001L").profit !== null);
  const byId = analyze(n.rows, { costs: { "134500000004": 3.1 } });
  assert.ok(byId.items.find((i) => i.itemId === "134500000004").profit !== null);
});

test("without costs there is no profit and the tool says why", () => {
  const { n } = sample();
  const r = analyze(n.rows);
  assert.equal(r.summary.profit, null);
  assert.ok(r.findings.some((f) => /Enter your unit costs/.test(f.title)));
});

test("a fully refunded order returns units to stock only when asked", () => {
  const csv = [
    "Transaction creation date,Type,Order number,Net amount,Item ID,Item title,Quantity,Item subtotal,Shipping and handling,Final Value Fee - fixed,Final Value Fee - variable",
    '"Sep 1, 2026",Order,A-1,86.70,1,Widget,1,100.00,0.00,-0.40,-12.90',
    '"Sep 3, 2026",Refund,A-1,-86.70,1,,,,,,',
    '"Sep 1, 2026",Order,A-2,86.70,1,Widget,1,100.00,0.00,-0.40,-12.90',
    '"Sep 1, 2026",Order,A-3,86.70,1,Widget,1,100.00,0.00,-0.40,-12.90',
  ].join("\n");
  const rows = normalizeReport(parseCsv(csv)).rows;
  const a = analyze(rows, { costs: { Widget: 50 }, returnsResellable: true });
  const b = analyze(rows, { costs: { Widget: 50 }, returnsResellable: false });
  assert.equal(a.items[0].unitsRefunded, 1);
  assert.equal(a.items[0].cogs, 100);
  assert.equal(b.items[0].cogs, 150);
});

test("fee columns count as costs whatever sign the export gives them", () => {
  const mk = (sign) => [
    "Transaction creation date,Type,Order number,Net amount,Item ID,Item title,Item subtotal,Final Value Fee - fixed,Final Value Fee - variable",
    `"Sep 1, 2026",Order,A-1,86.7,1,Widget,100,${sign}0.40,${sign}12.90`,
  ].join("\n");
  const neg = analyze(normalizeReport(parseCsv(mk("-"))).rows);
  const pos = analyze(normalizeReport(parseCsv(mk(""))).rows);
  assert.ok(Math.abs(neg.summary.feeBuckets.fvf - -13.3) < 1e-9);
  assert.ok(Math.abs(pos.summary.feeBuckets.fvf - -13.3) < 1e-9);
});

test("shipping charged vs label spend, performance fees and empty input are handled", () => {
  const { n } = sample();
  const r = analyze(n.rows);
  assert.ok(r.summary.shippingGap < 0);
  assert.ok(r.findings.some((f) => /Shipping cost you/.test(f.title)));
  const csv = [
    'Transaction creation date,Type,Order number,Net amount,Item ID,Item title,Item subtotal,"Very high ""not as described"" fee"',
    '"Sep 1, 2026",Order,A-1,90.00,1,Widget,100,-10.00',
  ].join("\n");
  const p = analyze(normalizeReport(parseCsv(csv)).rows);
  assert.equal(p.summary.feeBuckets.penalty, -10);
  assert.ok(p.findings.some((f) => /performance fees/.test(f.title)));
  assert.equal(analyze([]).invalid, "No usable transaction rows.");
});

test("parseCosts reads title,cost lines with commas in the title and reports bad lines", () => {
  const { costs, bad } = parseCosts('item,cost\n"Lot, 100ct",3.50\nWidget,abc\njunk');
  assert.equal(costs["Lot, 100ct"], 3.5);
  assert.deepEqual(bad, [3, 4]);
});
