import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, jobCost, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, timeMultiplier } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices tech time, stall days, comebacks and the matrix", () => {
  const c = jobCost(base());
  assert.equal(c.dents, 129);
  assert.equal(c.multiplier, 1.12);
  assert.equal(c.repairHrs, 47.8);
  assert.equal(c.techHrs, 49.8);
  assert.equal(c.workDays, 7);
  assert.equal(c.expectedComeback, 14);
  assert.equal(c.cost, 3905.13);
  assert.equal(c.wanted, 6007.9);
  assert.equal(c.matrix, 6875);
  assert.equal(c.price, 6875);
});

test("aluminum and body-line shares stretch the time", () => {
  assert.equal(timeMultiplier({ alumPct: 0, alumUp: 30, linePct: 0, lineUp: 40 }), 1);
  assert.ok(Math.abs(timeMultiplier({ alumPct: 100, alumUp: 30, linePct: 100, lineUp: 40 }) - 1.7) < 1e-9);
  assert.ok(jobCost({ ...base(), alumPct: 80 }).techHrs > jobCost(base()).techHrs);
});

test("a matrix below cost-plus is flagged and the cost-plus price wins", () => {
  const v = { ...base(), rateDime: 15, rateNickel: 25, rateQuarter: 40, rateHalf: 70 };
  const c = jobCost(v);
  assert.equal(c.matrix, 3105);
  assert.equal(c.matrixShort, true);
  assert.equal(c.price, c.wanted);
  assert.match(plan({ ...sampleInput(), rateDime: "15", rateNickel: "25", rateQuarter: "40", rateHalf: "70" }).advice[1], /below the/);
});

test("with no matrix the price is cost plus margin and the advice says so", () => {
  const input = { ...sampleInput(), rateDime: "", rateNickel: "", rateQuarter: "", rateHalf: "" };
  const r = plan(input);
  assert.equal(r.job.matrixUsed, false);
  assert.equal(r.job.price, r.job.wanted);
  assert.match(r.advice[1], /No per-dent rates/);
});

test("the minimum charge applies to a tiny job", () => {
  const r = plan({ ...sampleInput(), dimeCt: "1", nickelCt: "0", quarterCt: "0", halfCt: "0", rateDime: "", rateNickel: "", rateQuarter: "", rateHalf: "", riHrs: "0", minCharge: "300" });
  assert.equal(r.job.minApplied, true);
  assert.equal(r.job.price, 300);
});

test("more techs shorten the work days but not the tech hours", () => {
  const two = jobCost({ ...base(), techs: 2 });
  assert.ok(two.workDays < jobCost(base()).workDays);
  assert.equal(two.techHrs, jobCost(base()).techHrs);
});

test("the hail table scales the whole job and keeps the input row", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.severity.map((s) => s.scale), [0.5, 1, 1.5, 2]);
  assert.equal(r.severity[1].price, r.job.price);
  assert.ok(r.severity[3].price > r.severity[0].price);
});

test("body-shop comparison and total-loss line are reported", () => {
  const r = plan(sampleInput());
  assert.ok(r.advice.some((a) => /saves the customer or the insurer \$2,625\.00/.test(a)));
  assert.ok(r.advice.some((a) => /stays under the 75% total-loss line/.test(a)));
  const over = plan({ ...sampleInput(), acv: "8000" });
  assert.ok(over.advice.some((a) => /over the 75% total-loss line/.test(a)));
});

test("bad input is refused with a reason", () => {
  assert.match(plan({ ...sampleInput(), dimeCt: "0", nickelCt: "0", quarterCt: "0", halfCt: "0" }).error, /at least one dent/);
  assert.match(plan({ ...sampleInput(), dimeCt: "2.5" }).error, /whole numbers/);
  assert.match(plan({ ...sampleInput(), laborRate: "-5" }).error, /laborRate/);
  assert.match(plan({ ...sampleInput(), alumPct: "120" }).error, /100 percent/);
  assert.match(plan({ ...sampleInput(), techs: "0" }).error, /Techs/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), dimeCt: "abc" }).error, /dimeCt/);
});

test("share links round-trip only known keys", () => {
  const encoded = encodeShare({ ...sampleInput(), evil: "<script>" });
  assert.doesNotMatch(encoded, /evil/);
  assert.deepEqual(decodeShare("#" + encoded), sampleInput());
  assert.deepEqual(decodeShare("#evil=1"), {});
  assert.equal(SHARE_KEYS.length, new Set(SHARE_KEYS).size);
});

test("csv has one row per hail count", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^hail_severity,/);
});
