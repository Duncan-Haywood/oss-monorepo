import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseDate, detectDmy, detectDelimiter, decodeBuffer, normalizeRows, analyze, clicksNeeded, median, adsCsv, sampleCsv } from "./calc.mjs";

const HEAD = "Campaign name,Ad set name,Ad name,Amount spent (USD),Impressions,Reach,Frequency,Link clicks,Purchases,Purchases conversion value\n";
const load = (body, head = HEAD) => normalizeRows(parseCsv(head + body));

test("parseNumber reads Meta's formats", () => {
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("$12.50"), 12.5);
  assert.equal(parseNumber("2.31%"), 2.31);
  assert.equal(parseNumber(""), 0);
  assert.equal(parseNumber("1.234,56", true), 1234.56);
  assert.ok(Number.isNaN(parseNumber("abc")));
});

test("dates: ISO, US, and day-first files are told apart", () => {
  assert.equal(parseDate("2026-09-03"), Date.UTC(2026, 8, 3));
  assert.equal(parseDate("09/03/2026"), Date.UTC(2026, 8, 3));
  assert.equal(parseDate("09/03/2026", true), Date.UTC(2026, 2, 9));
  assert.ok(Number.isNaN(parseDate("31/02/2026", true)));
  assert.equal(detectDmy(["25/09/2026", "01/09/2026"]), true);
  assert.equal(detectDmy(["09/25/2026"]), false);
  assert.equal(detectDmy(["01/02/2026"]), false);
});

test("delimiter is sniffed and UTF-16 exports decode", () => {
  assert.equal(detectDelimiter("Ad name\tAmount spent\nfoo\t1"), "\t");
  assert.equal(detectDelimiter("Ad name;Amount spent\nfoo;1,5"), ";");
  const s = "Ad name,Amount spent";
  const buf = new Uint8Array([0xff, 0xfe, ...[...s].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal(decodeBuffer(buf.buffer), s);
});

test("BOM, currency in the header, and a totals row are handled", () => {
  const n = normalizeRows(parseCsv("﻿" + HEAD + "C,S,Ad A,\"1,200.50\",\"100,000\",80000,1.25,900,30,1800\n,,,\"1,200.50\",\"100,000\",80000,1.25,900,30,1800\n"));
  assert.equal(n.error, null);
  assert.equal(n.currency, "USD");
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].spend, 1200.5);
  assert.equal(n.rows[0].impr, 100000);
  assert.equal(n.totalsRows, 1);
});

test("aliases: Results instead of Purchases, ROAS instead of value, day-first dates", () => {
  const n = normalizeRows(parseCsv("Day,Campaign name,Ad name,Amount spent (GBP),Impressions,Link clicks,Results,Purchase ROAS (return on ad spend)\n25/09/2026,C,A,10.00,1000,20,2,3.00\n26/09/2026,C,A,10.00,1000,20,1,3.00\n"));
  assert.equal(n.error, null);
  assert.equal(n.currency, "GBP");
  assert.equal(n.rows[0].value, 30);
  assert.deepEqual(n.period, { from: "2026-09-25", to: "2026-09-26", days: 2 });
  assert.equal(n.hasDaily, true);
});

test("missing columns give a specific message", () => {
  assert.match(normalizeRows(parseCsv("foo,bar\n1,2")).error, /No header row/);
  assert.match(normalizeRows(parseCsv("Ad name,Amount spent\na,1")).error, /No Impressions column/);
  assert.match(normalizeRows(parseCsv("Ad name,Amount spent,Impressions\na,1,2")).error, /No Results, Purchases or Leads column/);
});

test("unreadable rows are reported with a line number, not dropped silently", () => {
  const n = load("C,S,A,x,1000,900,1.1,10,1,50\nC,S,B,3.00,1000,900,1.1,10,1,50\n");
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped, [{ line: 2, reason: "unreadable amount spent" }]);
});

