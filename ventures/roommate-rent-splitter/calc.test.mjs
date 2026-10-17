import { test } from "node:test";
import assert from "node:assert/strict";
import { solve, bestAssignment, envyFreePrices, roundPrices, envyReport, normaliseBids, validateInput, sampleInput, resultText, resultCsv, serializeState, parseState, MAX_PEOPLE } from "./calc.mjs";

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function randomInput(r, n, cents = false) {
  const rooms = Array.from({ length: n }, (_, i) => "R" + i);
  const people = Array.from({ length: n }, (_, i) => ({ name: "P" + i, bids: Array.from({ length: n }, () => Math.round(r() * 1500) + 1) }));
  return { totalRent: 1000 + Math.round(r() * 5000), rooms, people, cents };
}

test("worked example: equal-valuing Cleo, Ana and Ben get equal surplus", () => {
  const res = solve(sampleInput());
  assert.ok(res.ok);
  assert.deepEqual(res.rows.map((r) => r.rent), [1200, 1000, 800]);
  assert.deepEqual(res.rows.map((r) => r.surplus), [200, 200, 200]);
  assert.equal(res.envyFree, true);
});

test("rent always adds up exactly and nobody envies, across many random households", () => {
  const r = rng(42);
  for (let k = 0; k < 400; k++) {
    const n = 2 + (k % (MAX_PEOPLE - 1));
    const inp = randomInput(r, n, k % 3 === 0);
    const res = solve(inp);
    assert.ok(res.ok);
    const sum = res.prices.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(sum - inp.totalRent) < 1e-6, `sum ${sum} vs ${inp.totalRent}`);
    assert.ok(new Set(res.assignment).size === n, "every room held by exactly one person");
    // exact prices are envy-free to numerical tolerance
    assert.deepEqual(envyReport(res.values, res.assignment, res.exact, 1e-6), [], `exact envy k=${k}`);
    // rounded prices are within one step of envy-free
    const step = inp.cents ? 0.01 : 1;
    assert.deepEqual(envyReport(res.values, res.assignment, res.prices, step * 2 + 1e-6), [], `rounded envy k=${k}`);
  }
});

test("assignment maximises total stated value (checked against brute force)", () => {
  const r = rng(7);
  const perms = (a) => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
  for (let k = 0; k < 60; k++) {
    const n = 2 + (k % 5);
    const v = Array.from({ length: n }, () => Array.from({ length: n }, () => r() * 1000));
    const best = Math.max(...perms([...Array(n).keys()]).map((p) => p.reduce((s, j, i) => s + v[i][j], 0)));
    assert.ok(Math.abs(bestAssignment(v).total - best) < 1e-6);
  }
});

test("maximin: raising the minimum surplus is impossible without breaking envy-freeness", () => {
  const r = rng(99);
  for (let k = 0; k < 100; k++) {
    const inp = randomInput(r, 2 + (k % 4));
    const res = solve(inp);
    // Total surplus is fixed (sum of values minus rent), so the best possible minimum is the average.
    const total = res.rows.reduce((s, x) => s + x.surplus, 0);
    assert.ok(res.minSurplus <= total / inp.people.length + 1e-6);
  }
  // identical tastes: everybody gets exactly the same surplus
  const same = { totalRent: 2400, rooms: ["A", "B", "C"], people: ["x", "y", "z"].map((n) => ({ name: n, bids: [1000, 800, 600] })) };
  const res = solve(same);
  const s = res.rows.map((x) => x.surplus);
  assert.ok(Math.max(...s) - Math.min(...s) < 1.01);
});

test("two people who disagree about the big room", () => {
  const res = solve({ totalRent: 2000, rooms: ["Big", "Small"], people: [{ name: "A", bids: [1200, 800] }, { name: "B", bids: [1000, 1000] }] });
  assert.equal(res.rows[0].roomName, "Big");
  assert.equal(res.rows[0].rent + res.rows[1].rent, 2000);
  assert.ok(res.rows[0].rent > res.rows[1].rent);
});

test("bids are scaled to the rent, so any scale works", () => {
  const a = solve({ totalRent: 3000, rooms: ["a", "b", "c"], people: [{ name: "1", bids: [14, 9, 7] }, { name: "2", bids: [9, 12, 9] }, { name: "3", bids: [1, 1, 1] }] });
  const b = solve({ totalRent: 3000, rooms: ["a", "b", "c"], people: [{ name: "1", bids: [1400, 900, 700] }, { name: "2", bids: [900, 1200, 900] }, { name: "3", bids: [10, 10, 10] }] });
  assert.deepEqual(a.prices, b.prices);
  assert.deepEqual(normaliseBids([1, 1], 100), [50, 50]);
});

test("shared costs split evenly and add to each total", () => {
  const res = solve(sampleInput());
  assert.ok(res.rows.every((r) => r.sharedShare === 80 && r.total === r.rent + 80));
});

test("rounding keeps the total exact", () => {
  assert.equal(roundPrices([333.33, 333.33, 333.34], 1000).reduce((s, x) => s + x, 0), 1000);
  const c = roundPrices([100.004, 200.004, 299.992], 600, 0.01);
  assert.ok(Math.abs(c.reduce((s, x) => s + x, 0) - 600) < 1e-9);
});

test("validation rejects bad input", () => {
  assert.ok(validateInput({ totalRent: 0, people: [], rooms: [] }).length >= 2);
  assert.ok(validateInput({ totalRent: 1000, people: [{ name: "a", bids: [1, 2] }, { name: "b", bids: [1, -1] }], rooms: ["x", "y"] }).some((e) => /zero or more/.test(e)));
  assert.ok(validateInput({ totalRent: 1000, people: [{ name: "a", bids: [0, 0] }, { name: "b", bids: [1, 1] }], rooms: ["x", "y"] }).some((e) => /some value/.test(e)));
  assert.equal(solve({ totalRent: 1000, people: [], rooms: [] }).ok, false);
});

test("exports and save file round-trip", () => {
  const inp = sampleInput();
  const res = solve(inp);
  assert.match(resultText(res, inp), /Ana: Master with bath - \$1,200\.00/);
  assert.match(resultCsv(res), /^person,room,rent/);
  const back = parseState(serializeState(inp));
  assert.deepEqual(solve(back.state).prices, res.prices);
  assert.ok(parseState("nope").error);
  assert.ok(parseState('{"kind":"other"}').error);
});

test("envyFreePrices on a hand-checked 2x2", () => {
  // A values big 60/small 40, B values 50/50, rent 100. A gets big.
  const v = [[60, 40], [50, 50]];
  const p = envyFreePrices(v, [0, 1], 100);
  assert.ok(Math.abs(p[0] + p[1] - 100) < 1e-9);
  assert.ok(Math.abs((60 - p[0]) - (50 - p[1])) < 1e-6, "equal surplus when the constraints allow it");
});
