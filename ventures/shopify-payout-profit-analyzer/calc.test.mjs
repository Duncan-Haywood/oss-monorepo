import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, orderKey, normalizeTransactions, normalizeOrders, classify, analyze, parseCosts, sampleData } from "./calc.mjs";

// Column layouts follow Shopify's documented exports (Payments > Transactions;
// Orders > Export). Rows are synthetic, written by hand; not from a real shop.
const TX_HEAD = "Transaction Date,Type,Order,Card Brand,Card Source,Payout Status,Payout Date,Payout ID,Available On,Amount,Fee,Net,Checkout,Payment Method Name,Presentment Amount,Presentment Currency,Currency,Vat";
const OR_HEAD = "Name,Email,Financial Status,Paid at,Fulfillment Status,Currency,Subtotal,Shipping,Taxes,Total,Discount Code,Discount Amount,Payment Method,Refunded Amount,Lineitem quantity,Lineitem name,Lineitem price,Lineitem sku";

const sample = () => {
  const d = sampleData();
  const tx = normalizeTransactions(parseCsv(d.transactions));
  const or = normalizeOrders(parseCsv(d.orders));
  assert.equal(tx.error, null);
  assert.equal(or.error, null);
  return { d, tx, or, costs: parseCosts(d.costs).costs };
};

// A small shop whose every figure can be checked by hand.
const TX = [
  TX_HEAD,
  "2026-08-01 10:00:00 -0400,charge,#1001,visa,online,paid,,P1,2026-08-03,110.00,3.49,106.51,,visa,110.00,USD,USD,",
  "2026-08-02 10:00:00 -0400,charge,#1002,master,online,paid,,P1,2026-08-04,50.00,1.75,48.25,,master,50.00,USD,USD,",
  "2026-08-03 10:00:00 -0400,refund,#1002,master,online,paid,,P1,2026-08-05,-50.00,0.00,-50.00,,master,-50.00,USD,USD,",
  "2026-08-04 10:00:00 -0400,chargeback,#1001,visa,online,paid,,P1,2026-08-06,-110.00,15.00,-125.00,,visa,-110.00,USD,USD,",
  "2026-08-05 10:00:00 -0400,chargeback_won,#1001,visa,online,paid,,P1,2026-08-07,110.00,-15.00,125.00,,visa,110.00,USD,USD,",
  "2026-08-06 10:00:00 -0400,adjustment,,,,paid,,P1,2026-08-08,-4.00,0.00,-4.00,,,,USD,USD,",
  "2026-08-07 10:00:00 -0400,mystery_type,,,,paid,,P1,2026-08-08,-1.00,0.00,-1.00,,,,USD,USD,",
  "2026-08-31 10:00:00 -0400,payout,,,,paid,2026-08-31,P1,2026-08-31,100.00,0.00,100.00,,,,USD,USD,",
].join("\n");

const OR = [
  OR_HEAD,
  '#1001,a@x.com,paid,2026-08-01 10:00:00 -0400,fulfilled,USD,100.00,0.00,10.00,110.00,SAVE10,10.00,Shopify Payments,,2,"Widget",30.00,W-1',
  '#1001,,,,,,,,,,,,,,1,"Gadget",50.00,G-1',
  '#1002,b@x.com,paid,2026-08-02 10:00:00 -0400,fulfilled,USD,50.00,0.00,0.00,50.00,,0.00,Shopify Payments,50.00,1,"Gadget",50.00,G-1',
  '#1003,c@x.com,paid,2026-08-05 10:00:00 -0400,fulfilled,USD,20.00,0.00,0.00,20.00,,0.00,PayPal Express Checkout,,1,"Widget",20.00,W-1',
].join("\n");

