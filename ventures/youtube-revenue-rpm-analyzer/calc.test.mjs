import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseDuration, dimensionOf, normalizeRows, analyze, sampleCsv } from "./calc.mjs";

const near = (a, b, e = 0.005) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const load = (csv) => normalizeRows(parseCsv(csv));
const run = (csv, opts) => { const n = load(csv); return { n, r: analyze(n.rows, opts, n) }; };

test("durations read seconds, mm:ss, h:mm:ss and minutes", () => {
  assert.equal(parseDuration("754"), 754);
  assert.equal(parseDuration("12:34"), 754);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("12 min"), 720);
  assert.equal(parseDuration(""), null);
});

test("dimension follows the label column's own header", () => {
  assert.equal(dimensionOf("Date"), "date");
  assert.equal(dimensionOf("Geography"), "country");
  assert.equal(dimensionOf("Traffic source"), "traffic source");
  assert.equal(dimensionOf("Video title"), "video");
});

test("the example reads cleanly, the Total row is kept aside and rows reconcile to it", () => {
  const { n, r } = run(sampleCsv());
  assert.equal(n.skipped.length, 0);
  assert.equal(n.rows.length, 10);
  near(n.total.revenue, 754.95);
  near(r.summary.revenue, 754.95);
  assert.equal(r.summary.views, 168060);
  near(r.summary.rpm, (754.95 / 168060) * 1000, 1e-9);
  assert.ok(!r.findings.some((f) => /of the file's own Total/.test(f.title)));
});

test("a truncated export is called out against its Total row", () => {
  const csv = "Video title,Views,Estimated revenue (USD)\nTotal,1000,100\nA,300,40\nB,200,30";
  const { r } = run(csv);
  assert.ok(r.findings.some((f) => /70\.0% of the file's own Total/.test(f.title)));
});

test("low-RPM and zero-revenue videos are found and sized", () => {
  const { r } = run(sampleCsv());
  assert.ok(r.findings.some((f) => /under half the median RPM/.test(f.title) && /chalk line/.test(f.detail)));
  assert.ok(r.findings.some((f) => /earned nothing/.test(f.title) && /licensing/.test(f.detail)));
  near(r.rpmGap.revenue, (41000 * (r.medianRpm - (12.3 / 41000) * 1000)) / 1000, 0.01);
});

test("high-RPM low-traffic videos are surfaced as under-fed", () => {
  const { r } = run(sampleCsv());
  const f = r.findings.find((x) => /pay well per view but get little traffic/.test(x.title));
  assert.ok(f && /ghosting/.test(f.detail));
});

test("click-through uses impression-weighted CTR, not a mean of percentages", () => {
  const { r } = run(sampleCsv());
  near(r.summary.ctr, 0.0377, 0.0005);
  assert.ok(r.findings.some((f) => /clicked well under/.test(f.title)));
});

test("duration buckets add up to the totals", () => {
  const { r } = run(sampleCsv());
  near(r.byDuration.reduce((a, b) => a + b.revenue, 0), r.summary.revenue);
  assert.equal(r.byDuration.reduce((a, b) => a + b.views, 0), r.summary.views);
});

test("concentration reports how many rows earn 80%", () => {
  const { r } = run(sampleCsv());
  assert.equal(r.concentration.top, "How I price a kitchen remodel bid");
  assert.ok(r.concentration.rowsFor80 >= 3 && r.concentration.rowsFor80 <= 5);
});

test("a by-country export compares share of views with share of revenue", () => {
  const csv = ["Geography,Views,Estimated revenue (USD)", "United States,50000,300", "India,45000,25", "Germany,12000,60", "Brazil,9000,12", "Canada,6000,30"].join("\n");
  const { n, r } = run(csv);
  assert.equal(n.dimension, "country");
  const f = r.findings.find((x) => /^India is/.test(x.title));
  assert.ok(f && /of views but/.test(f.title));
});

test("a by-day export gets a month-over-month finding", () => {
  const days = [];
  for (const [mo, rev, v] of [["2026-05", 4, 400], ["2026-06", 2, 300]]) for (let d = 1; d <= 28; d++) days.push(`${mo}-${String(d).padStart(2, "0")},${v},${rev}`);
  const { n, r } = run("Date,Views,Estimated revenue (USD)\n" + days.join("\n"));
  assert.equal(n.dimension, "date");
  assert.deepEqual(r.byMonth.map((m) => m.month), ["2026-05", "2026-06"]);
  assert.ok(r.findings.some((f) => /2026-06 revenue is down 50\.0% on 2026-05/.test(f.title)));
});

test("unreadable rows are listed, not guessed", () => {
  const n = load("Video title,Views,Estimated revenue (USD)\nA,abc,5\nB,100,xyz\n,50,5\nC,100,2");
  assert.equal(n.rows.length, 1);
  assert.deepEqual(n.skipped.map((s) => s.line), [2, 3, 4]);
});

test("a file with no revenue column says how to export the right one", () => {
  const n = load("Video title,Views\nA,10");
  assert.match(n.error, /Export current view/);
});

test("semicolon decimal-comma files and UTF-8 BOM are read", () => {
  const n = normalizeRows(parseCsv("﻿Video title;Views;Estimated revenue (EUR)\nA;1.200;3,50", ";"), { decimalComma: true });
  assert.equal(n.rows[0].views, 1200);
  near(n.rows[0].revenue, 3.5);
});

test("zero-revenue files are reported plainly", () => {
  const { r } = run("Video title,Views,Estimated revenue (USD)\nA,100,0\nB,200,0");
  assert.equal(r.findings[0].title, "No revenue in this file");
});
