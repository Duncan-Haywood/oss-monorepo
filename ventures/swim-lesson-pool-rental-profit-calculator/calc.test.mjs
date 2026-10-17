import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, readInput, sampleInput, poolHours, encodeShare, decodeShare, toCsv } from "./calc.mjs";

test("a group class: revenue, costs and profit per class are hand-checkable", () => {
  const r = plan({ ...sampleInput(), privateClasses: "0", semiClasses: "0", groupClasses: "1", poolHoursBooked: "0", fixedPerMonth: "0", cancelPct: "0", cardFeePct: "0" });
  const g = r.lines[0];
  // 4 swimmers x $25 = $100; instructor 0.5h x $25 = 12.5; pool 0.5h x $45 = 22.5; supplies 4 x $1 = 4 -> profit 61
  assert.equal(g.revenue, 100);
  assert.equal(g.profit, 61);
  assert.equal(g.profitPerPoolHour, 122);
});

test("cancellations remove revenue and supplies but not instructor or pool time", () => {
  const r = plan({ ...sampleInput(), privateClasses: "1", semiClasses: "0", groupClasses: "0", poolHoursBooked: "0", fixedPerMonth: "0", cancelPct: "50", cardFeePct: "0" });
  const p = r.lines[0];
  // revenue 32.5; instructor 12.5; pool 22.5; supplies 0.5 -> -3
  assert.equal(p.revenue, 32.5);
  assert.equal(p.profit, -3);
});

test("rented hours with no class in them are charged as idle cost", () => {
  const r = plan({ ...sampleInput(), privateClasses: "2", semiClasses: "0", groupClasses: "0", poolHoursBooked: "10", fixedPerMonth: "0" });
  assert.equal(r.week.poolHoursUsed, 1);
  assert.equal(r.week.idleHours, 9);
  assert.equal(r.week.idleCost, 405);
  assert.ok(r.advice.some((a) => /no class in them/.test(a)));
});

test("pool hours paid are never below the classes' own need", () => {
  const v = readInput({ ...sampleInput(), poolHoursBooked: "1" }).v;
  assert.equal(poolHours(v), 12);
});

test("target price actually reaches the target margin", () => {
  const r = plan({ ...sampleInput(), cancelPct: "10", cardFeePct: "3", targetMarginPct: "35" });
  for (const l of r.lines) {
    const again = plan({ ...sampleInput(), cancelPct: "10", cardFeePct: "3", [l.id + "Price"]: String(l.targetPrice) }).lines.find((x) => x.id === l.id);
    assert.ok(Math.abs(again.marginPct - 35) < 0.6, `${l.id} margin ${again.marginPct}`);
  }
});

test("break-even swimmers is the smallest class that does not lose money", () => {
  const r = plan({ ...sampleInput(), cancelPct: "0", cardFeePct: "0", groupPrice: "10" });
  const g = r.lines.find((l) => l.id === "group");
  assert.ok(g.breakEvenSwimmers >= 3);
  const at = plan({ ...sampleInput(), cancelPct: "0", cardFeePct: "0", groupPrice: "10", groupSwimmers: String(g.breakEvenSwimmers) }).lines.find((l) => l.id === "group");
  assert.ok(at.profit >= -0.01);
  const below = plan({ ...sampleInput(), cancelPct: "0", cardFeePct: "0", groupPrice: "10", groupSwimmers: String(g.breakEvenSwimmers - 1) }).lines.find((l) => l.id === "group");
  assert.ok(below.profit < 0);
});

test("validation rejects nonsense with a plain message", () => {
  assert.ok(plan({ ...sampleInput(), privateClasses: "-1" }).error);
  assert.ok(plan({ ...sampleInput(), privateClasses: "1.5" }).error);
  assert.ok(plan({ ...sampleInput(), privateClasses: "0", semiClasses: "0", groupClasses: "0" }).error);
  assert.ok(plan({ ...sampleInput(), cancelPct: "95" }).error);
  assert.ok(plan({ ...sampleInput(), groupSwimmers: "0" }).error);
  assert.ok(plan({ ...sampleInput(), targetMarginPct: "95" }).error);
  assert.ok(plan({ ...sampleInput(), poolRatePerHour: "abc" }).error);
});

test("volume table holds the rented block fixed while classes scale", () => {
  const r = plan(sampleInput());
  assert.equal(r.table.length, 5);
  assert.equal(r.table[2].net, r.week.net);
  assert.ok(r.table[4].net > r.table[0].net);
  assert.ok(r.table[0].utilizationPct < r.table[4].utilizationPct);
});

test("share link only carries known keys", () => {
  const enc = encodeShare({ ...sampleInput(), evil: "x" });
  assert.ok(!enc.includes("evil"));
  assert.deepEqual(decodeShare("#" + enc + "&__proto__=1"), sampleInput());
  assert.match(toCsv(plan(sampleInput())), /^classes_pct,/);
});
