import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, normalizeRows, analyze, sampleCsv, maxAdRate, money } from "./calc.mjs";

const load = (csv) => normalizeRows(parseCsv(csv));

test("parseNumber handles currency, thousands, parentheses, percent and blanks", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("(12.00)"), -12);
  assert.equal(parseNumber("-3"), -3);
  assert.equal(parseNumber("8.5%"), 8.5);
  assert.equal(parseNumber("--"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

test("sample parses: preamble line skipped, totals row ignored, 7 listings (Etsy Ads headers)", () => {
  const n = load(sampleCsv());
  assert.equal(n.error, undefined);
  assert.equal(n.listings.length, 7);
  assert.equal(n.skipped.length, 0);
});

test("rows for the same listing are summed", () => {
  const n = load("Listing ID,Listing title,Sales,Ad fees\n1,A,100,10\n1,A,50,5\n2,B,10,1");
  assert.equal(n.listings.length, 2);
  const a = n.listings.find((l) => l.id === "1");
  assert.equal(a.sales, 150);
  assert.equal(a.fees, 15);
});

test("missing columns give a clear error", () => {
  assert.match(load("a,b\n1,2").error, /Could not find the columns/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("unreadable rows are reported with line numbers", () => {
  const n = load("Listing ID,Sales,Ad fees\n1,100,10\n,5,1\n3,--,--");
  assert.equal(n.listings.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [3, 4]);
});

test("verdicts follow break-even arithmetic at a 25% margin", () => {
  const n = load("Listing ID,Sales,Ad fees\nloser,100,30\nmarginal,100,20\npays,100,5\nnosale,0,4\nfree,100,0\nidle,0,0");
  const r = analyze(n.listings, { marginPct: 25 });
  const v = Object.fromEntries(r.rows.map((x) => [x.id, x.verdict]));
  assert.deepEqual(v, { loser: "loses", marginal: "marginal", pays: "pays", nosale: "no-sale", free: "free", idle: "idle" });
  const loser = r.rows.find((x) => x.id === "loser");
  assert.equal(loser.profitBefore, 25);
  assert.equal(loser.attributedProfit, -5);
  assert.ok(Math.abs(loser.requiredCausedShare - 1.2) < 1e-9);
});

test("organic share can turn a paying listing negative", () => {
  const n = load("Listing ID,Sales,Ad fees\nx,100,18");
  assert.equal(analyze(n.listings, { marginPct: 25, organicPct: 0 }).rows[0].verdict, "marginal");
  const r = analyze(n.listings, { marginPct: 25, organicPct: 50 });
  assert.equal(r.rows[0].verdict, "fails-your-assumption");
  assert.equal(r.rows[0].incrementalProfit, 100 * 0.5 * 0.25 - 18);
});

test("summary totals reconcile with the rows", () => {
  const r = analyze(load(sampleCsv()).listings, { marginPct: 30 });
  const fees = r.rows.reduce((a, x) => a + x.fees, 0);
  assert.ok(Math.abs(r.summary.fees - fees) < 1e-9);
  assert.ok(Math.abs(r.summary.attributed - (r.summary.sales * 0.3 - r.summary.fees)) < 1e-9);
  assert.ok(Math.abs(r.summary.breakEvenRoas - 1 / 0.3) < 1e-9);
});

test("sample at a 12% margin flags the 15% spend-rate listings as losers", () => {
  const r = analyze(load(sampleCsv()).listings, { marginPct: 12 });
  const titles = r.summary.losers.map((x) => x.id);
  assert.ok(titles.includes("1100000003"));
  assert.ok(r.findings.some((f) => /lose money even if the ad caused every sale/.test(f.title)));
});

test("invalid inputs are refused, not computed", () => {
  const l = load(sampleCsv()).listings;
  assert.ok(analyze(l, { marginPct: 0 }).invalid);
  assert.ok(analyze(l, { marginPct: 120 }).invalid);
  assert.ok(analyze(l, { marginPct: 25, organicPct: 100 }).invalid);
  assert.ok(analyze([], {}).invalid);
});

test("maxAdRate and money", () => {
  assert.equal(maxAdRate(25), 0.25);
  assert.equal(maxAdRate(20, 50), 0.1);
  assert.equal(money(-5), "-$5.00");
  assert.equal(money(1234.5), "$1,234.50");
});

test("Etsy Ads headers (Views, Orders, Revenue, Spend) are recognised", () => {
  const n = load("Listing,Views,Clicks,Orders,Revenue,Spend,ROAS\nMug,1000,40,3,\"$90.00\",\"$9.00\",10\n");
  assert.equal(n.error, undefined);
  const l = n.listings[0];
  assert.equal(l.impressions, 1000);
  assert.equal(l.sold, 3);
  assert.equal(l.sales, 90);
  assert.equal(l.fees, 9);
  const r = analyze(n.listings, { marginPct: 40 });
  assert.ok(Math.abs(r.rows[0].requiredCausedShare - 9 / 36) < 1e-9);
});
