import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDate, parseMoney, normalizeRows, classify, analyze, parseCosts, sampleCsv, sampleCosts } from "./calc.mjs";

const load = (text, opts) => {
  const n = normalizeRows(parseCsv(text));
  assert.equal(n.error, null);
  return { n, r: analyze(n.rows, opts) };
};
const HEAD = "Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net,Tax Details";

test("parseDate reads Etsy's long month names, ISO and US slashes", () => {
  assert.deepEqual(parseDate("March 3, 2026"), { y: 2026, mo: 2, d: 3 });
  assert.deepEqual(parseDate("September 30, 2026"), { y: 2026, mo: 8, d: 30 });
  assert.deepEqual(parseDate("2026-09-01"), { y: 2026, mo: 8, d: 1 });
  assert.deepEqual(parseDate("09/30/2026"), { y: 2026, mo: 8, d: 30 });
  assert.equal(parseDate("nope"), null);
});

test("parseMoney treats Etsy's -- as empty and handles signs and separators", () => {
  assert.equal(parseMoney("--"), 0);
  assert.equal(parseMoney("-$1.63"), -1.63);
  assert.equal(parseMoney("$1,234.50"), 1234.5);
  assert.equal(parseMoney("(5.00)"), -5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("missing header gives a helpful error and bad rows are listed with line numbers", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /No header row/);
  const n = normalizeRows(parseCsv(`${HEAD}\nnope,Sale,x,,USD,$5.00,--,$5.00,--\n"March 1, 2026",Sale,Payment for Order #1234567,,USD,zzz,--,zzz,--\n"March 1, 2026",Sale,Payment for Order #1234567,,USD,$5.00,--,$5.00,--`));
  assert.equal(n.rows.length, 1);
  assert.equal(n.skipped.length, 2);
  assert.equal(n.skipped[0].line, 2);
});

test("classify sorts the statement's row kinds", () => {
  const k = (type, title, effect = -1) => classify({ typeKey: type.toLowerCase(), title, effect });
  assert.equal(k("Sale", "Payment for Order #1234567", 20), "sale");
  assert.equal(k("Fee", "Transaction fee: Mug"), "transaction");
  assert.equal(k("Fee", "Processing fee"), "processing");
  assert.equal(k("Fee", "Listing fee"), "listing");
  assert.equal(k("Fee", "Auto-renew sold"), "listing");
  assert.equal(k("Fee", "Offsite Ads Fee"), "offsite-ads");
  assert.equal(k("Marketing", "Etsy Ads"), "etsy-ads");
  assert.equal(k("Shipping", "USPS shipping label"), "shipping-labels");
  assert.equal(k("Fee", "Credit for transaction fee: Mug", 1), "fee-credit");
  assert.equal(k("Fee", "Regulatory operating fee"), "regulatory");
  assert.equal(k("Deposit", "Deposit to bank"), "payout");
  assert.equal(k("Refund", "Refund for Order #1234567"), "refund");
});

test("waterfall reconciles: sales + refunds + fees + labels equals what Etsy paid, deposits excluded", () => {
  const { n, r } = load(sampleCsv());
  const s = r.summary;
  const nonDeposit = n.rows.filter((x) => classify(x) !== "payout" && classify(x) !== "tax").reduce((a, x) => a + x.effect, 0);
  assert.ok(Math.abs(nonDeposit - s.operating) < 0.01);
  const monthNet = r.months.reduce((a, m) => a + m.net, 0);
  assert.ok(Math.abs(monthNet - s.operating) < 0.01);
  assert.ok(s.payouts < 0);
});

test("take rate excludes shipping labels; offsite ads counted per order", () => {
  const csv = [HEAD,
    '"March 1, 2026",Sale,Payment for Order #1000001,Order #1000001,USD,$100.00,--,$100.00,--',
    '"March 1, 2026",Fee,Transaction fee: Mug,Order #1000001,USD,-$6.50,--,-$6.50,--',
    '"March 1, 2026",Fee,Offsite Ads Fee,Order #1000001,USD,-$15.00,--,-$15.00,--',
    '"March 1, 2026",Shipping,USPS shipping label,Order #1000001,USD,-$9.00,--,-$9.00,--'].join("\n");
  const { r } = load(csv);
  assert.equal(r.summary.takeRate.toFixed(3), "0.215");
  assert.equal(r.summary.offsiteOrders, 1);
  assert.equal(r.summary.offsiteRate.toFixed(2), "0.15");
  assert.ok(r.findings.some((f) => /Offsite Ads took \$15/.test(f.title)));
  assert.equal(r.summary.operating, 69.5);
});

test("per-listing attribution uses single-item orders only and costs give profit", () => {
  const csv = [HEAD,
    '"March 1, 2026",Sale,Payment for Order #1000001,Order #1000001,USD,$20.00,--,$20.00,--',
    '"March 1, 2026",Fee,Transaction fee: Mug,Order #1000001,USD,-$1.30,--,-$1.30,--',
    '"March 2, 2026",Sale,Payment for Order #1000002,Order #1000002,USD,$50.00,--,$50.00,--',
    '"March 2, 2026",Fee,Transaction fee: Mug,Order #1000002,USD,-$1.30,--,-$1.30,--',
    '"March 2, 2026",Fee,Transaction fee: Plate,Order #1000002,USD,-$1.95,--,-$1.95,--'].join("\n");
  const { r } = load(csv, { costs: { Mug: 5 } });
  assert.equal(r.listings.length, 1);
  assert.equal(r.listings[0].title, "Mug");
  assert.equal(r.summary.multiItem.orders, 1);
  assert.equal(r.listings[0].profit, 20 - 1.3 - 5);
});

test("a listing with no cost shows no profit; shipping transaction fee is not a listing", () => {
  const csv = [HEAD,
    '"March 1, 2026",Sale,Payment for Order #1000001,Order #1000001,USD,$20.00,--,$20.00,--',
    '"March 1, 2026",Fee,Transaction fee: Mug,Order #1000001,USD,-$1.30,--,-$1.30,--',
    '"March 1, 2026",Fee,Transaction fee: Shipping,Order #1000001,USD,-$0.30,--,-$0.30,--'].join("\n");
  const { r } = load(csv);
  assert.equal(r.listings[0].profit, null);
  assert.equal(r.listings[0].fees, -1.6);
  assert.equal(r.summary.profit, null);
});

test("refund finding, unit costs parser and example", () => {
  const { r } = load(sampleCsv(), { costs: parseCosts(sampleCosts()).costs });
  assert.ok(r.findings.some((f) => /^Refunds returned/.test(f.title)));
  assert.equal(r.summary.anyCosted, true);
  assert.ok(r.summary.profit < r.summary.operating);
  const c = parseCosts("title,cost\nMug,4.5\nbad line\n\"Plate, large\",3");
  assert.equal(c.costs.Mug, 4.5);
  assert.equal(c.costs["Plate, large"], 3);
  assert.deepEqual(c.bad, [3]);
});

test("empty input is rejected without throwing", () => {
  assert.match(normalizeRows([]).error, /empty/);
  assert.ok(analyze([]).invalid);
});
