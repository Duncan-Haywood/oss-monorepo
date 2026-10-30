// Property test for retirement limits: seeded random profits, ages and years (made up,
// no outside data). Invariants: nothing negative, nothing above earnings, the 401(k)
// total is within the 415(c) cap plus catch-up, the employer share is never above 20%
// of earnings, more profit never lowers a limit, and catch-up only ever adds.
import test from "node:test";
import assert from "node:assert/strict";
import { retirementLimits, LIMITS } from "./retirement.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("retirement limits hold their invariants on 800 random sole proprietors", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 800; i++) {
    const year = r() < 0.5 ? 2025 : 2026, L = LIMITS[year];
    const profit = r() < 0.1 ? -pick(0, 50_000_00) : pick(0, 900_000_00);
    const age = pick(25, 75), wages = r() < 0.3 ? pick(0, 200_000_00) : 0;
    const x = retirementLimits(profit, { year, age, wages }), tag = JSON.stringify({ year, profit, age, wages });
    const catchUp = age >= 60 && age <= 63 ? L.catchUp6063 : age >= 50 ? L.catchUp50 : 0;
    assert.ok(x.earned >= 0 && x.earned <= Math.max(0, profit), "earned within profit " + tag);
    assert.ok(x.sep.max >= 0 && x.sep.max <= L.total415c && x.sep.max <= Math.round(x.earned * 0.2), "sep " + tag);
    const k = x.solo401k;
    assert.ok(k.employee >= 0 && k.employer >= 0 && k.total >= 0, "no negatives " + tag);
    assert.ok(k.total <= x.earned && k.total <= L.total415c + catchUp, "total within caps " + tag);
    assert.ok(k.employee <= L.deferral + catchUp, "deferral limit " + tag);
    assert.ok(k.employer <= Math.round(x.earned * 0.2), "employer share " + tag);
    assert.equal(k.employee + k.employer, k.total, "parts add to total " + tag);
    if (profit <= 0) assert.equal(k.total + x.sep.max, 0, "no profit, no contribution " + tag);
    const more = retirementLimits(profit + pick(1, 50_000_00), { year, age, wages });
    assert.ok(more.sep.max >= x.sep.max && more.solo401k.total >= k.total, "monotone in profit " + tag);
    const young = retirementLimits(profit, { year, age: 40, wages });
    assert.ok(k.total >= young.solo401k.total, "catch-up never subtracts " + tag);
  }
});
