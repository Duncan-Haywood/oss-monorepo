import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, jobLine, fixedCosts, seasonResult, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS } from "./calc.mjs";

const base = (o = {}) => readInput({ ...sampleInput(), ...o }).v;

test("materials are priced per 1,000 sq ft and tank loads round up", () => {
  const j = jobLine(base());
  assert.equal(j.seed, 200); // 20 x 4 lb x $2.50
  assert.equal(j.mulch, 476); // 20 x 70 lb / 50 x $17
  assert.equal(j.gallons, 1800);
  assert.equal(j.loads, 2);
  assert.equal(jobLine(base(), 16000).loads, 1);
  assert.equal(jobLine(base(), 17000).loads, 2);
});

test("crew hours are setup plus spraying plus a refill for every load after the first", () => {
  // 1.5 setup + 20k/20k-per-hr = 1 + one refill of 20 min
  assert.equal(jobLine(base()).hours, 2.83);
  assert.equal(jobLine(base(), 5000).hours, 1.75);
});

test("labor is the whole crew at loaded pay", () => {
  assert.equal(jobLine(base()).labor, 143.37); // 2.8333 h x 2 x $22 x 1.15
});

test("the minimum charge applies to small jobs and not to large ones", () => {
  assert.equal(jobLine(base(), 2000).revenue, 450);
  assert.equal(jobLine(base(), 2000).minApplies, true);
  assert.equal(jobLine(base({ slopePremiumPct: "0" }), 20000).revenue, 1700);
  assert.equal(jobLine(base(), 20000).minApplies, false);
});

test("the steep-slope premium is averaged over the share of steep jobs", () => {
  assert.equal(jobLine(base({ slopePremiumPct: "25", slopeSharePct: "20" })).revenue, 1785);
  assert.equal(jobLine(base({ slopePremiumPct: "0" })).revenue, 1700);
});

test("the target price gives exactly the target margin", () => {
  const v = base({ slopePremiumPct: "0", minCharge: "0" });
  const j = jobLine(v);
  const priced = jobLine({ ...v, pricePer1k: j.targetPer1k });
  assert.ok(Math.abs(priced.marginPct - 35) < 0.1);
});

test("fixed cost is the machine over its years plus overhead and never charged to the job", () => {
  const f = fixedCosts(base());
  assert.equal(f.machine, 5428.57);
  assert.equal(f.total, 11428.57);
  const a = jobLine(base({ machineCost: "1" }));
  const b = jobLine(base({ machineCost: "90000" }));
  assert.equal(a.profit, b.profit);
});

test("season profit is jobs times profit per job less fixed cost, and grows with volume", () => {
  const r = seasonResult(base());
  assert.ok(Math.abs(r.profit - (60 * r.job.profit - r.fixed.total)) < 0.02);
  assert.ok(seasonResult(base(), 1.5).profit > r.profit);
  assert.ok(seasonResult(base(), 0.5).profit < r.profit);
});

test("a job priced under its cost is called out with the price it needs", () => {
  const r = plan({ ...sampleInput(), pricePer1k: "30", minCharge: "0", slopePremiumPct: "0" });
  assert.ok(r.season.job.profit < 0);
  assert.match(r.advice.join(" "), /loses money before any fixed cost/);
  assert.match(r.advice.join(" "), /needs about \$/);
});

test("small jobs are flagged as setup and travel heavy", () => {
  const r = plan({ ...sampleInput(), areaSqft: "1500", travelMiles: "120" });
  assert.match(r.advice.join(" "), /small job priced like a big one/);
});

test("the size table has six rows, ascending, and loads never fall as the job grows", () => {
  const t = plan(sampleInput()).table;
  assert.equal(t.length, 6);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].area > t[i - 1].area && t[i].loads >= t[i - 1].loads);
});

test("the season table has five rows and 100% matches the headline", () => {
  const r = plan(sampleInput());
  assert.deepEqual(r.seasonTable.map((x) => x.pct), [50, 75, 100, 125, 150]);
  assert.equal(r.seasonTable[2].profit, r.season.profit);
});

test("bad input is rejected with a plain message", () => {
  assert.match(plan({ ...sampleInput(), areaSqft: "0" }).error, /job area/);
  assert.match(plan({ ...sampleInput(), seedCostLb: "-1" }).error, /not negative/);
  assert.match(plan({ ...sampleInput(), tankGal: "0" }).error, /Tank size/);
  assert.match(plan({ ...sampleInput(), sprayRate1kPerHr: "0" }).error, /Spray rate/);
  assert.match(plan({ ...sampleInput(), targetMarginPct: "95" }).error, /Target margin/);
  assert.match(plan({ ...sampleInput(), slopeSharePct: "120" }).error, /up to 100/);
  assert.match(plan({ ...sampleInput(), machineYears: "0" }).error, /at least 1 year/);
  assert.match(plan({ ...sampleInput(), areaSqft: "abc" }).error, /not negative/);
});

test("share links round-trip known keys and drop everything else", () => {
  const enc = encodeShare(sampleInput());
  const back = decodeShare("#" + enc + "&evil=1&__proto__=x");
  assert.deepEqual(back, sampleInput());
  assert.equal(back.evil, undefined);
  assert.equal(SHARE_KEYS.length, new Set(SHARE_KEYS).size);
});

test("csv has a header and one row per job size", () => {
  const lines = toCsv(plan(sampleInput())).split("\n");
  assert.equal(lines.length, 7);
  assert.match(lines[0], /^job_sqft,/);
});
