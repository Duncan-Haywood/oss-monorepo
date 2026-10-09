import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cleanItems, cleanShared, groupProfit, hirePoints, roomsFor, solve, teachersFor, toCsv, EXAMPLE_ITEMS, EXAMPLE_SHARED } from "./calc.mjs";

const G = (o) => ({ name: "g", tuition: 300, ratio: 6, sqft: 35, demand: 10, maxGroup: 1000, varCost: 20, ...o });

test("teachers follow the ratio staircase, one hire at a time", () => {
  assert.equal(teachersFor(0, 4, 8), 0);
  assert.deepEqual([1, 4, 5, 8].map((n) => teachersFor(n, 4, 8)), [1, 1, 2, 2]);
  assert.equal(teachersFor(9, 4, 8), 3); // 5 + 4 across two rooms
  assert.equal(roomsFor(9, 8), 2);
});

test("a maximum group size forces a second room and its own teacher", () => {
  assert.equal(teachersFor(10, 20, 8), 2); // ratio alone would need one
  assert.equal(teachersFor(10, 20, 20), 1);
});

test("hire points are the children at which staffing steps up", () => {
  assert.deepEqual(hirePoints(G({ ratio: 4, maxGroup: 8 }), 10), [1, 5, 9, 10]);
});

// Independent oracle: enumerate every enrolment with plain loops.
test("the chosen enrolment beats every other feasible one (brute-force check)", () => {
  const groups = cleanItems([
    { name: "a", tuition: 400, ratio: 4, maxGroup: 8, sqftPerChild: 40, demand: 9, varCost: 25 },
    { name: "b", tuition: 280, ratio: 6, maxGroup: 12, sqftPerChild: 30, demand: 11, varCost: 18 },
    { name: "c", tuition: 190, ratio: 10, maxGroup: 20, sqftPerChild: 25, demand: 14, varCost: 10 },
  ]).items;
  for (const [area, cap] of [[300, 0], [650, 0], [900, 0], [1200, 18], [2000, 0], [900, 9]]) {
    const shared = cleanShared({ ...EXAMPLE_SHARED, areaSqft: area, licensedCap: cap });
    const s = solve(groups, shared);
    let best = -Infinity;
    for (let a = 0; a <= groups[0].demand; a++) for (let b = 0; b <= groups[1].demand; b++) for (let c = 0; c <= groups[2].demand; c++) {
      if (a * 40 + b * 30 + c * 25 > area) continue;
      if (cap && a + b + c > cap) continue;
      best = Math.max(best, groupProfit(groups[0], a, shared) + groupProfit(groups[1], b, shared) + groupProfit(groups[2], c, shared));
    }
    assert.ok(Math.abs(s.profit - best) < 1e-6, `area ${area} cap ${cap}: ${s.profit} vs ${best}`);
    const used = s.counts[0] * 40 + s.counts[1] * 30 + s.counts[2] * 25;
    assert.ok(used <= area);
    if (cap) assert.ok(s.counts.reduce((x, y) => x + y, 0) <= cap);
  }
});

test("the plan the solver returns is worth exactly the profit it reports", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.ok(a.ok);
  const total = a.rows.reduce((t, r) => t + r.profit, 0);
  assert.ok(Math.abs(total - a.profit) < 1e-6);
  assert.ok(a.spaceUsed <= EXAMPLE_SHARED.areaSqft);
  assert.ok(Math.abs(a.net - (a.profit - EXAMPLE_SHARED.fixedWeekly)) < 1e-9);
  assert.ok(a.profit >= a.byTuition.profit - 1e-9 && a.profit >= a.bySpace.profit - 1e-9);
});

test("a group that loses money at the staffing cliff is left empty, not half filled", () => {
  const a = analyze([G({ tuition: 150, ratio: 4, varCost: 50, name: "loser" }), G({ name: "winner", tuition: 400, ratio: 10 })], { ...EXAMPLE_SHARED, areaSqft: 700 });
  assert.equal(a.rows[0].children, 0);
  assert.ok(a.rows[1].children > 0);
});

test("more floor space is never worth less, and the next unlock is reported", () => {
  const small = analyze(EXAMPLE_ITEMS, { ...EXAMPLE_SHARED, areaSqft: 1400 });
  const big = analyze(EXAMPLE_ITEMS, { ...EXAMPLE_SHARED, areaSqft: 3150 });
  assert.ok(big.profit >= small.profit);
  assert.ok(small.nextSpace && small.nextSpace.extraSqft > 0 && small.nextSpace.extraProfit > 0);
});

test("a stricter ratio rule never raises profit", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.ok(a.stricter.change <= 1e-9);
  assert.ok(a.dearer.change <= 1e-9);
});

test("a licensed capacity caps the headcount", () => {
  const a = analyze(EXAMPLE_ITEMS, { ...EXAMPLE_SHARED, licensedCap: 30 });
  assert.ok(a.children <= 30);
});

test("bad rows are reported and left out, blank rows are ignored", () => {
  const { items, warnings } = cleanItems([{}, { name: "x", tuition: 200, ratio: 0, demand: 4 }, { name: "y", tuition: 200, ratio: 5, demand: 4 }]);
  assert.equal(items.length, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /x:/);
  assert.equal(analyze([], EXAMPLE_SHARED).ok, false);
  assert.equal(analyze(EXAMPLE_ITEMS, { ...EXAMPLE_SHARED, areaSqft: 0 }).ok, false);
});

test("csv has a header and one row per group, with quotes escaped", () => {
  const a = analyze([G({ name: 'Say "hi"' })], { ...EXAMPLE_SHARED, areaSqft: 400 });
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith('"Say ""hi"""'));
});
