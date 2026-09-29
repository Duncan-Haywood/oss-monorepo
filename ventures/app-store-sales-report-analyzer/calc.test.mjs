import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, classifyType, parseRates, normalizeRows, analyze, sampleTsv } from "./calc.mjs";

const HEAD = ["Title", "SKU", "Product Type Identifier", "Units", "Developer Proceeds", "Begin Date", "Country Code", "Currency of Proceeds", "Customer Currency", "Customer Price", "Proceeds Reason", "Parent Identifier"].join("\t") + "\n";
const row = (title, sku, type, units, proceeds, date, cc, cur, price = 0, reason = "", parent = "") => [title, sku, type, units, proceeds, date, cc, cur, cur, price, reason, parent].join("\t") + "\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body, "\t"));
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("Apple product type identifiers are classified", () => {
  assert.equal(classifyType("1F"), "app");
  assert.equal(classifyType("1"), "app");
  assert.equal(classifyType("7F"), "update");
  assert.equal(classifyType("IA1"), "inapp");
  assert.equal(classifyType("IAY"), "subscription");
  assert.equal(classifyType(""), "other");
});

test("no recognisable header gives a plain error; empty file too", () => {
  assert.match(normalizeRows(parseCsv("foo\tbar\n1\t2\n", "\t")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("delimiter is detected for tab and comma exports", () => {
  assert.equal(detectDelimiter(HEAD + row("A", "a", "1", 1, 1, "01/02/2026", "US", "USD")), "\t");
  assert.equal(detectDelimiter("Title,Units,Developer Proceeds\nA,1,2\n"), ",");
});

test("proceeds are units times per-unit proceeds and refunds subtract", () => {
  const n = load(row("App", "APP", "1F", 100, 0, "03/01/2026", "US", "USD") + row("Pro", "PRO", "IA1", 4, 7, "03/01/2026", "US", "USD", 9.99, "", "APP") + row("Pro", "PRO", "IA1", -1, 7, "03/02/2026", "US", "USD", 9.99, "", "APP"));
  const r = analyze(n.sales);
  near(r.summary.netBase, 21);
  near(r.summary.refundsBase, -7);
  near(r.summary.grossBase, 28);
  assert.equal(r.summary.downloads, 100);
  assert.equal(r.summary.soldUnits, 4);
  assert.equal(r.summary.refundUnits, 1);
  near(r.summary.refundRate, 0.25);
});

test("by-currency, by-kind, by-country and by-month all reconcile with the total", () => {
  const n = load(row("A", "A", "IA1", 2, 5, "01/05/2026", "US", "USD") + row("A", "A", "IAY", 3, 4, "02/05/2026", "GB", "GBP") + row("A", "A", "IA1", 1, 10, "02/09/2026", "DE", "EUR"));
  const r = analyze(n.sales, { rates: "GBP=1.25, EUR=1.1" });
  const total = 10 + 12 * 1.25 + 10 * 1.1;
  near(r.summary.netBase, total);
  near(r.byCurrency.reduce((t, c) => t + c.netBase, 0), total);
  near(r.byKind.reduce((t, k) => t + k.net, 0), total);
  near(r.byCountry.reduce((t, c) => t + c.net, 0), total);
  near(r.byMonth.reduce((t, m) => t + m.net, 0), total);
  near(r.byProduct.reduce((t, p) => t + p.net, 0), total);
});

test("a currency with no rate is flagged and excluded from totals, never guessed", () => {
  const n = load(row("A", "A", "IA1", 1, 10, "01/05/2026", "US", "USD") + row("A", "A", "IA1", 1, 900, "01/05/2026", "JP", "JPY"));
  const r = analyze(n.sales);
  near(r.summary.netBase, 10);
  assert.deepEqual(r.summary.unrated, ["JPY"]);
  assert.match(r.findings[0].title, /No exchange rate for JPY/);
  near(analyze(n.sales, { rates: "JPY=0.007" }).summary.netBase, 16.3);
});

test("bad exchange rates and reporting currency are rejected with a plain message", () => {
  const n = load(row("A", "A", "IA1", 1, 1, "01/05/2026", "US", "USD"));
  assert.match(analyze(n.sales, { rates: "EUR=abc" }).invalid, /Could not read the exchange rate/);
  assert.match(analyze(n.sales, { rates: "EUR=0" }).invalid, /Could not read/);
  assert.match(analyze(n.sales, { baseCurrency: "dollars" }).invalid, /three-letter/);
});

test("rates parse in the forms people type", () => {
  const { map } = parseRates("eur=1.08, GBP 1.27\nJPY:0.0067");
  assert.equal(map.get("EUR"), 1.08);
  assert.equal(map.get("GBP"), 1.27);
  assert.equal(map.get("JPY"), 0.0067);
  assert.equal(map.get("USD"), 1);
});

test("a product's refund rate flags only when at least five units sold", () => {
  const few = analyze(load(row("A", "A", "IA1", 3, 5, "01/05/2026", "US", "USD") + row("A", "A", "IA1", -2, 5, "01/06/2026", "US", "USD")).sales);
  assert.ok(!few.findings.some((f) => /refunded/.test(f.title) && f.severity === "high"));
  const many = analyze(load(row("A", "A", "IA1", 10, 5, "01/05/2026", "US", "USD") + row("A", "A", "IA1", -2, 5, "01/06/2026", "US", "USD")).sales);
  assert.ok(many.findings.some((f) => /20% of sold units were refunded/.test(f.title)));
});

test("proceeds share of price only compares rows whose currencies match", () => {
  const n = load(row("A", "A", "IA1", 10, 7, "01/05/2026", "US", "USD", 10) + row("A", "A", "IA1", 10, 1, "01/05/2026", "JP", "JPY", 1000).replace("\tJPY\tJPY\t", "\tJPY\tUSD\t"));
  near(analyze(n.sales, { rates: "JPY=1" }).summary.proceedsShare, 0.7, 0.001);
});

test("small business finding needs a proceeds-reason column and stays quiet when enrolled", () => {
  const paid = row("A", "A", "IA1", 10, 7, "01/05/2026", "US", "USD", 10, "Other");
  assert.ok(analyze(load(paid).sales).findings.some((f) => /Small Business Program/.test(f.title)));
  const enrolled = paid + row("A", "A", "IA1", 10, 8.5, "01/05/2026", "US", "USD", 10, "Small Business Program");
  assert.ok(!analyze(load(enrolled).sales).findings.some((f) => /Small Business Program/.test(f.title)));
  const noReason = load(row("A", "A", "IA1", 10, 7, "01/05/2026", "US", "USD", 10, ""));
  assert.ok(!analyze(noReason.sales).findings.some((f) => /Small Business Program/.test(f.title)));
});

test("total rows and non-numeric rows are skipped and named", () => {
  const n = load(row("A", "A", "IA1", 1, 1, "01/05/2026", "US", "USD") + "Total_Rows\t1\n" + row("B", "B", "IA1", "x", 1, "01/05/2026", "US", "USD"));
  assert.equal(n.sales.length, 1);
  assert.equal(n.skipped.length, 2);
});

test("day-first dates are read when unambiguous", () => {
  const n = load(row("A", "A", "IA1", 1, 1, "25/01/2026", "US", "USD"));
  assert.equal(n.dmy, true);
  assert.equal(new Date(n.sales[0].date).toISOString().slice(0, 10), "2026-01-25");
});

test("proceeds drop is reported from complete months only", () => {
  const body = row("A", "A", "IA1", 10, 10, "01/05/2026", "US", "USD") + row("A", "A", "IA1", 10, 5, "02/05/2026", "US", "USD") + row("A", "A", "IA1", 1, 1, "03/05/2026", "US", "USD");
  const r = analyze(load(body).sales);
  assert.ok(r.findings.some((f) => /fell 50% from 2026-01 to 2026-02/.test(f.title)));
});

test("the built-in sample parses cleanly and reconciles", () => {
  const t = sampleTsv();
  const n = normalizeRows(parseCsv(t, detectDelimiter(t)));
  assert.equal(n.error, undefined);
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.sales, { rates: "GBP=1.27,EUR=1.08,JPY=0.0067,BRL=0.19,INR=0.012" });
  assert.deepEqual(r.summary.unrated, []);
  near(r.byProduct.reduce((t, p) => t + p.net, 0), r.summary.netBase);
  assert.ok(r.summary.netBase > 0);
});
