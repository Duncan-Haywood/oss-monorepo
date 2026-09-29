import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, decodeBuffer, normalizeRows, parseCostList, analyze, summaryText, sampleCsv, commissionFor, FLAT_FEE, PERCENT_RATE, COMMISSION_THRESHOLD, BREAK_EVEN_PRICE } from "./calc.mjs";
import * as fee from "../poshmark-fee-calculator/calc.mjs";

const HEAD = "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price,Poshmark Fee,Net Earnings\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("fee constants and commission rule stay identical to the poshmark-fee-calculator", () => {
  assert.equal(FLAT_FEE, fee.FLAT_FEE);
  assert.equal(PERCENT_RATE, fee.PERCENT_RATE);
  assert.equal(COMMISSION_THRESHOLD, fee.COMMISSION_THRESHOLD);
  assert.equal(BREAK_EVEN_PRICE, fee.BREAK_EVEN_PRICE);
  for (const p of [1, 2.95, 5, 14.99, 15, 15.01, 40, 250]) assert.deepEqual(commissionFor(p), fee.commissionFor(p));
});

test("flat fee under $15, 20% at $15 or more, and never more than the price", () => {
  assert.equal(commissionFor(14.99).commission, 2.95);
  assert.equal(commissionFor(15).commission, 3);
  assert.equal(commissionFor(2).commission, 2);
  assert.equal(BREAK_EVEN_PRICE, 14.75);
});

test("CSV parsing handles quoted fields, delimiters, BOM and UTF-16", () => {
  const rows = parseCsv('a,b\n"Dress, blue","say ""hi"""\n');
  assert.deepEqual(rows[1], ["Dress, blue", 'say "hi"']);
  assert.equal(parseCsv("﻿x,y\r\n1,2\r\n")[0][0], "x");
  assert.equal(detectDelimiter("a;b\n1;2"), ";");
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(4.00)"), -4);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.equal(parseWhen("02/30/2026"), null);
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Order Date"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Order Date");
});

test("a row is read with brand, price, fee from the file and net earnings as payout", () => {
  const n = load('P1,2026-05-10,2026-04-20,Align leggings,Lululemon,LUL-1,$50.00,$10.00,$40.00\n');
  assert.equal(n.feeSource, "column");
  const [x] = n.items;
  assert.equal(x.brand, "Lululemon");
  assert.equal(x.price, 50);
  assert.equal(x.fee, 10);
  assert.equal(x.payout, 40);
  assert.equal(x.shippingLoss, 0);
});

test("without a fee column the published schedule is applied", () => {
  const n = load("P1,2026-05-10,,Tee,Zara,,12.00\nP2,2026-05-11,,Coat,Zara,,100\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Sale Price\n");
  assert.equal(n.feeSource, "schedule");
  assert.deepEqual(n.items.map((x) => [x.fee, x.payout]), [[2.95, 9.05], [20, 80]]);
});

test("fee mode schedule ignores a fee column and fee mismatches are counted", () => {
  const body = "P1,2026-05-10,,Tee,Zara,,20.00,1.00,19.00\n";
  assert.equal(load(body).items[0].fee, 1);
  assert.equal(load(body, HEAD, { feeMode: "schedule" }).items[0].fee, 4);
  const r = analyze(load(body).items);
  assert.equal(r.summary.feeMismatches, 1);
  assert.ok(r.findings.some((f) => /differ from the published/.test(f.title)));
});

test("a gap between price minus fee and net earnings is detected as a shipping deduction", () => {
  const n = load("P1,2026-05-10,,Tee,Zara,,30.00,6.00,15.50\nP2,2026-05-11,,Tee,Zara,,30.00,6.00,24.00\n");
  near(n.items[0].shippingLoss, 8.5);
  assert.equal(n.items[1].shippingLoss, 0);
  const r = analyze(n.items);
  assert.equal(r.summary.shippingLossItems, 1);
  near(r.summary.shippingLoss, 8.5);
});

test("a seller shipping discount column reduces payout when no net column exists", () => {
  const n = load("P1,2026-05-10,,Tee,Zara,,30.00,2.00\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price,Seller Shipping Discount\n");
  assert.equal(n.items[0].fee, 6);
  assert.equal(n.items[0].payout, 22);
  assert.equal(n.items[0].shippingLoss, 2);
});

