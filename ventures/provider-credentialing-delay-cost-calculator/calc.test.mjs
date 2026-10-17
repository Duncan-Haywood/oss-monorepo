import { test } from "node:test";
import assert from "node:assert/strict";
import { costOfDelay, parseProviders, analyze, toCsv, EXAMPLE_SHARED } from "./calc.mjs";

const P = { visitsPerWeek: 20, allowed: 100, restrictedShare: 0.5, heldShare: 0.2, retroDays: 0, weeklyComp: 2000 };

test("one week of delay: visits x restricted share x allowed amount, split into lost and deferred", () => {
  const c = costOfDelay(P, 7);
  assert.equal(c.blocked, 1000);
  assert.equal(c.lost, 800);
  assert.equal(c.deferred, 200);
  assert.equal(c.compUnbilled, 1000);
});

test("a payer that backdates the effective date shortens the unbillable gap, never below zero", () => {
  assert.equal(costOfDelay({ ...P, retroDays: 30 }, 90).gapDays, 60);
  assert.equal(costOfDelay({ ...P, retroDays: 120 }, 90).gapDays, 0);
  assert.equal(costOfDelay({ ...P, retroDays: 120 }, 90).lost, 0);
});

test("lost plus deferred equals blocked for any held share", () => {
  for (let h = 0; h <= 1; h += 0.1) {
    const c = costOfDelay({ ...P, heldShare: h }, 45);
    assert.ok(Math.abs(c.lost + c.deferred - c.blocked) < 1e-9);
  }
});

test("provider lines parse labels with commas, colons and a days suffix; bad lines warn", () => {
  const w = [];
  const r = parseProviders("Dr A, 90\nDr B: 60 days\nnonsense\n  \nC=30d", w);
  assert.deepEqual(r, [{ name: "Dr A", days: 90 }, { name: "Dr B", days: 60 }, { name: "C", days: 30 }]);
  assert.equal(w.length, 1);
});

test("the example analyses and the filing-earlier sweep is monotone", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok);
  assert.equal(a.rows.length, 3);
  assert.equal(a.sweep[0].saved, 0);
  for (let i = 1; i < a.sweep.length; i++) assert.ok(a.sweep[i].saved >= a.sweep[i - 1].saved);
  // 28 x .7 x 95 = 1862 per week blocked, 60% lost; 90+150+60 = 300 days = 42.857 weeks
  assert.ok(Math.abs(a.totals.lost - 1862 * 0.6 * (300 / 7)) < 0.01);
});

test("filing 120 days earlier removes the whole cost of a 90-day delay", () => {
  const a = analyze({ ...EXAMPLE_SHARED, providers: "A, 90" });
  assert.equal(a.sweep[4].lost, 0);
});

test("invalid numbers and empty provider lists are reported, not computed", () => {
  assert.equal(analyze({ ...EXAMPLE_SHARED, restrictedPct: "150" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, providers: "" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, allowed: "abc" }).ok, false);
});

test("csv has a header and one row per clinician", () => {
  const csv = toCsv(analyze(EXAMPLE_SHARED)).trim().split("\n");
  assert.equal(csv.length, 4);
});
