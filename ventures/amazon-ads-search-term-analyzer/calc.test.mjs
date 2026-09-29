import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseDate, detectDmy, detectDelimiter, decodeBuffer, normalizeRows, analyze, clicksNeeded, negativesCsv, termsCsv, sampleCsv } from "./calc.mjs";

const HEAD = "Campaign Name,Ad Group Name,Targeting,Match Type,Customer Search Term,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));

test("numbers and dates in Amazon's formats", () => {
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("0.00"), 0);
  assert.equal(parseNumber("1.234,56", true), 1234.56);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.equal(parseDate("Sep 01 2026"), Date.UTC(2026, 8, 1));
  assert.equal(parseDate("September 28, 2026"), Date.UTC(2026, 8, 28));
  assert.equal(parseDate("2026-09-03"), Date.UTC(2026, 8, 3));
  assert.equal(parseDate("25/09/2026", true), Date.UTC(2026, 8, 25));
  assert.ok(Number.isNaN(parseDate("Foo 01 2026")));
  assert.equal(detectDmy(["25/09/2026"]), true);
});

test("delimiter sniffing and UTF-16", () => {
  assert.equal(detectDelimiter("a\tb\nc\td"), "\t");
  const s = "Customer Search Term,Spend";
  const buf = new Uint8Array([0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(buf.buffer), s);
});

test("header is found after preamble rows, totals rows are ignored, currency column is read", () => {
  const n = normalizeRows(parseCsv("Sponsored Products report\n\nStart Date,End Date,Currency,Campaign Name,Customer Search Term,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\nSep 01 2026,Sep 28 2026,GBP,C,red shoes,\"1,000\",\"250.00\",\"900.00\",30\n,,,,,\"1,000\",\"250.00\",\"900.00\",30\n"));
  assert.equal(n.error, null);
  assert.equal(n.currency, "GBP");
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].clicks, 1000);
  assert.equal(n.totalsRows, 1);
  assert.deepEqual(n.period, { from: "2026-09-01", to: "2026-09-28", days: 28 });
});

test("missing columns give a specific message rather than a guess", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("Customer Search Term,Spend\nfoo,1")).error, /No Clicks/);
  assert.match(normalizeRows(parseCsv("Customer Search Term,Spend,Clicks\nfoo,1,2")).error, /No orders/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("unreadable rows are skipped with line numbers, not zeroed", () => {
  const n = load("C,G,kw,broad,ok term,100,10,5.00,20.00,2\nC,G,kw,broad,bad term,100,10,abc,0,0\n");
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped, [{ line: 3, reason: "unreadable spend" }]);
});

test("clicksNeeded grows as the conversion rate falls", () => {
  assert.equal(clicksNeeded(0.1), 29);
  assert.ok(clicksNeeded(0.02) > clicksNeeded(0.1));
  assert.equal(clicksNeeded(0), Infinity);
  assert.equal(clicksNeeded(0.9), 5);
});

test("refuses files that record no orders or no spend", () => {
  assert.match(analyze(load("C,G,k,broad,t,100,10,5,0,0\n").rows).invalid, /no orders or sales/);
  assert.match(analyze(load("C,G,k,broad,t,100,10,0,10,1\n").rows).invalid, /no spend/);
  assert.match(analyze([]).invalid, /No search terms/);
});

const body = [
  // account: 125 clicks / 10 orders -> 8% rate, needed = 36 clicks
  "C1,G1,kw,broad,winner one,1000,40,30.00,300.00,6",
  "C1,G1,kw,broad,winner two,800,30,20.00,200.00,4",
  "C1,G1,kw,broad,proven waste,500,40,40.00,0.00,0",
  "C1,G1,kw,broad,overspent waste,200,12,20.00,0.00,0",
  "C1,G1,kw,broad,thin waste,50,3,1.50,0.00,0",
].join("\n") + "\n";

test("wasted spend is graded proven, overspent, watch, and reconciles to total spend", () => {
  const n = load(body);
  const r = analyze(n.rows, { breakEvenAcos: 0.3 });
  const s = r.summary;
  assert.equal(s.spend, 111.5);
  const tier = Object.fromEntries(r.zero.map((z) => [z.term, z.tier]));
  assert.deepEqual(tier, { "proven waste": "proven", "overspent waste": "overspent", "thin waste": "watch" });
  const total = r.buckets.withOrders + r.buckets.proven + r.buckets.overspent + r.buckets.watch;
  assert.ok(Math.abs(total - s.spend) < 1e-9);
  assert.ok(Math.abs(s.zeroSpend - 61.5) < 1e-9);
  // one order carries AOV 50 * 30% = 15; 20.00 > 15 so it is overspent, 1.50 is not
  assert.equal(s.orderCost, 15);
});

test("without a break-even the account ACOS is the yardstick and the tool says so", () => {
  const r = analyze(load(body).rows);
  assert.equal(r.summary.breakEvenAcos, null);
  assert.ok(r.findings.some((f) => /No break-even ACOS/.test(f.title)));
});

test("high-ACOS converting terms are found against break-even, with excess spend", () => {
  const rows = load("C,G,kw,broad,pricey,500,50,60.00,100.00,2\nC,G,kw,broad,fine,500,50,10.00,100.00,3\nC,G,kw,broad,few clicks,50,4,9.00,10.00,1\n").rows;
  const r = analyze(rows, { breakEvenAcos: 0.3 });
  assert.deepEqual(r.highAcos.map((a) => a.term), ["pricey"]);
  assert.ok(Math.abs(r.highAcos[0].excess - 30) < 1e-9); // 60 - 100 * 0.30
});

test("harvest candidates are good converters not already exact-targeted", () => {
  const rows = load("C,G,kw,broad,good broad,500,50,10.00,100.00,4\nC,G,good exact,exact,good exact,500,50,10.00,100.00,4\nC,G,kw,broad,one order,500,50,10.00,100.00,1\n").rows;
  const r = analyze(rows, { breakEvenAcos: 0.3 });
  assert.deepEqual(r.harvest.map((a) => a.term), ["good broad"]);
});

test("the same term in two ad groups is kept separate so negatives land in the right place", () => {
  const rows = load("C1,G1,kw,broad,shoes,500,50,10.00,100.00,4\nC2,G2,kw,broad,Shoes,500,50,10.00,0.00,0\n").rows;
  const r = analyze(rows, { breakEvenAcos: 0.3 });
  assert.equal(r.entries.length, 2);
  assert.equal(r.zero.length, 1);
  assert.equal(r.zero[0].campaign, "C2");
});

test("negatives export lists only proven and overspent terms, csv-quoted", () => {
  const r = analyze(load(body.replace("proven waste", '"proven ""waste"", inc"')).rows, { breakEvenAcos: 0.3 });
  const lines = negativesCsv(r).split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1], /"proven ""waste"", inc"/);
  assert.doesNotMatch(negativesCsv(r), /thin waste/);
  assert.match(termsCsv(r), /no_orders_proven/);
});

test("the built-in example parses, reconciles and shows every kind of finding", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.error, null);
  assert.equal(n.rows.length, 15);
  const r = analyze(n.rows, { breakEvenAcos: 0.3 });
  assert.ok(r.zero.some((z) => z.tier === "proven"));
  assert.ok(r.highAcos.length > 0);
  assert.ok(r.harvest.length > 0);
  const total = Object.values(r.buckets).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - r.summary.spend) < 1e-6);
  assert.equal(sampleCsv(), sampleCsv());
});