test("unreadable rows and total rows are skipped with a reason; cancelled, returned and refunded orders are left out and counted", () => {
  const n = load("P1,2026-05-10,,A,X,,20,4,16\nP2,2026-05-11,,B,X,,20,4,16\nTotal,,,,,,40,8,32\nP3,not a date,,C,X,,20,4,16\nP4,2026-05-12,,D,X,,zz,4,16\n",
    HEAD);
  assert.equal(n.items.length, 2);
  assert.deepEqual(n.skipped.map((s) => s.reason), ["total row", "date not readable", "price not readable"]);
  const s = load("P1,2026-05-10,20,4,16,Completed\nP2,2026-05-11,20,4,16,Returned\nP3,2026-05-12,20,4,16,Cancelled\n", "Order ID,Order Date,Order Price,Poshmark Fee,Net Earnings,Order Status\n");
  assert.equal(s.items.length, 1);
  assert.equal(s.excludedCount, 2);
});

test("errors are specific when no header or no sales are found", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
  assert.match(load("P1,x,,,,,5\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n").error, /No sales could be read/);
});

test("day-first dates are detected only when unambiguous", () => {
  const n = load("P1,25/05/2026,,A,X,,20\nP2,03/06/2026,,B,X,,20\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n");
  assert.equal(n.dmy, true);
  assert.equal(new Date(n.items[1].t).toISOString().slice(0, 10), "2026-06-03");
});

test("cost list parses pairs, skips a header line and reports bad lines", () => {
  const c = parseCostList("sku,cost\nLUL-1, $12.50\n\"Blue dress, long\";8\nbad\nZAR-2,abc\nNEG,-1");
  assert.equal(c.count, 2);
  assert.equal(c.map.get("lul-1"), 12.5);
  assert.equal(c.map.get("blue dress, long"), 8);
  assert.deepEqual(c.errors.map((e) => e.line), [4, 5, 6]);
});

test("per-item profit is payout minus cost, from the file column or a pasted list (list wins)", () => {
  const head = HEAD.trim() + ",Cost\n";
  const n = load("P1,2026-05-10,,A,X,S1,50,10,40,15\nP2,2026-05-11,,B,X,S2,20,4,16,\n", head);
  const r = analyze(n.items, { costList: "S1,20\nS2,5\nS9,1" });
  const [a, b] = r.items;
  assert.equal(a.cost, 20); assert.equal(a.costSource, "list"); assert.equal(a.profit, 20);
  assert.equal(b.cost, 5); assert.equal(b.profit, 11);
  assert.deepEqual(r.unmatched, ["s9"]);
  const noList = analyze(n.items);
  assert.equal(noList.items[0].profit, 25);
  assert.equal(noList.items[1].profit, null);
  assert.equal(noList.summary.costedItems, 1);
});

test("list entries can match by order id or exact title", () => {
  const n = load("ORD-7,2026-05-10,,Blue dress,X,,50,10,40\nP2,2026-05-11,,Red top,X,,20,4,16\n");
  const r = analyze(n.items, { costList: "ord-7,10\nRed  Top,3" });
  assert.deepEqual(r.items.map((x) => x.profit), [30, 13]);
});

test("effective fee rate: 29.5% on a $10 item, 20% at $15 and above", () => {
  const n = load("P1,2026-05-10,,A,X,,10\nP2,2026-05-10,,B,X,,15\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n");
  const r = analyze(n.items);
  near(r.items[0].effectiveFeeRate, 0.295, 1e-9);
  near(r.items[1].effectiveFeeRate, 0.2, 1e-9);
  near(r.summary.feeRate, 5.95 / 25, 1e-9);
});

test("flat-fee finding measures what 20% would have charged", () => {
  const n = load("P1,2026-05-10,,A,X,,10\nP2,2026-05-10,,B,X,,14.90\nP3,2026-05-10,,C,X,,40\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n");
  const r = analyze(n.items);
  assert.equal(r.summary.flatItems, 2);
  // $10: 2.95 - 2.00 = 0.95 more; $14.90: 2.95 - 2.98 is cheaper than 20%, so 0.
  near(r.summary.flatExtraVs20, 0.95);
});

