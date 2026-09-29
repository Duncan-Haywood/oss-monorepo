import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, detectDelimiter, decodeBuffer, normalizeRows, analyze, clicksNeeded, negativesCsv, harvestCsv, termsCsv, sampleCsv, isAsin } from "./calc.mjs";

const HEAD = "Campaign Name,Ad Group Name,Targeting,Match Type,Customer Search Term,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));

test("header aliases tolerate attribution prefix, units and trailing spaces", () => {
  const n = normalizeRows(parseCsv("Customer Search Term,Clicks,Spend,14 Day Total Sales ($) ,14 Day Total Orders (#)\nfoo,3,$1.50,$20.00,1"));
  assert.equal(n.error, null);
  assert.equal(n.window, 14);
  assert.equal(n.rows[0].sales, 20);
  assert.equal(n.rows[0].orders, 1);
});

test("missing orders or clicks columns produce a specific error", () => {
  assert.match(load("", "Customer Search Term,Spend,Clicks\n").error, /No Orders column/);
  assert.match(normalizeRows(parseCsv("Customer Search Term,Spend\nx,1")).error, /No Clicks column/);
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
});

test("unreadable numbers are skipped with a line number, totals rows are ignored", () => {
  const n = load("c,a,-,-,foo,10,x,1,0,0\nc,a,-,-,,10,5,1,0,0\nc,a,-,-,bar,10,5,1.00,0,0");
  assert.equal(n.rows.length, 1);
  assert.equal(n.skipped[0].line, 2);
  assert.equal(n.totalsRows, 1);
});

test("parse helpers", () => {
  assert.equal(parseNumber("$1,234.50"), 1234.5);
  assert.equal(parseNumber("1.234,50", true), 1234.5);
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  const u = new Uint8Array([0xff, 0xfe, ...Buffer.from("a,b", "utf16le")]);
  assert.equal(decodeBuffer(u.buffer), "a,b");
  assert.equal(isAsin("B07XJ8C8F5"), true);
  assert.equal(isAsin("yoga mat"), false);
  assert.ok(clicksNeeded(0.1) > clicksNeeded(0.2));
  assert.equal(clicksNeeded(0), Infinity);
});

test("auto targeting is recognised from the targeting column", () => {
  const n = load("c,a,close-match,-,x,10,5,1,0,0\nc,a,*loose-match,-,y,10,5,1,0,0\nc,a,yoga,broad,z,10,5,1,0,0");
  assert.deepEqual(n.rows.map((r) => r.auto), [true, true, false]);
});

test("buckets reconcile to total spend on the sample", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  const r = analyze(n.rows, { hasSales: true });
  const total = Object.values(r.buckets).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - r.summary.spend) < 1e-6);
  assert.ok(Math.abs(r.buckets.proven + r.buckets.overspent + r.buckets.watch - r.summary.wasteSpend) < 1e-6);
});

test("a term with no orders is proven only at enough clicks", () => {
  // Account: 150 clicks, 10 orders -> 6.7% rate -> needs 44 clicks for 95%.
  const rows = load("c,a,k,broad,winner,1000,100,50,300,10\nc,a,k,broad,few,50,5,5,0,0\nc,a,k,broad,many,500,45,40,0,0").rows;
  const r = analyze(rows, { targetAcos: 0.3 });
  assert.equal(r.summary.needed, 44);
  const tier = (t) => r.places.find((p) => p.term === t).tier;
  assert.equal(tier("many"), "proven");
  assert.equal(tier("few"), "watch");
  assert.equal(tier("winner"), "profitable");
});

test("spend above one order's worth with no orders is overspent, not proven", () => {
  const rows = load("c,a,k,broad,winner,1000,100,50,300,10\nc,a,k,broad,pricey,50,8,20,0,0").rows;
  const r = analyze(rows, { targetAcos: 0.3 });
  assert.equal(r.places.find((p) => p.term === "pricey").tier, "overspent");
});

