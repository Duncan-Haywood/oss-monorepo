import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, normalizeRows, analyze, sampleCsv, money } from "./calc.mjs";

const load = (csv) => normalizeRows(parseCsv(csv));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

test("parseNumber handles currency, thousands, parentheses, percent and blanks", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("(12.00)"), -12);
  assert.equal(parseNumber("8.5%"), 8.5);
  assert.equal(parseNumber("--"), null);
  assert.equal(parseNumber("abc"), null);
});

test("sample parses: preamble skipped, totals row ignored, 6 listings", () => {
  const n = load(sampleCsv());
  assert.equal(n.error, undefined);
  assert.equal(n.listings.length, 6);
  assert.equal(n.skipped.length, 0);
});

test("header aliases: Ad Spend, Ad Revenue, Purchases, Impressions", () => {
  const n = load("Listing title,Impressions,Clicks,Purchases,Ad revenue,Ad spend\nMug,100,5,2,\"$40.00\",$4.50");
  assert.equal(n.error, undefined);
  const l = n.listings[0];
  assert.deepEqual([l.views, l.clicks, l.orders, l.revenue, l.spend], [100, 5, 2, 40, 4.5]);
});

test("rows for the same listing are summed; missing columns give a clear error", () => {
  const n = load("Listing,Revenue,Spend\nA,100,10\nA,50,5\nB,10,1");
  assert.equal(n.listings.length, 2);
  assert.equal(n.listings.find((l) => l.title === "A").spend, 15);
  assert.match(load("a,b\n1,2").error, /Could not find the columns/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("fee, profit, ROAS, break-even ROAS and cost per order are hand-computable", () => {
  // revenue 200, 4 orders, spend 20; margin 50%, fees 6.5+3 %, $0.25/order
  const n = load("Listing,Orders,Revenue,Spend\nX,4,200,20");
  const r = analyze(n.listings, { marginPct: 50 }).rows[0];
  near(r.etsyFees, 200 * 0.095 + 4 * 0.25); // 20
  near(r.profitBeforeAds, 100 - 20); // 80
  near(r.profitAfterAds, 60);
  near(r.roas, 10);
  near(r.breakEvenRoas, 200 / 80);
  near(r.costPerOrder, 5);
  assert.equal(r.action, "keep");
});

test("actions: pause when it loses even if every order was caused, lower under sold-anyway, keep otherwise", () => {
  const n = load("Listing,Orders,Revenue,Spend\nloser,1,100,60\nmid,2,100,30\nfine,2,100,10\nzero,0,0,15\nfree,3,90,0");
  const opts = { marginPct: 50, txnFeePct: 0, processingPct: 0, perOrderFee: 0, organicPct: 50 };
  const a = Object.fromEntries(analyze(n.listings, opts).rows.map((r) => [r.title, r.action]));
  // profit before ads is 50 on 100 revenue: spend 60 loses outright; 30 is fine at 0% but 25-30<0 at 50%; 10 survives
  assert.deepEqual(a, { loser: "pause", mid: "lower", fine: "keep", zero: "pause", free: "no-spend" });
});

test("ranking puts pause first (worst loss first), then lower, then keep (best first)", () => {
  const n = load(sampleCsv());
  const rows = analyze(n.listings, { marginPct: 45, organicPct: 30 }).rows;
  assert.deepEqual(rows.map((r) => r.action), ["pause", "pause", "lower", "keep", "keep", "keep"]);
  assert.equal(rows[0].title, "Ceramic mug speckled");
  assert.ok(rows[0].profitAfterAds <= rows[1].profitAfterAds);
  assert.ok(rows[3].incrementalProfit >= rows[4].incrementalProfit);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);
});

test("summary totals reconcile with the rows", () => {
  const r = analyze(load(sampleCsv()).listings, { marginPct: 40 });
  near(r.summary.spend, r.rows.reduce((a, x) => a + x.spend, 0));
  near(r.summary.profitAfterAds, r.summary.profitBeforeAds - r.summary.spend);
  assert.equal(r.summary.pause.length + r.summary.lower.length + r.summary.keep.length, 6);
});

test("changing the fee inputs changes the result", () => {
  const l = load("Listing,Orders,Revenue,Spend\nX,4,200,20").listings;
  const lo = analyze(l, { marginPct: 50, txnFeePct: 0, processingPct: 0, perOrderFee: 0 }).rows[0];
  const hi = analyze(l, { marginPct: 50, txnFeePct: 10, processingPct: 5, perOrderFee: 1 }).rows[0];
  assert.ok(lo.profitAfterAds > hi.profitAfterAds);
});

test("invalid inputs are refused, not computed", () => {
  const l = load(sampleCsv()).listings;
  assert.ok(analyze(l, { marginPct: 0 }).invalid);
  assert.ok(analyze(l, { marginPct: 120 }).invalid);
  assert.ok(analyze(l, { marginPct: 40, organicPct: 100 }).invalid);
  assert.ok(analyze(l, { marginPct: 40, txnFeePct: 60, processingPct: 50 }).invalid);
  assert.ok(analyze(l, { marginPct: 40, perOrderFee: -1 }).invalid);
  assert.ok(analyze([], {}).invalid);
  assert.equal(money(-5), "-$5.00");
});