test("days to sell needs a listed date not after the order date", () => {
  const n = load("P1,2026-05-10,2026-04-20,A,X,,20\nP2,2026-05-10,2026-05-12,B,X,,20\nP3,2026-05-10,,C,X,,20\nP4,2026-05-20,2026-01-01,D,X,,20\n",
    "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n");
  const r = analyze(n.items);
  assert.deepEqual(r.items.map((x) => x.daysToSell), [20, null, null, 139]);
  assert.equal(r.summary.daysItems, 2);
  near(r.summary.avgDays, 79.5);
  assert.ok(r.findings.some((f) => /more than 90 days/.test(f.title)));
});

test("brand and month rollups reconcile to the totals", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).items);
  for (const key of ["items", "price", "fee", "payout", "cost", "profit"]) {
    near(r.byBrand.reduce((s, b) => s + b[key], 0), r.summary[key], 0.02);
    near(r.byMonth.reduce((s, b) => s + b[key], 0), r.summary[key], 0.02);
  }
  assert.equal(r.summary.items, 40);
  near(r.summary.payout, r.summary.price - r.summary.fee - r.summary.shippingLoss, 0.02);
});

test("brands to stop sourcing need at least three costed sales and a total loss", () => {
  const head = HEAD.trim() + ",Cost\n";
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(`A${i},2026-05-1${i},,T,Loser,,10,2.95,7.05,9`);
  for (let i = 0; i < 2; i++) rows.push(`B${i},2026-05-1${i},,T,TwoOnly,,10,2.95,7.05,9`);
  for (let i = 0; i < 3; i++) rows.push(`C${i},2026-05-1${i},,T,Winner,,50,10,40,10`);
  const r = analyze(load(rows.join("\n") + "\n", head).items);
  assert.deepEqual(r.stopBrands.map((b) => b.label), ["Loser"]);
  assert.ok(r.findings.some((f) => /Consider not sourcing: Loser/.test(f.title)));
  assert.equal(r.worstItems[0].brand, "Loser");
  assert.equal(r.bestItems[0].brand, "Winner");
  assert.equal(r.rankBasis, "profit");
});

test("without any cost the tool says so, ranks by payout and falls back to fee-heavy brands", () => {
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(`A${i},2026-05-1${i},,T,Cheap,,8`);
  rows.push("B1,2026-05-11,,T,Dear,,80");
  const r = analyze(load(rows.join("\n") + "\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n").items);
  assert.equal(r.rankBasis, "payout");
  assert.equal(r.summary.profit, null);
  assert.ok(r.findings.some((f) => /No cost basis/.test(f.title)));
  assert.ok(r.findings.some((f) => /Fee takes 25% or more of the price: Cheap/.test(f.title)));
  assert.equal(r.bestItems[0].brand, "Dear");
});

test("date range filter keeps the end day and reports an empty range", () => {
  const n = load("P1,2026-05-10,,A,X,,20\nP2,2026-05-20,,B,X,,20\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n");
  assert.equal(analyze(n.items, { to: Date.UTC(2026, 4, 10) }).summary.items, 1);
  assert.match(analyze(n.items, { from: Date.UTC(2027, 0, 1) }).invalid, /No sales fall inside/);
});

test("missing brand is grouped rather than dropped", () => {
  const r = analyze(load("P1,2026-05-10,,A,,,20\n", "Order ID,Order Date,Listed Date,Listing Title,Brand,SKU,Order Price\n").items);
  assert.equal(r.byBrand[0].label, "(no brand)");
});

test("the copyable summary states totals, fees, profit and stop-sourcing brands", () => {
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).items);
  const t = summaryText(r);
  assert.match(t, /40 sales across 5 brand/);
  assert.match(t, /effective\)/);
  assert.match(t, /profit \$/);
  assert.match(t, /Consider not sourcing: Old Navy/);
  assert.match(t, /nothing uploaded/);
});

test("the built-in example is synthetic and parses without skipped rows", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.skipped.length, 0);
  assert.ok(n.items.every((x) => /^SAMPLE-/.test(x.id)));
});
