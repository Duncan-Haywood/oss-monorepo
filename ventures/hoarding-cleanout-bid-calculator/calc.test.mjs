import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, debrisYards, jobCost, breakEvenMultiple, changeOrderPerYd, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example turns the space into yards, days, containers and a price", () => {
  const j = jobCost(base());
  assert.equal(j.yards, 88);
  assert.equal(j.containers, 4);
  assert.equal(j.days, 6);
  assert.equal(j.cost, 8927.6);
  assert.equal(j.price, 12753.71);
  assert.equal(j.actualMarginPct, 30);
});

test("debris is volume times fill, less what the client keeps, in cubic yards", () => {
  const v = { ...base(), floorSqft: 270, ceilingFt: 10, fillPct: 50, keepPct: 0 };
  assert.equal(debrisYards(v), 50);
});

test("days and containers round up, so cost moves in steps", () => {
  const v = base();
  const a = jobCost(v, { volMult: 0.28 }); // 24.6 yards: fits one 25.5-yard load
  const b = jobCost(v, { volMult: 0.31 }); // 27.3 yards: needs a second
  assert.equal(a.containers, 1);
  assert.equal(b.containers, 2);
});

test("minimum charge sets the price when cost-plus is lower", () => {
  const v = { ...base(), floorSqft: 100, fillPct: 5, sanitizeSqft: 0, minCharge: 3000 };
  const j = jobCost(v);
  assert.equal(j.minApplied, true);
  assert.equal(j.price, 3000);
  assert.ok(plan({ ...sampleInput(), floorSqft: "100", fillPct: "5", sanitizeSqft: "0", minCharge: "3000" }).advice.some((a) => /minimum charge sets this price/.test(a)));
});

test("the overrun limit is the volume where cost meets the quoted price", () => {
  const v = base();
  const j = jobCost(v);
  const m = breakEvenMultiple(v, j.price);
  assert.ok(m > 1.3 && m < 1.6);
  assert.ok(jobCost(v, { volMult: m }).cost <= j.price + 0.01);
  assert.ok(jobCost(v, { volMult: m + 0.02 }).cost > j.price);
});

test("a zero-margin quote has no headroom", () => {
  const v = { ...base(), marginPct: 0, riskPct: 0 };
  const j = jobCost(v);
  assert.ok(breakEvenMultiple(v, j.price) < 1.1);
});

test("the change-order rate covers the next yard at the margin", () => {
  const v = base();
  const co = changeOrderPerYd(v);
  assert.ok(co > jobCost(v).perYd * 0.5);
  assert.ok(co > 0);
});

test("the sensitivity table holds the quote fixed and shows losses at big overruns", () => {
  const r = plan(sampleInput());
  const row = (m) => r.sensitivity.find((x) => x.multiplier === m);
  assert.equal(row(1).profitAtQuote, r.job.profit);
  assert.ok(row(0.75).profitAtQuote > row(1).profitAtQuote);
  assert.ok(row(2).profitAtQuote < 0);
});

test("bad input gets a plain message, not a NaN", () => {
  for (const [k, val] of [["floorSqft", "0"], ["fillPct", "0"], ["fillPct", "120"], ["keepPct", "100"], ["crew", "0"], ["crew", "2.5"], ["marginPct", "95"], ["sanitizeSqft", "5000"], ["laborRate", "-4"], ["driveMin", "480"]]) {
    const r = plan({ ...sampleInput(), [k]: val });
    assert.ok(r.error, `${k}=${val}`);
    assert.doesNotMatch(r.error, /NaN/);
  }
});

test("a dollar sign or comma in a field is tolerated", () => {
  assert.equal(readInput({ ...sampleInput(), laborRate: "$28", minCharge: "1,500" }).v.minCharge, 1500);
});

test("share link round-trips only known keys and cannot carry markup", () => {
  const enc = encodeShare({ ...sampleInput(), evil: "<script>" });
  assert.doesNotMatch(enc, /evil|script/);
  assert.deepEqual(decodeShare("#" + enc), sampleInput());
  assert.deepEqual(Object.keys(decodeShare("#evil=1")), []);
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("csv has a header and one row per volume", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^volume_multiple,/);
});
