import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseWhen, detectDelimiter, decodeBuffer, normalizeRows, parseCostList, analyze, summaryText, sampleCsv, scheduleFee, DEFAULT_COMMISSION_RATE, DEFAULT_PAYMENT_RATE, DEFAULT_PAYMENT_FIXED } from "./calc.mjs";
import * as payout from "../whatnot-seller-payout/calc.mjs";

const HEAD = "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price,Commission,Processing Fee,Net Earnings\n";
const load = (body, head = HEAD, o) => normalizeRows(parseCsv(head + body), o);
const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("processing constants stay identical to the whatnot-seller-payout calculator", () => {
  assert.equal(DEFAULT_PAYMENT_RATE, payout.DEFAULT_PAYMENT_RATE);
  assert.equal(DEFAULT_PAYMENT_FIXED, payout.DEFAULT_PAYMENT_FIXED);
  assert.equal(DEFAULT_COMMISSION_RATE, payout.CATEGORY_PRESETS.standard.commissionRate);
});

test("commission is on the price and processing on price plus shipping plus tax plus 30 cents", () => {
  const f = scheduleFee(20, 5, 0);
  near(f.commission, 1.6);
  near(f.processing, 25 * 0.029 + 0.3);
  near(f.fee, 1.6 + 1.025);
  near(scheduleFee(100).fee, 8 + 100 * 0.029 + 0.3);
  near(scheduleFee(100, 0, 0, { commissionRate: 4 }).commission, 4);
});

