import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, normalizeRows, analyze, classifyTx, classifyProduct, parseRates, sampleCsv } from "./calc.mjs";

const HEAD = "Transaction Date,Transaction Type,Product Title,Product Type,Buyer Country,Buyer Currency,Amount (Buyer Currency),Merchant Currency,Amount (Merchant Currency)";
const r = (date, type, title, ptype, cc, amt, cur = "USD") => [date, type, title, ptype, cc, cur, amt, cur, amt].join(",");
const load = (body, head = HEAD) => {
  const text = head + "\n" + body;
  const n = normalizeRows(parseCsv(text, detectDelimiter(text)));
  assert.ok(!n.error, n.error);
  return n;
};

test("transaction wording maps to a kind", () => {
  assert.equal(classifyTx("Charge"), "charge");
  assert.equal(classifyTx("Charge refund"), "refund");
  assert.equal(classifyTx("Google fee"), "fee");
  assert.equal(classifyTx("Google fee refund"), "feeRefund");
  assert.equal(classifyTx("Tax"), "tax");
  assert.equal(classifyTx("Tax refund"), "taxRefund");
  assert.equal(classifyTx("Refund"), "refund");
  assert.equal(classifyTx(""), "none");
});

test("product types map to app, in-app, subscription", () => {
  assert.equal(classifyProduct("inapp"), "in-app");
  assert.equal(classifyProduct("subscription"), "subscription");
  assert.equal(classifyProduct("app"), "app");
  assert.equal(classifyProduct(""), "unspecified");
});

test("a report without transaction and amount columns is rejected with a message naming them", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /Transaction Type/);
});

test("fees come from fee rows: net is charges minus refunds minus fees, and the rate is over net charges", () => {
  const n = load([
    r("2026-01-05", "Charge", "A", "app", "US", "10.00"),
    r("2026-01-05", "Google fee", "A", "app", "US", "-3.00"),
    r("2026-01-06", "Charge", "A", "app", "US", "10.00"),
    r("2026-01-06", "Google fee", "A", "app", "US", "-3.00"),
    r("2026-01-07", "Charge refund", "A", "app", "US", "-10.00"),
    r("2026-01-07", "Google fee refund", "A", "app", "US", "3.00"),
  ].join("\n"));
  const s = analyze(n.rows).summary;
  assert.equal(s.charges, 20);
  assert.equal(s.refunds, 10);
  assert.equal(s.fees, 3);
  assert.equal(s.net, 7);
  assert.equal(s.feeRate, 0.3);
  assert.equal(s.refundRate, 0.5);
  assert.equal(s.feeEstimated, false);
});

test("without fee rows fees are a labelled estimate at the typed percentage", () => {
  const n = load([r("2026-01-05", "Charge", "A", "app", "US", "100.00"), r("2026-01-06", "Charge", "A", "app", "US", "100.00")].join("\n"));
  const a = analyze(n.rows, { feePct: 15 });
  assert.equal(a.summary.feeEstimated, true);
  assert.equal(a.summary.fees, 30);
  assert.equal(a.summary.net, 170);
  assert.ok(a.findings.some((f) => /estimate/.test(f.title)));
  assert.match(analyze(n.rows, { feePct: 120 }).invalid, /fee percentage/);
});

test("an Estimated sales report with positive refund amounts still subtracts refunds", () => {
  const head = "Order Charged Date,Financial Status,Product Title,Product Type,Country of Buyer,Sale Currency,Charged Amount";
  const n = load(["2026-01-05,Charged,A,app,US,USD,10.00", "2026-01-06,Refund,A,app,US,USD,10.00", "2026-01-07,Charged,A,app,US,USD,10.00"].join("\n"), head);
  const a = analyze(n.rows, { feePct: 0 });
  assert.equal(a.summary.charges, 20);
  assert.equal(a.summary.refunds, 10);
  assert.equal(a.summary.net, 10);
});

test("a second merchant currency without a rate is excluded and named, and included once typed", () => {
  const n = load([
    r("2026-01-05", "Charge", "A", "app", "US", "10.00", "USD"),
    r("2026-01-05", "Charge", "A", "app", "DE", "9.00", "EUR"),
    r("2026-01-06", "Charge", "A", "app", "US", "10.00", "USD"),
  ].join("\n"));
  const a = analyze(n.rows, { feePct: 0 });
  assert.equal(a.summary.base, "USD");
  assert.deepEqual(a.excluded, [{ currency: "EUR", rows: 1 }]);
  assert.equal(a.findings[0].severity, "high");
  assert.equal(analyze(n.rows, { feePct: 0, rates: "EUR=1.1" }).summary.charges, 29.9);
  assert.match(analyze(n.rows, { rates: "bad" }).invalid, /Could not read/);
  assert.deepEqual(parseRates("eur=1.08, GBP:1.27").rates, { EUR: 1.08, GBP: 1.27 });
});

test("group tables reconcile to the summary net", () => {
  const n = normalizeRows(parseCsv(sampleCsv(), ","));
  assert.ok(!n.error);
  const a = analyze(n.rows);
  for (const key of ["byType", "byProduct"]) {
    assert.ok(Math.abs(a[key].reduce((s, g) => s + g.net, 0) - a.summary.net) < 1e-6, key);
  }
  const all = analyze(n.rows);
  assert.ok(Math.abs(all.byMonth.reduce((s, g) => s + g.net, 0) - all.summary.net) < 1e-6);
});

test("the worked example shows the reduced 15% tier on subscriptions and 30% elsewhere", () => {
  const a = analyze(normalizeRows(parseCsv(sampleCsv(), ",")).rows);
  const sub = a.byType.find((g) => g.key === "subscription");
  const app = a.byType.find((g) => g.key === "app");
  assert.ok(Math.abs(sub.feeRate - 0.15) < 0.005);
  assert.ok(Math.abs(app.feeRate - 0.3) < 0.005);
  assert.ok(a.trend && a.trend.recent > a.trend.prior);
});

test("a product with a high refund rate is flagged only with at least five charges", () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(r("2026-01-05", "Charge", "Big", "inapp", "US", "5.00"));
  for (let i = 0; i < 3; i++) rows.push(r("2026-01-06", "Charge refund", "Big", "inapp", "US", "-5.00"));
  for (let i = 0; i < 3; i++) rows.push(r("2026-01-05", "Charge", "Tiny", "inapp", "US", "5.00"));
  rows.push(r("2026-01-06", "Charge refund", "Tiny", "inapp", "US", "-5.00"));
  const a = analyze(load(rows.join("\n")).rows, { feePct: 0 });
  assert.ok(a.findings.some((f) => /Big has 50% refunds/.test(f.title)));
  assert.ok(!a.findings.some((f) => /Tiny has/.test(f.title)));
});

test("total rows and repeated headers are skipped and reported", () => {
  const n = load([r("2026-01-05", "Charge", "A", "app", "US", "5.00"), "Total,,,,,,5", HEAD].join("\n"));
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.reason).sort(), ["repeated header", "total row"]);
});
