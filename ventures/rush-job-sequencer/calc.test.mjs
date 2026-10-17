import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, cleanItems, solve, runOrder, lateCost, toCsv, EXAMPLE_ITEMS, EXAMPLE_SHARED, MAX_JOBS, money } from "./calc.mjs";

function permutations(a) {
  if (a.length <= 1) return [a];
  return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const job = (name, hours, due, flat = 0, perHour = 0) => ({ name, hours, due, flat, perHour });

test("lateCost is zero on time or with no due date, flat plus hourly when late", () => {
  const j = job("a", 3, 10, 100, 5);
  assert.equal(lateCost(j, 10), 0);
  assert.equal(lateCost(j, 12), 110);
  assert.equal(lateCost(job("b", 3, null, 100, 5), 999), 0);
});

test("exact solver matches brute force over every order on random queues", () => {
  const r = rng(7);
  for (let trial = 0; trial < 60; trial++) {
    const n = 2 + Math.floor(r() * 5);
    const jobs = Array.from({ length: n }, (_, i) =>
      job("j" + i, 1 + Math.floor(r() * 9), r() < 0.2 ? null : Math.floor(r() * 30), r() < 0.5 ? Math.floor(r() * 300) : 0, r() < 0.7 ? Math.floor(r() * 50) : 0));
    const start = Math.floor(r() * 5);
    const sol = solve(jobs, start);
    const brute = Math.min(...permutations(jobs.map((_, i) => i)).map((o) => runOrder(jobs, o, start).total));
    assert.ok(Math.abs(sol.cost - brute) < 1e-6, `trial ${trial}: ${sol.cost} vs ${brute}`);
    assert.ok(Math.abs(runOrder(jobs, sol.order, start).total - sol.cost) < 1e-6, "returned order achieves the cost");
    assert.deepEqual([...sol.order].sort((a, b) => a - b), jobs.map((_, i) => i));
  }
});

test("when everything fits, cost is zero and order is earliest due date", () => {
  const jobs = [job("late", 2, 20), job("early", 2, 5), job("mid", 2, 10)];
  const sol = solve(jobs, 0);
  assert.equal(sol.cost, 0);
  assert.deepEqual(sol.order, [1, 2, 0]);
});

test("a flat-fee job is protected over cheaper hourly lateness", () => {
  const jobs = [job("hourly", 5, 5, 0, 10), job("flat", 5, 5, 500, 0)];
  const sol = solve(jobs, 0);
  assert.deepEqual(sol.order, [1, 0]); // the flat-fee job goes first and finishes on time; the other is 5h late = $50
  assert.equal(sol.cost, 50);
});

test("busy hours push every finish later", () => {
  const jobs = [job("a", 4, 4, 100, 0)];
  assert.equal(solve(jobs, 0).cost, 0);
  assert.equal(solve(jobs, 1).cost, 100);
});

test("cleanItems drops blank jobs, warns on named job without hours, caps at the maximum", () => {
  const { items, warnings } = cleanItems([{ name: "x", hours: 0 }, { hours: 3 }, { name: "y", hours: "2", dueIn: "" }]);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Job 2");
  assert.equal(items[1].due, null);
  assert.equal(warnings.length, 1);
  const many = Array.from({ length: MAX_JOBS + 2 }, (_, i) => ({ name: "n" + i, hours: 1 }));
  const c = cleanItems(many);
  assert.equal(c.items.length, MAX_JOBS);
  assert.equal(c.warnings.length, 2);
});

test("analyze on the example beats or ties every rule of thumb and reports the rest", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  assert.ok(a.ok);
  for (const r of a.rules) assert.ok(r.cost >= a.cost - 1e-6, r.label);
  assert.equal(a.rules.length, 4);
  assert.ok(a.capacity[1].saving >= a.capacity[0].saving - 1e-6);
  assert.equal(a.plan.steps.length, EXAMPLE_ITEMS.length);
  assert.equal(a.finishAll, EXAMPLE_SHARED.busyHours + a.totalHours);
  assert.ok(a.cost > 0, "the example queue is overloaded on purpose");
  assert.match(toCsv(a).split("\n")[0], /^position,job/);
  assert.equal(toCsv(a).trim().split("\n").length, EXAMPLE_ITEMS.length + 1);
});

test("removing the costliest job never raises the cost", () => {
  const a = analyze(EXAMPLE_ITEMS, EXAMPLE_SHARED);
  if (a.costliest) assert.ok(a.costliest.saving > 0);
});

test("empty input and a single job are handled", () => {
  assert.equal(analyze([], {}).ok, false);
  const a = analyze([{ name: "solo", hours: 3, dueIn: 1, flatFee: 50, perHour: 10 }], {});
  assert.ok(a.ok);
  assert.equal(a.cost, 70);
  assert.equal(a.costliest, null);
});

test("fourteen jobs solve quickly", () => {
  const items = Array.from({ length: 14 }, (_, i) => ({ name: "j" + i, hours: 1 + (i % 5), dueIn: 3 + i * 2, flatFee: i * 10, perHour: 5 + i }));
  const t = Date.now();
  const a = analyze(items, { busyHours: 1 });
  assert.ok(a.ok);
  assert.ok(Date.now() - t < 5000);
});

test("money formats", () => assert.equal(money(1234.4), "$1,234"));