test("the same term in two campaigns is judged per placement but combined for harvest and overlap", () => {
  const rows = load("c1,a,k,broad,Term X,100,20,10,120,3\nc2,a,k,broad,term x,100,15,9,0,0\nc1,a,k,broad,filler,100,60,30,0,0").rows;
  const r = analyze(rows, { targetAcos: 0.5 });
  assert.equal(r.places.filter((p) => p.term === "term x").length, 2);
  assert.equal(r.overlap[0].term, "term x");
  assert.equal(r.overlap[0].campaigns.size, 2);
});

test("harvest skips ASINs, unprofitable terms and terms with an exact keyword already", () => {
  const rows = load([
    "c,a,k,broad,good term,100,20,10,120,4", "c,a,k,broad,B07XJ8C8F5,100,20,10,120,4", "c,a,k,broad,bad term,100,20,30,60,2",
    "c,a,k,broad,covered,100,20,10,120,4", "e,a,covered,exact,covered,100,20,10,120,4", "c,a,k,broad,one order,100,20,5,40,1",
  ].join("\n")).rows;
  const r = analyze(rows, { targetAcos: 0.3 });
  assert.deepEqual(r.harvest.map((h) => h.term), ["good term"]);
});

test("harvest bid never exceeds the break-even CPC", () => {
  // 20 clicks, 4 orders at 30: cvr 0.2, aov 30, cpc 0.5, target 0.5 -> break-even 3.00.
  const rows = load("c,a,k,broad,t,100,20,10,120,4\nc,a,k,broad,u,100,20,10,0,0").rows;
  const h = analyze(rows, { targetAcos: 0.5 }).harvest.find((x) => x.term === "t");
  assert.equal(h.bid, 0.5);
  assert.ok(Math.abs(h.maxCpc - 3) < 1e-9);
  assert.ok(h.bid <= h.maxCpc);
});

test("bids above break-even list a saving only when the CPC exceeds it", () => {
  // t: 40 clicks, spend 80 (cpc 2), sales 100 in 2 orders -> break-even at 0.3 = 0.75/click.
  const rows = load("c,a,k,broad,t,100,40,80,100,2\nc,a,k,broad,ok,100,40,10,100,5").rows;
  const r = analyze(rows, { targetAcos: 0.3 });
  assert.equal(r.bids.length, 1);
  assert.equal(r.bids[0].term, "t");
  assert.ok(Math.abs(r.bids[0].cut - (80 - 40 * 0.75)) < 1e-9);
});

test("files with no orders, no spend or no clicks are refused with a reason", () => {
  assert.match(analyze(load("c,a,k,broad,t,100,20,10,0,0").rows).invalid, /no orders/);
  assert.match(analyze(load("c,a,k,broad,t,100,20,0,10,1").rows).invalid, /no spend/);
  assert.match(analyze(load("c,a,k,broad,t,100,0,5,10,1").rows).invalid, /no clicks/);
});

test("CSV exports quote search terms and carry the evidence", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  const r = analyze(n.rows, { hasSales: true });
  assert.match(negativesCsv(r), /negative exact/);
  assert.match(harvestCsv(r), /^keyword,match_type,suggested_bid/);
  assert.equal(termsCsv(r).split("\n").length, r.terms.length + 1);
  const q = analyze(load("c,a,k,broad,\"say \"\"hi\"\", ok\",100,60,30,0,0\nc,a,k,broad,w,100,10,5,100,5").rows, { targetAcos: 0.5 });
  assert.match(negativesCsv(q), /"say ""hi"", ok"/);
});

test("the sample is deterministic and exercises every list", () => {
  assert.equal(sampleCsv(), sampleCsv());
  const r = analyze(normalizeRows(parseCsv(sampleCsv())).rows, { hasSales: true });
  assert.ok(r.negatives.length > 0 && r.harvest.length > 0 && r.bids.length > 0 && r.overlap.length > 0);
});