test("parseDate reads Shopify's timestamp, ISO and month-first slashes", () => {
  assert.deepEqual(parseDate("2026-09-01 14:03:22 -0400"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("Sep 1, 2026"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("09/30/2026"), { y: 2026, mo: 8, d: 30 });
  assert.equal(parseDate("nope"), null);
});

test("parseMoney keeps signs, tolerates symbols and reports garbage as NaN", () => {
  assert.equal(parseMoney(""), 0);
  assert.equal(parseMoney("-12.50"), -12.5);
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(5.00)"), -5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("order names match with or without the hash", () => {
  assert.equal(orderKey("#1001"), orderKey(" 1001 "));
});

test("transactions without a Net column rebuild it as Amount minus Fee", () => {
  const csv = "Transaction Date,Type,Order,Amount,Fee\n2026-03-01,charge,#5,30.00,1.17";
  const n = normalizeTransactions(parseCsv(csv));
  assert.equal(round(n.rows[0].net), 28.83);
  assert.equal(round(n.rows[0].feeCost), 1.17);
});

test("bad files give a helpful error and unreadable rows are listed by line", () => {
  assert.match(normalizeTransactions(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeOrders(parseCsv("a,b\n1,2")).error, /Lineitem name/);
  const csv = "Transaction Date,Type,Order,Amount,Fee,Net\nnope,charge,#1,1,0,1\n2026-05-01,charge,#2,zz,0,1\n2026-05-01,charge,#3,1,0,1";
  const n = normalizeTransactions(parseCsv(csv));
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [2, 3]);
  assert.match(n.skipped[0].reason, /date/);
});

test("classify: reversals and disputes are not charges, unknown types fall to other", () => {
  const c = (t) => classify({ typeKey: t });
  assert.equal(c("charge"), "charge");
  assert.equal(c("refund"), "refund");
  assert.equal(c("chargeback"), "dispute");
  assert.equal(c("chargeback_won"), "dispute");
  assert.equal(c("dispute_reversal"), "dispute");
  assert.equal(c("adjustment"), "adjustment");
  assert.equal(c("reserved_funds"), "adjustment");
  assert.equal(c("payout"), "payout");
  assert.equal(c("payout_failure"), "adjustment");
  assert.equal(c("third_party_fee"), "gateway");
  assert.equal(c("shopify_capital_repayment"), "other");
});

test("hand-checked waterfall: every non-payout row lands in exactly one line", () => {
  const t = normalizeTransactions(parseCsv(TX));
  assert.equal(t.rows.length, 8);
  const a = analyze(t.rows, []);
  const b = a.summary.totals;
  assert.equal(round(b.charges), 160);
  assert.equal(round(b.processing), -5.24);
  assert.equal(round(b.refunds), -50);
  assert.equal(round(b.disputes), 0); // -110 then +110 won
  assert.equal(round(b.disputeFees), 0); // 15 fee then 15 back
  assert.equal(round(b.adjustments), -4);
  assert.equal(round(b.other), -1);
  assert.equal(round(a.summary.operating), 99.76);
  assert.equal(round(a.summary.payouts), 100);
  const counted = Object.values(a.summary.counts).reduce((x, y) => x + y, 0);
  assert.equal(counted, t.rows.length);
  assert.equal(a.summary.counts.payout, 1);
  assert.equal(a.summary.disputes.opened, 1);
  assert.equal(a.summary.disputes.won, 1);
});

test("net-to-bank per order sums fees, refunds and disputes onto the order", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const a = analyze(t.rows, []);
  const o1 = a.orders.find((o) => o.key === "1001");
  assert.equal(round(o1.net), 106.51); // charge, dispute and its win cancel
  const o2 = a.orders.find((o) => o.key === "1002");
  assert.equal(round(o2.net), -1.75); // refunded in full; fee not returned
  assert.equal(o2.fullyRefunded, true);
});

test("orders export: multi-line orders keep order-level fields from the first row", () => {
  const o = normalizeOrders(parseCsv(OR));
  assert.equal(o.orders.length, 3);
  const first = o.orders.find((x) => x.key === "1001");
  assert.equal(first.items.length, 2);
  assert.equal(first.code, "SAVE10");
  assert.equal(first.discount, 10);
  assert.equal(first.taxes, 10);
});

test("hand-checked product split: discount spread by line, tax removed, joined by order name", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const o = normalizeOrders(parseCsv(OR));
  const a = analyze(t.rows, o.orders, { costs: { Widget: 10, "G-1": 20 } });
  // #1001: lines Widget 2x30=60, Gadget 50; discount 10 -> 54.55 / 45.45 of 100.
  // Order net 106.51 minus 10 tax = 96.51.
  const w = a.products.find((p) => p.name === "Widget");
  const g = a.products.find((p) => p.name === "Gadget");
  assert.equal(r2(w.revenue), 54.55);
  assert.equal(r2(g.revenue), 95.45); // 45.45 in #1001 plus 50.00 in #1002
  assert.equal(r2(w.net), 52.64); // 96.51 * 54.545/100 (#1001 only)
  // Gadget also sold in #1002, fully refunded: net -1.75, unit returned to stock.
  assert.equal(g.units, 2);
  assert.equal(g.unitsRefunded, 1);
  assert.equal(r2(g.net), r2(96.51 * (45.4545 / 100) - 1.75));
  // costs by product name or SKU; refunded unit is not costed
  assert.equal(round(g.cogs), 20);
  assert.equal(round(w.cogs), 20);
  assert.equal(a.summary.unmatchedOrders, 1); // #1003 is PayPal: no charge in the file
  assert.equal(a.summary.otherGatewayOrders, 1);
  assert.equal(round(a.summary.otherGatewayTotal), 20);
});

