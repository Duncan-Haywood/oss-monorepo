import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, choose, evaluate, optimize, parseSurvey, toCsv, EXAMPLE_SHARED, SHARED_DEFAULTS } from "./calc.mjs";

const R = (...v) => ({ v, w: 1 });

test("customers buy the plan with the largest surplus, or nothing", () => {
  const rows = [R(10, 30, 60), R(10, 30, 60), R(3, 0, 0)];
  // prices 8/20/55: surpluses 2/10/5 -> Pro; 3rd: 3-8 < 0 -> none
  assert.deepEqual(choose(rows, [8, 20, 55]), [1, 1, -1]);
  // a plan with no stated maximum price (0) is never bought
  assert.deepEqual(choose([R(0, 0, 40)], [5, 10, 20]), [2]);
});

test("a tie in surplus goes to the higher-priced plan", () => {
  assert.deepEqual(choose([R(10, 20)], [5, 15]), [1]); // surplus 5 and 5
});

test("evaluate counts weighted buyers, revenue and profit", () => {
  const rows = [{ v: [10, 0], w: 3 }, { v: [4, 30], w: 2 }];
  const e = evaluate(rows, [8, 20], [1, 5]);
  assert.deepEqual(e.buyers, [3, 2]);
  assert.equal(e.revenue, 3 * 8 + 2 * 20);
  assert.equal(e.profit, 3 * 7 + 2 * 15);
  assert.equal(e.none, 0);
});

// Ground truth: every ordered combination of every distinct surveyed price (small surveys stay under the candidate cap).
function brute(rows, costs) {
  const k = costs.length;
  const vals = costs.map((_, t) => [...new Set(rows.map((r) => r.v[t]).filter((x) => x > 0 && x >= costs[t]))].sort((a, b) => a - b));
  let best = -Infinity;
  const cur = [];
  (function go(t) {
    if (t === k) { best = Math.max(best, evaluate(rows, cur, costs).profit); return; }
    for (const p of vals[t]) { if (t > 0 && p < cur[t - 1]) continue; cur[t] = p; go(t + 1); }
  })(0);
  return best;
}

test("optimizer is never worse than exhaustive search over surveyed prices", () => {
  let s = 99;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 60; trial++) {
    const k = 1 + (trial % 3);
    const n = 6 + Math.floor(rnd() * 14);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const base = 3 + rnd() * 40;
      rows.push({ v: Array.from({ length: k }, (_, t) => (rnd() < 0.15 ? 0 : Math.round(base * (0.6 + 0.5 * t + rnd() * 0.4)))), w: 1 + Math.floor(rnd() * 3) });
    }
    const costs = Array.from({ length: k }, (_, t) => t + 1);
    const want = brute(rows, costs);
    const got = optimize(rows, costs, null);
    if (want === -Infinity) { assert.equal(got, null); continue; }
    assert.ok(got.profit >= want - 1e-6, `trial ${trial}: got ${got.profit}, exhaustive ${want}`);
  }
});

test("the optimum is never worse than the current prices", () => {
  const a = analyze(EXAMPLE_SHARED);
  assert.ok(a.ok);
  assert.ok(a.best.profit >= a.now.profit - 1e-9);
  assert.ok(a.best.prices[0] <= a.best.prices[1] && a.best.prices[1] <= a.best.prices[2]);
  assert.equal(a.best.buyers.reduce((x, y) => x + y, 0), a.best.paying);
});

test("sensitivity: moving any price 10% either way does not beat the optimum", () => {
  const a = analyze(EXAMPLE_SHARED);
  for (const s of a.sens) { assert.ok(s.down <= 1e-9); assert.ok(s.up <= 1e-9); }
});

test("parseSurvey skips a header, reads blanks and dashes as no interest, and takes a weight", () => {
  const w = [];
  const rows = parseSurvey("Starter, Pro\n10, 25, 4\n-, 40\n$8,\n", 2, w);
  assert.deepEqual(rows, [{ v: [10, 25], w: 4 }, { v: [0, 40], w: 1 }, { v: [8, 0], w: 1 }]);
  assert.deepEqual(w, []);
});

test("parseSurvey reports bad rows by line number instead of guessing", () => {
  const w = [];
  const rows = parseSurvey("10, 20\n10\nabc, 5\n5, 9, -2\n", 2, w);
  assert.equal(rows.length, 1);
  assert.equal(w.length, 3);
  assert.match(w[0], /Line 2/);
});

test("analyze refuses a survey that is too small or a plan list that is wrong", () => {
  assert.equal(analyze({ ...SHARED_DEFAULTS, survey: "10, 20, 30" }).ok, false);
  assert.equal(analyze({ ...SHARED_DEFAULTS, names: "A, B, C, D" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, costs: "x" }).ok, false);
  assert.equal(analyze({ ...EXAMPLE_SHARED, current: "9, 29" }).ok, false);
});

test("a price is never suggested below its cost", () => {
  const a = analyze({ names: "A", costs: "50", current: "", survey: "10\n20\n30\n40\n60\n70\n80" });
  assert.ok(a.ok);
  assert.ok(a.best.prices[0] >= 50);
});

test("no single price move improves the answer (it is a local optimum on the exact breakpoints)", () => {
  let s = 5;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let trial = 0; trial < 20; trial++) {
    const rows = Array.from({ length: 25 }, () => { const b = 5 + rnd() * 50; return R(Math.round(b * 0.6), Math.round(b), Math.round(b * 1.7)); });
    const best = optimize(rows, [1, 2, 3]);
    for (let t = 0; t < 3; t++) {
      for (const f of [0.9, 0.95, 0.99, 1.01, 1.05, 1.1]) {
        const p = best.prices.slice(); p[t] = Math.round(p[t] * f * 100) / 100;
        if (p[0] > p[1] || p[1] > p[2]) continue;
        assert.ok(evaluate(rows, p, [1, 2, 3]).profit <= best.profit + 1e-6, `trial ${trial} plan ${t} x${f}`);
      }
    }
  }
});

test("a more valuable top plan pulls high-value customers up the ladder", () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(R(10, 12, 0));
  for (let i = 0; i < 20; i++) rows.push(R(10, 30, 90));
  const best = optimize(rows, [1, 2, 3]);
  assert.ok(best.buyers[2] > 0, "the high-value group should be sold the top plan");
});

test("CSV export has a header and one row per plan", () => {
  const a = analyze(EXAMPLE_SHARED);
  const lines = toCsv(a).trim().split("\n");
  assert.equal(lines.length, 4);
  assert.match(lines[0], /current_price/);
});
