import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCsv, parseMoney, parseCostExport, periodDays, compareBills, checkGate, pickSides, summarize,
  hintsFor, formatUsd, formatDelta, formatPct,
} from "./engine.mjs";

const fixture = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8");

test("parseCsv handles quotes, escaped quotes, CRLF and a BOM", () => {
  const rows = parseCsv('﻿a,"b,c","d ""e"""\r\n1,2,3\r\n');
  assert.deepEqual(rows, [["a", "b,c", 'd "e"'], ["1", "2", "3"]]);
});

test("parseMoney reads $, commas, parentheses negatives and blanks", () => {
  assert.equal(parseMoney("$1,204.55"), 1204.55);
  assert.equal(parseMoney("-900.00"), -900);
  assert.equal(parseMoney("(12.50)"), -12.5);
  assert.equal(parseMoney(""), 0);
  assert.ok(Number.isNaN(parseMoney("abc")));
});

test("Cost Explorer export: periods, lines, total row and Total costs column are separated", () => {
  const e = parseCostExport(fixture("cost-explorer-monthly.csv"));
  assert.deepEqual(e.periods, ["2026-07-01", "2026-08-01"]);
  assert.equal(e.dimension, "Service");
  assert.equal(e.lines.length, 10);
  assert.ok(e.statedTotal);
  assert.deepEqual(e.mismatches, []);
  assert.ok(!e.lines.some((l) => /total/i.test(l.name)));
});

test("a cropped export is detected from its own total row", () => {
  const csv = 'Service,2026-07($),2026-08($)\nEC2,100,100\nS3,50,50\nService total,400,400\n';
  const e = parseCostExport(csv);
  assert.equal(e.mismatches.length, 2);
  assert.equal(e.mismatches[0].stated, 400);
});

test("bad input fails loudly", () => {
  assert.throws(() => parseCostExport("only one line"), /header row/);
  assert.throws(() => parseCostExport("a\nb"), /name column/);
  assert.throws(() => parseCostExport("Service,Total costs($)\nEC2,5"), /No period columns/);
  assert.throws(() => parseCostExport("Service,2026-07($)\nEC2,lots"), /not a number/);
});

test("duplicate names are summed", () => {
  const e = parseCostExport("Service,2026-07($),2026-08($)\nEC2,1,2\nEC2,3,4\n");
  assert.deepEqual(e.lines[0].values, [4, 6]);
});

test("periodDays knows month labels and ranges, and refuses to guess a month start", () => {
  assert.equal(periodDays("2026-02"), 28);
  assert.equal(periodDays("Sep 2026"), 30);
  assert.equal(periodDays("2026-09-01 - 2026-09-12"), 12);
  assert.equal(periodDays("2026-09-01"), null);
  assert.equal(periodDays("whatever"), null);
});

const side = (o) => Object.entries(o).map(([name, value]) => ({ name, value }));

test("compare: ranks movers by absolute change and classifies new / gone / up / down", () => {
  const r = compareBills(side({ A: 100, B: 50, C: 10, D: 5 }), side({ A: 300, B: 20, E: 40, D: 5 }));
  assert.equal(r.totals.before, 165);
  assert.equal(r.totals.after, 365);
  assert.equal(r.totals.delta, 200);
  assert.deepEqual(r.lines.map((l) => l.name), ["A", "E", "B", "C", "D"]);
  const by = Object.fromEntries(r.lines.map((l) => [l.name, l.status]));
  assert.deepEqual(by, { A: "up", E: "new", B: "down", C: "gone", D: "flat" });
  assert.equal(r.totals.grossUp, 240);
  assert.equal(r.totals.grossDown, -40);
});

test("compare: share of the rise is of gross increases, not the net", () => {
  const r = compareBills(side({ A: 0, B: 100 }), side({ A: 100, B: 0 }));
  assert.equal(r.totals.delta, 0);
  assert.equal(r.lines.find((l) => l.name === "A").shareOfRise, 100);
});

