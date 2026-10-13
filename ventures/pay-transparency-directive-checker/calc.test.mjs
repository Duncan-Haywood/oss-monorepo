import { test } from "node:test";
import assert from "node:assert/strict";
import { DUTIES, reporting, parsePayTable, compute, SAMPLE, summaryText, gapCsv } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("reporting tiers follow headcount", () => {
  assert.equal(reporting(250).tier, "250+");
  assert.equal(reporting(249).tier, "150-249");
  assert.equal(reporting(150).tier, "150-249");
  assert.equal(reporting(149).tier, "100-149");
  assert.match(reporting(100).first, /2031/);
  assert.equal(reporting(99).tier, "under 100");
  assert.equal(reporting(250).cadence, "every year");
});

test("pay table computes the gap as men minus women over men", () => {
  const t = parsePayTable("category,women_avg,men_avg\nSales,52000,61000\nSupport,38200,38900");
  assert.equal(t.errors.length, 0);
  assert.equal(t.rows[0].gap, 14.8);
  assert.equal(t.rows[0].over, true);
  assert.equal(t.rows[1].over, false);
});

test("a negative gap (women paid more) of 5% or more also triggers", () => {
  const t = parsePayTable("A,60,50");
  assert.equal(t.rows[0].over, true);
});

test("bad table lines are rejected, not skipped", () => {
  assert.equal(parsePayTable("A,10").errors.length, 1);
  assert.equal(parsePayTable("H,1,2\nA,x,10").errors.length, 1);
  assert.ok(parsePayTable("B,0,5").errors.length === 1);
});

test("bad headcount is rejected", () => {
  for (const h of ["", "0", "-5", "12.5", "abc"]) assert.ok(compute({ ...SAMPLE, headcount: h }).errors.length >= 1, h);
});

test("an employer with 180 staff reports every three years and gets a Art 10 finding", () => {
  const r = run({});
  assert.equal(r.reports, true);
  assert.ok(r.findings.some((f) => f.severity === "high" && /Art 10/.test(f.title)));
  assert.equal(r.flagged.length, 2);
});

test("a small employer has no report but keeps the always-on duties", () => {
  const r = run({ headcount: "40", payTable: "" });
  assert.equal(r.reports, false);
  assert.ok(r.open.length > 0);
});

test("not hiring drops the recruitment duties", () => {
  const r = run({ hiring: "no", history: "", neutralTitles: "", range: "" });
  assert.ok(!r.open.some((d) => ["range", "history", "neutralTitles"].includes(d.id)));
});

test("marking every duty done clears the open list", () => {
  const all = Object.fromEntries(DUTIES.map((d) => [d.id, "1"]));
  assert.equal(run({ ...all, payTable: "" }).open.length, 0);
});

test("summary and csv render", () => {
  const r = run({});
  assert.match(summaryText(r), /not legal advice/);
  assert.match(gapCsv(r), /^category,women_avg,men_avg,gap_percent/);
});