test("returnsResellable off charges the cost of a refunded unit", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const o = normalizeOrders(parseCsv(OR));
  const a = analyze(t.rows, o.orders, { costs: { Gadget: 20 }, returnsResellable: false });
  assert.equal(round(a.products.find((p) => p.name === "Gadget").cogs), 40);
});

test("discount codes: cost, share and rate", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const o = normalizeOrders(parseCsv(OR));
  const a = analyze(t.rows, o.orders);
  assert.equal(a.codes.length, 1);
  assert.equal(a.codes[0].code, "SAVE10");
  assert.equal(round(a.codes[0].discount), 10);
  assert.equal(round(a.codes[0].pct), 0.0909);
  assert.equal(round(a.summary.discountTotal), 10);
});

test("effective fee rate by card brand and source", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const a = analyze(t.rows, []);
  const visa = a.cards.find((c) => c.key.startsWith("visa"));
  assert.equal(visa.key, "visa · online");
  assert.equal(round(visa.rate), 0.0317);
  assert.equal(a.cards.length, 2);
});

test("third-party rate gives an estimate outside the waterfall", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const o = normalizeOrders(parseCsv(OR));
  const a = analyze(t.rows, o.orders, { thirdPartyRate: 0.02 });
  assert.equal(round(a.summary.gatewayEstimate), 0.4);
  assert.equal(round(a.summary.operating), 99.76);
});

test("findings name chargebacks, unknown rows and the missing orders file", () => {
  const t = normalizeTransactions(parseCsv(TX));
  const a = analyze(t.rows, []);
  const titles = a.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /chargeback/);
  assert.match(titles, /does not recognise/);
  assert.match(titles, /Orders export/);
});

test("a row whose Net is not Amount minus Fee is counted with Net and flagged", () => {
  const csv = `${TX_HEAD}\n2026-08-01 10:00:00 -0400,charge,#1,visa,online,paid,,P,2026-08-03,100.00,3.00,90.00,,visa,100.00,USD,USD,`;
  const a = analyze(normalizeTransactions(parseCsv(csv)).rows, []);
  assert.equal(round(a.summary.operating), 90);
  assert.equal(a.summary.feeMismatch, 1);
  assert.equal(round(a.summary.totals.processing), -10);
});

test("sample shop: waterfall reconciles to the month totals and to the sum of row nets", () => {
  const { tx, or, costs } = sample();
  const a = analyze(tx.rows, or.orders, { costs });
  const nonPayout = tx.rows.filter((r) => classify(r) !== "payout");
  const netSum = nonPayout.reduce((x, r) => x + r.net, 0);
  assert.ok(Math.abs(a.summary.operating - netSum) < 0.005);
  assert.ok(Math.abs(a.months.reduce((x, m) => x + m.net, 0) - netSum) < 0.005);
  assert.ok(Math.abs(a.months.reduce((x, m) => x + m.charges + m.fees + m.refunds + m.disputes + m.other, 0) - netSum) < 0.005);
  assert.equal(Object.values(a.summary.counts).reduce((x, y) => x + y, 0), tx.rows.length);
  assert.equal(tx.skipped.length, 0);
  assert.equal(or.skipped.length, 0);
});

test("sample shop: products, codes, disputes and findings are produced", () => {
  const { tx, or, costs } = sample();
  const a = analyze(tx.rows, or.orders, { costs });
  assert.equal(a.products.length, 4);
  assert.ok(a.summary.allCosted);
  assert.ok(a.summary.profit < a.summary.operating);
  assert.ok(a.codes.length >= 2);
  assert.ok(a.summary.disputes.opened > 0 && a.summary.disputes.won > 0);
  assert.ok(a.summary.counts.other > 0);
  assert.ok(a.cards.length >= 3);
  assert.ok(a.findings.length >= 5);
  assert.equal(a.months.length, 4);
});

test("analyze on no rows is invalid, not a crash", () => {
  assert.ok(analyze([], []).invalid);
});

test("parseCosts reads name,cost lines and reports bad ones", () => {
  const c = parseCosts("name,cost\nWidget,10\n\"Big, Widget\",$4.50\nbad line\nGadget,-3");
  assert.equal(c.costs.Widget, 10);
  assert.equal(c.costs["Big, Widget"], 4.5);
  assert.deepEqual(c.bad, [4, 5]);
});

function r2(n) { return Math.round(n * 100) / 100; }
function round(n) { return Math.round(n * 10000) / 10000; }