test("clicksNeeded follows (1-p)^n < 0.05 with a floor of 3", () => {
  assert.equal(clicksNeeded(0.05), 59);
  assert.equal(clicksNeeded(0.9), 3);
  assert.equal(clicksNeeded(0), Infinity);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

// Six ordinary ads plus specific cases.
const body = [
  "C,S,Ok 1,500,50000,40000,1.25,600,20,2000",
  "C,S,Ok 2,500,52000,40000,1.3,640,22,2200",
  "C,S,Ok 3,500,48000,38000,1.26,560,18,1800",
  "C,S,Ok 4,500,51000,40000,1.27,610,19,1900",
  "C,S,Star,400,45000,36000,1.25,600,40,4800",
  "R,S,Worn,900,40000,8000,5.0,150,4,300",
  "R,S,Worn no results,300,30000,6000,5.0,90,0,0",
  "T,S,Tiny,20,900,800,1.1,4,0,0",
  "T,S,Slow,120,20000,18000,1.1,30,0,0",
].join("\n");

test("analysis reconciles: buckets add to spend and the zero tiers add to the headline", () => {
  const n = load(body);
  const r = analyze(n.rows, {});
  const s = r.summary;
  const b = r.buckets;
  assert.ok(Math.abs(b.withResults + b.proven + b.overspent + b.watch - s.spend) < 1e-9);
  assert.ok(Math.abs(b.proven + b.overspent + b.watch - s.zeroSpend) < 1e-9);
  assert.equal(s.ads, 9);
});

test("fatigue needs high frequency plus a weak signal", () => {
  const r = analyze(load(body).rows, {});
  const names = r.fatigued.map((a) => a.ad);
  assert.ok(names.includes("Worn"));
  assert.ok(names.includes("Worn no results"));
  assert.ok(!names.includes("Ok 1"));
  assert.ok(!names.includes("Star"));
  // A high-frequency ad that is fine on CTR and CPA is not flagged.
  const fine = analyze(load("C,S,A,100,20000,10000,2,600,20,1000\nC,S,B,100,20000,10000,2,600,20,1000\nC,S,H,100,20000,4000,5,600,20,1000").rows, {});
  assert.equal(fine.fatigued.length, 0);
});

test("the frequency threshold is adjustable and low-volume ads are not judged", () => {
  const strict = analyze(load(body).rows, { freqThreshold: 6 });
  assert.equal(strict.fatigued.length, 0);
  const r = analyze(load(body).rows, { minImpr: 35000 });
  assert.ok(!r.fatigued.map((a) => a.ad).includes("Tiny"));
});

test("no-result spend is graded proven, overspent or watch", () => {
  const r = analyze(load(body).rows, {});
  const tier = Object.fromEntries(r.zero.map((a) => [a.ad, a.tier]));
  assert.equal(tier["Tiny"], "watch");
  assert.equal(tier["Slow"], "overspent");
  assert.equal(tier["Worn no results"], "proven");
  const lenient = analyze(load(body).rows, { targetCpa: 5000 });
  assert.equal(lenient.zero.find((a) => a.ad === "Slow").tier, "watch");
});

test("scale candidates need results, a better cost than the median and headroom on frequency", () => {
  const r = analyze(load(body).rows, {});
  const names = r.scale.map((a) => a.ad);
  assert.deepEqual(names, ["Star"]);
  assert.ok(!names.includes("Worn"));
});

test("ads are combined across daily rows and CTR trend needs six days", () => {
  let daily = "Day,Campaign name,Ad name,Amount spent,Impressions,Frequency,Link clicks,Purchases\n";
  for (let d = 1; d <= 12; d++) daily += `2026-09-${String(d).padStart(2, "0")},C,A,10,1000,3.5,${d <= 4 ? 30 : d > 8 ? 10 : 20},1\n`;
  for (let d = 1; d <= 12; d++) daily += `2026-09-${String(d).padStart(2, "0")},C,B,10,1000,1.5,20,1\n`;
  for (let d = 1; d <= 12; d++) daily += `2026-09-${String(d).padStart(2, "0")},C,B2,10,1000,1.5,20,1\n`;
  const n = normalizeRows(parseCsv(daily));
  const r = analyze(n.rows, {});
  const a = r.ads.find((x) => x.ad === "A");
  assert.equal(a.spend, 120);
  assert.equal(a.impr, 12000);
  assert.equal(a.freq, 3.5);
  assert.ok(a.trend.change < -0.5);
  assert.ok(r.fatigued.some((x) => x.ad === "A" && x.reasons.some((t) => /daily CTR fell/.test(t))));
});

test("files with no spend or no results are refused with a reason", () => {
  assert.match(analyze(load("C,S,A,0,1000,900,1,10,0,0").rows, {}).invalid, /no spend/);
  assert.match(analyze(load("C,S,A,5,1000,900,1,10,0,0").rows, {}).invalid, /no results at all/);
});

test("the synthetic example is readable and produces every section", () => {
  const n = normalizeRows(parseCsv(sampleCsv()));
  assert.equal(n.error, null);
  assert.equal(n.rows.length, 13);
  const r = analyze(n.rows, {});
  assert.ok(r.fatigued.length >= 1 && r.scale.length >= 1 && r.zero.length >= 1);
  assert.ok(r.byCampaign.length === 3);
  const csv = adsCsv(r).split("\n");
  assert.equal(csv.length, 14);
  assert.match(csv[0], /^campaign,ad_set,ad,spend/);
});