test("CSV parsing handles quoted fields, delimiters, BOM and UTF-16", () => {
  const rows = parseCsv('a,b\n"Card, rare","say ""hi"""\n');
  assert.deepEqual(rows[1], ["Card, rare", 'say "hi"']);
  assert.equal(parseCsv("﻿x,y\r\n1,2\r\n")[0][0], "x");
  assert.equal(detectDelimiter("a;b\n1;2"), ";");
  assert.equal(parseNumber("$1,234.56"), 1234.56);
  assert.equal(parseNumber("(4.00)"), -4);
  assert.ok(Number.isNaN(parseNumber("n/a")));
  assert.equal(parseWhen("02/30/2026"), null);
  const u16 = new Uint8Array([0xff, 0xfe, ...[..."Order Date"].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(u16.buffer), "Order Date");
});

test("a row is read with show, category, fee columns summed and net earnings as payout", () => {
  const n = load("W1,2026-05-10,Holo rare,Friday Break,Trading cards,TC-1,$50.00,$4.00,$1.75,$44.25\n");
  assert.equal(n.feeSource, "column");
  const [x] = n.items;
  assert.equal(x.show, "Friday Break");
  assert.equal(x.category, "Trading cards");
  assert.equal(x.price, 50);
  assert.equal(x.fee, 5.75);
  assert.equal(x.payout, 44.25);
  assert.equal(x.deductions, 0);
});

test("a single fees column is used, and without any fee column the rates apply", () => {
  const one = load("W1,2026-05-10,Tee,,Vintage,,20,3.00\n", "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price,Total Fees\n");
  assert.equal(one.items[0].fee, 3);
  const none = load("W1,2026-05-10,Tee,,Vintage,,20\n", "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price\n");
  assert.equal(none.feeSource, "schedule");
  near(none.items[0].fee, 1.6 + 20 * 0.029 + 0.3);
  const custom = load("W1,2026-05-10,Tee,,Vintage,,20\n", "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price\n", { commissionRate: 4 });
  near(custom.items[0].fee, 0.8 + 20 * 0.029 + 0.3);
});

test("buyer shipping and tax columns raise the processing fee", () => {
  const n = load("W1,2026-05-10,Card,,,,20,5,0\n", "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price,Shipping Charged,Sales Tax\n");
  near(n.items[0].fee, 1.6 + 25 * 0.029 + 0.3);
});

test("fee mode schedule ignores fee columns and mismatches are counted", () => {
  const body = "W1,2026-05-10,Tee,,Vintage,,20.00,0.50,0.50,19.00\n";
  assert.equal(load(body).items[0].fee, 1);
  near(load(body, HEAD, { feeMode: "schedule" }).items[0].fee, 1.6 + 0.58 + 0.3);
  assert.equal(analyze(load(body).items).summary.feeMismatches, 1);
});

test("net earnings below price minus fees is an other deduction", () => {
  const n = load("W1,2026-05-10,Card,,,,50,4,1.75,39.25\n");
  assert.equal(n.items[0].payout, 39.25);
  near(n.items[0].deductions, 5);
  assert.equal(analyze(n.items).summary.deductionItems, 1);
});

test("cancelled, returned and refunded orders are left out and counted; bad rows are reported", () => {
  const n = load("W1,2026-05-10,A,,,,10,0,0,10\nW2,2026-05-11,B,,,,10,0,0,10\nTotal,,,,,,20\nW3,nope,C,,,,10\nW4,2026-05-12,D,,,,abc\nW5,2026-05-12,E,,,,0\n", "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price,Commission,Processing Fee,Net Earnings,Status\n");
  assert.equal(n.items.length, 2);
  assert.deepEqual(n.skipped.map((x) => x.reason), ["total row", "date not readable", "price not readable", "no sale price"]);
  const r = load("W1,2026-05-10,A,,,,10,0,0,10,Delivered\nW2,2026-05-11,B,,,,10,0,0,10,Cancelled\nW3,2026-05-11,B,,,,10,0,0,10,Refunded\n", HEAD.trim() + ",Status\n");
  assert.equal(r.items.length, 1);
  assert.equal(r.excludedCount, 2);
});

test("errors: empty file and no recognisable header", () => {
  assert.match(normalizeRows([]).error, /empty/);
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
});

test("day-first dates are detected only when unambiguous", () => {
  const n = load("W1,25/05/2026,A,,,,10\nW2,03/06/2026,B,,,,10\n", "Order ID,Order Date,Product Name,Show,Category,SKU,Sold Price\n");
  assert.equal(n.dmy, true);
  assert.equal(new Date(n.items[1].t).toISOString().slice(0, 10), "2026-06-03");
});

test("cost list parsing: header skipped, bad lines reported, pasted cost overrides the file's", () => {
  const p = parseCostList("sku,cost\nTC-1, 12.50\n\"Holo, rare\";3\nbad\nX,abc\nY,-1\n");
  assert.equal(p.count, 2);
  assert.equal(p.map.get("tc-1"), 12.5);
  assert.equal(p.map.get("holo, rare"), 3);
  assert.equal(p.errors.length, 3);
  const n = load("W1,2026-05-10,Holo rare,S,C,TC-1,50,4,1.75,44.25\n", HEAD.trim() + ",Cost\n".replace(/^/, ""));
  const r = analyze(n.items, { costList: "TC-1,10" });
  assert.equal(r.items[0].cost, 10);
  near(r.items[0].profit, 34.25);
  assert.deepEqual(r.unmatched, []);
  assert.deepEqual(analyze(n.items, { costList: "NOPE,1" }).unmatched, ["nope"]);
});

test("groups reconcile with the totals and losing categories need three costed sales", () => {
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push(`W${i},2026-05-1${i},P,Show A,Coins,C${i},20,1.6,0.88,17.52,25`);
  for (let i = 3; i < 5; i++) rows.push(`W${i},2026-06-1${i},P,Show B,Cards,C${i},20,1.6,0.88,17.52,25`);
  const n = load(rows.join("\n") + "\n", HEAD.trim() + ",Cost\n");
  const r = analyze(n.items);
  for (const g of [r.byShow, r.byCategory, r.byMonth]) {
    near(g.reduce((s, x) => s + x.payout, 0), r.summary.payout);
    near(g.reduce((s, x) => s + x.profit, 0), r.summary.profit);
    assert.equal(g.reduce((s, x) => s + x.items, 0), 5);
  }
  assert.deepEqual(r.stopCategories.map((g) => g.label), ["Coins"]);
  assert.deepEqual(r.stopShows.map((g) => g.label), ["Show A"]);
  assert.equal(r.summary.losingItems, 5);
});

test("without costs the ranking is by payout and the page says nothing is profit yet", () => {
  const n = load("W1,2026-05-10,A,S,C,,10,0.8,0.59,8.61\nW2,2026-05-11,B,S,C,,90,7.2,2.91,79.89\n");
  const r = analyze(n.items);
  assert.equal(r.rankBasis, "payout");
  assert.equal(r.summary.profit, null);
  assert.match(r.findings[0].title, /No cost basis/);
  assert.equal(r.bestItems[0].id, "W2");
});

test("low-price sales are counted with their fee share and the date range filters", () => {
  const n = load("W1,2026-05-10,A,,,,5,0.4,0.45,4.15\nW2,2026-06-10,B,,,,100,8,3.2,88.8\n");
  const r = analyze(n.items);
  assert.equal(r.summary.cheapItems, 1);
  assert.match(r.findings.find((f) => /under \$10/.test(f.title)).title, /17% in fees/);
  assert.equal(analyze(n.items, { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 30) }).items.length, 1);
  assert.match(analyze(n.items, { from: Date.UTC(2027, 0, 1) }).invalid, /date range/);
});

test("the example loads, reconciles and produces a summary", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.items.length, 45);
  assert.equal(n.skipped.length, 0);
  const r = analyze(n.items);
  near(r.byCategory.reduce((s, x) => s + x.payout, 0), r.summary.payout, 0.02);
  assert.ok(r.summary.losingItems > 0);
  const t = summaryText(r);
  assert.match(t, /Whatnot sales 2026-/);
  assert.match(t, /nothing uploaded/);
});