test("compare: a partial later month is compared per day, not raw", () => {
  const raw = compareBills(side({ A: 3100 }), side({ A: 1200 }));
  assert.ok(raw.totals.delta < 0);
  const norm = compareBills(side({ A: 3100 }), side({ A: 1200 }), { beforeDays: 31, afterDays: 12 });
  assert.equal(norm.totals.before, 1200);
  assert.equal(norm.totals.delta, 0);
  assert.deepEqual(norm.normalised, { beforeDays: 31, afterDays: 12 });
  assert.match(summarize(norm), /scaled to 12 days/);
});

test("compare: a credit that ended is a rise, flagged as accounting, with a percent against its size", () => {
  const r = compareBills(side({ "Savings Plans for AWS Compute usage": -900, EC2: 100 }), side({ "Savings Plans for AWS Compute usage": 0, EC2: 100 }));
  const l = r.lines[0];
  assert.equal(l.delta, 900);
  assert.equal(l.pct, 100);
  assert.equal(l.hint.kind, "commitment");
  assert.equal(r.accountingOnly, true);
  assert.match(summarize(r), /tax, support, a commitment or a credit/);
});

test("compare: minDelta makes small moves flat; identical bills say so", () => {
  const r = compareBills(side({ A: 10 }), side({ A: 10.2 }), { minDelta: 1 });
  assert.equal(r.lines[0].status, "flat");
  assert.match(summarize(compareBills(side({ A: 10 }), side({ A: 10 }))), /did not change/);
});

test("hints: known services get a checklist, unknown ones get none, and none cite a price", () => {
  assert.equal(hintsFor("EC2 - Other").area, "EC2 - Other");
  assert.equal(hintsFor("AmazonCloudWatch").area, "CloudWatch");
  assert.equal(hintsFor("Tax").kind, "tax");
  assert.equal(hintsFor("Some Brand New Service"), null);
  for (const n of ["EC2 - Other", "AmazonCloudWatch", "Amazon Simple Storage Service", "Amazon Relational Database Service"]) {
    for (const c of hintsFor(n).checks) assert.doesNotMatch(c, /\$\d/, c);
  }
});

test("pickSides: last two periods by default, named periods on request, two files", () => {
  const e = parseCostExport("Service,a($),b($),c($)\nX,1,2,3\n");
  const d = pickSides(e, null);
  assert.deepEqual([d.beforeLabel, d.afterLabel], ["b", "c"]);
  const n = pickSides(e, null, { before: "a", after: "c" });
  assert.equal(n.before[0].value, 1);
  assert.equal(n.after[0].value, 3);
  assert.throws(() => pickSides(e, null, { before: "zzz" }), /not in the export/);
  assert.throws(() => pickSides(e, null, { before: "a", after: "a" }), /same period/);
  assert.throws(() => pickSides(parseCostExport("Service,a($)\nX,1\n"), null), /cannot be compared/);
  const two = pickSides(parseCostExport("Service,a($)\nX,1\n"), parseCostExport("Service,b($)\nX,9\n"));
  assert.equal(two.after[0].value, 9);
});

test("gate: usd and percent thresholds, and bad values throw", () => {
  const r = compareBills(side({ A: 100 }), side({ A: 130 }));
  assert.equal(checkGate(r, { maxIncreaseUsd: 50 }).exceeded, false);
  assert.equal(checkGate(r, { maxIncreaseUsd: 20 }).exceeded, true);
  assert.equal(checkGate(r, { maxIncreasePct: 25 }).exceeded, true);
  assert.equal(checkGate(r, {}).exceeded, false);
  assert.throws(() => checkGate(r, { maxIncreaseUsd: "x" }), /needs a number/);
});

test("formatting", () => {
  assert.equal(formatUsd(1234.5), "$1,234.50");
  assert.equal(formatUsd(-5), "-$5.00");
  assert.equal(formatDelta(12), "+$12.00");
  assert.equal(formatDelta(-12), "-$12.00");
  assert.equal(formatDelta(0.001), "$0.00");
  assert.equal(formatPct(null), "new");
  assert.equal(formatPct(44.63), "+44.6%");
});
