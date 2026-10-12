import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, jobCost, price, sizeCheck, sampleInput, encodeShare, decodeShare, toCsv, SHARE_KEYS, SIZES_KW } from "./calc.mjs";

const base = () => readInput(sampleInput()).v;

test("the worked example prices a job from equipment, runs, labour, callback and margin", () => {
  const c = jobCost(base());
  assert.equal(c.equipment, 4430);
  assert.equal(c.gas, 810);
  assert.equal(c.elec, 270);
  assert.equal(c.labor, 1536);
  assert.equal(c.expectedCallback, 22.5);
  assert.equal(c.cost, 7813.5);
  const p = price(base());
  assert.equal(p.price, 11162.14);
  assert.equal(plan(sampleInput()).job.marginPct, 30);
});

test("minimum charge sets the price when the cost-plus price is lower", () => {
  const r = plan({ ...sampleInput(), minCharge: "20000" });
  assert.equal(r.job.minApplied, true);
  assert.equal(r.job.price, 20000);
  assert.ok(r.advice.some((a) => /minimum charge sets this price/.test(a)));
});

test("the deposit gap shows cash out of pocket before install day and the deposit that closes it", () => {
  const r = plan(sampleInput());
  assert.equal(r.job.upfront, 5865);
  assert.equal(r.job.deposit, 3348.64);
  assert.equal(r.job.gap, 2516.36);
  assert.ok(r.advice.some((a) => /Ask for 53% up front/.test(a)));
  const covered = plan({ ...sampleInput(), depositPct: "60" });
  assert.equal(covered.job.gap, 0);
  assert.ok(covered.advice.some((a) => /covers the/.test(a)));
});

test("an overrun lowers profit on a fixed price, step by step", () => {
  const o = plan(sampleInput()).overruns;
  assert.deepEqual(o.map((x) => x.overrunPct), [0, 25, 50, 100]);
  assert.equal(o[0].profit, 3348.64);
  assert.ok(o[0].profit > o[1].profit && o[1].profit > o[2].profit && o[2].profit > o[3].profit);
  assert.equal(o[2].hours, 21);
});

test("service plan adds expected profit from take-up and years, and is skipped with no price", () => {
  const s = plan(sampleInput()).service;
  assert.equal(s.perYear, 179);
  assert.equal(s.expected, 358);
  assert.equal(plan({ ...sampleInput(), planPrice: "" }).service, null);
});

test("size check adds the largest motor's starting surge and rounds up to a real size", () => {
  const s = sizeCheck(base());
  assert.equal(s.runningW, 8650);
  assert.equal(s.peakW, 17650);
  assert.equal(s.biggest, "air conditioner");
  assert.equal(s.recommendedKw, 18);
  assert.ok(sizeCheck({ ...base(), acTons: 0, wellHp: 0, sumpPumps: 0 }).recommendedKw <= 7);
  const huge = sizeCheck({ ...base(), acTons: 20, range: 1, waterHeater: 1 });
  assert.equal(huge.recommendedKw, null);
  assert.ok(SIZES_KW.every((k, i) => i === 0 || k > SIZES_KW[i - 1]));
});

test("margin table is monotonic", () => {
  const m = plan(sampleInput()).margins;
  assert.ok(m.every((x, i) => i === 0 || x.price > m[i - 1].price));
});

test("bad input is explained, not computed", () => {
  assert.match(plan({ ...sampleInput(), genCost: "0" }).error, /generator/);
  assert.match(plan({ ...sampleInput(), crew: "0" }).error, /Crew/);
  assert.match(plan({ ...sampleInput(), marginPct: "95" }).error, /Margin/);
  assert.match(plan({ ...sampleInput(), laborRate: "-5" }).error, /laborRate/);
  assert.match(plan({ ...sampleInput(), callbackPct: "150" }).error, /Callback/);
  assert.match(plan({ ...sampleInput(), depositPct: "150" }).error, /Deposit/);
});

test("share links carry only known keys and round-trip", () => {
  assert.deepEqual(decodeShare("#" + encodeShare(sampleInput())), sampleInput());
  assert.deepEqual(decodeShare("#evil=1&genCost=900"), { genCost: "900" });
  assert.equal(SHARE_KEYS.length, Object.keys(sampleInput()).length);
});

test("CSV has a row per overrun level", () => {
  const r = plan(sampleInput());
  assert.equal(toCsv(r).split("\n").length, r.overruns.length + 1);
});
