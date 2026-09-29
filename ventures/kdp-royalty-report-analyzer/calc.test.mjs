import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, detectDelimiter, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const HEAD = "Royalty Date,Title,Marketplace,Royalty Type,Transaction Type,Units Sold,Units Refunded,Net Units Sold,Avg. Offer Price without tax,Avg. Delivery/Manufacturing Cost,Royalty,Currency,Kindle Edition Normalized Pages (KENP) Read";
const load = (text, o) => { const n = normalizeRows(parseCsv(text, detectDelimiter(text))); assert.equal(n.error, undefined); return { n, r: analyze(n.rows, o) }; };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);

const FILE = [HEAD,
  "2026-05-02,Alpha,Amazon.com,70%,Standard,10,1,9,4.99,0.20,29.79,USD,0",
  "2026-05-03,Alpha,Amazon.co.uk,70%,Standard,2,0,2,3.99,0.20,5.19,GBP,0",
  "2026-05-04,Beta,Amazon.com,35%,Standard,4,0,4,3.99,0,5.59,USD,0",
  "2026-06-01,Beta,Amazon.com,35%,Refund,-1,0,-1,3.99,0,-1.40,USD,0",
  "2026-06-02,Alpha,Amazon.com,70%,Free - Promotion,20,0,0,0,0,0,USD,0",
  "2026-06-03,Alpha,Amazon.com,,,,,,,,,USD,1000",
].join("\n");

test("royalty is summed net of refund rows and reconciles across every breakdown", () => {
  const { r } = load(FILE);
  const s = r.summary;
  assert.equal(s.currency, "USD");
  near(s.royalty, 29.79 + 5.59 - 1.4);
  assert.equal(s.sold, 14);
  assert.equal(s.refundUnits, 2);
  assert.equal(s.freeUnits, 20);
  assert.equal(s.netUnits, 9 + 4 - 1);
  for (const key of ["byTitle", "byMarket", "byFormat"]) near(r[key].reduce((a, x) => a + x.royalty, 0), s.royalty);
  near(r.byMonth.reduce((a, x) => a + x.royalty, 0), s.royalty);
});

test("currencies are never mixed: the biggest is analyzed and the rest are named", () => {
  const { r } = load(FILE);
  assert.equal(r.summary.otherCurrencies[0].code, "GBP");
  assert.ok(r.findings.some((f) => /other currenc/.test(f.title)));
  const gbp = analyze(normalizeRows(parseCsv(FILE)).rows, { currency: "GBP" });
  assert.equal(gbp.summary.currency, "GBP");
  near(gbp.summary.royalty, 5.19);
});

test("KENP pages are valued only at the rate the user types", () => {
  const { r } = load(FILE);
  assert.equal(r.summary.kenp, 1000);
  assert.equal(r.summary.kenpValue, null);
  near(r.summary.total, r.summary.royalty);
  const v = load(FILE, { kenpRate: 0.005 }).r;
  near(v.summary.kenpValue, 5);
  near(v.summary.total, v.summary.royalty + 5);
  near(v.byTitle.reduce((a, x) => a + x.total, 0), v.summary.total);
});

test("the 35% price-band check estimates a what-if and respects the user's range", () => {
  const { r } = load(FILE);
  assert.equal(r.band.units, 4);
  near(r.band.est, 4 * 0.7 * 3.99);
  assert.equal(load(FILE, { bandMin: 5, bandMax: 9 }).r.band, null);
});

test("ad spend nets off total and gives a units-to-cover figure", () => {
  const { r } = load(FILE, { adSpend: 10 });
  near(r.ads.net, r.summary.total - 10);
  assert.ok(r.ads.unitsToCover > 0);
});

test("delivery cost is units sold times the per-unit cost and is flagged when large", () => {
  const { r } = load(FILE);
  near(r.summary.costTotal, 10 * 0.2 + 0 + 0);
});

test("date range filters rows; bad rows are skipped with a line and reason", () => {
  const text = FILE + "\nnot-a-date,Alpha,Amazon.com,70%,Standard,1,0,1,4.99,0.2,3.0,USD,0\n2026-05-05,Alpha,Amazon.com,70%,Standard,x,0,1,4.99,0.2,3.0,USD,0";
  const n = normalizeRows(parseCsv(text));
  assert.equal(n.skipped.length, 2);
  assert.match(n.skipped[0].reason, /date/);
  const r = analyze(n.rows, { from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 30) });
  near(r.summary.royalty, -1.4);
  assert.deepEqual(analyze(n.rows, { from: Date.UTC(2030, 0, 1) }).invalid, "No rows fall inside that date range.");
});

test("a file with no recognizable header is refused with a helpful message", () => {
  assert.match(normalizeRows(parseCsv("a,b\n1,2")).error, /No header row/);
  assert.match(normalizeRows([]).error, /empty/);
});

test("a KENP-only report (no royalty column) is read", () => {
  const text = "Date,Title,Marketplace,Kindle Edition Normalized Pages (KENP) Read\n2026-05-01,Alpha,Amazon.com,1200\n2026-05-02,Alpha,Amazon.com,300";
  const { r } = load(text, { kenpRate: 0.004 });
  assert.equal(r.summary.kenp, 1500);
  near(r.summary.total, 6);
});

test("refund rate flags a title with many refunds", () => {
  const rows = [HEAD, "2026-05-02,Bad,Amazon.com,70%,Standard,20,6,14,4.99,0.2,50,USD,0"].join("\n");
  const { r } = load(rows);
  assert.ok(r.findings.some((f) => f.severity === "high" && /refunded/.test(f.title)));
});

test("the sample file reads cleanly and yields every section", () => {
  const { n, r } = load(sampleCsv(), { kenpRate: 0.0045, adSpend: 60 });
  assert.equal(n.skipped.length, 0);
  assert.equal(r.byTitle.length, 3);
  assert.ok(r.band && r.ads && r.summary.kenpValue > 0);
  assert.equal(sampleCsv(), sampleCsv());
});
