import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTable } from "./calc.mjs";
import { planDesign } from "./plan.mjs";

// Six regions share one demand pattern; "Wild" has large idiosyncratic swings.
function history({ days = 120, seed = 11 } = {}) {
  let a = seed;
  const rnd = () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; };
  const names = ["A", "B", "C", "D", "E", "Wild"], scale = [1, 0.8, 0.9, 0.6, 0.7, 0.9], noise = [0.03, 0.03, 0.03, 0.03, 0.03, 0.4];
  const rows = ["date," + names.join(",")];
  for (let d = 0; d < days; d++) {
    const dt = new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
    const common = 500 * (1 + 0.12 * Math.sin(d / 6)) * (1 + 0.1 * Math.sin((2 * Math.PI * (d % 7)) / 7));
    rows.push(dt + "," + names.map((_, i) => (common * scale[i] * (1 + noise[i] * (rnd() - 0.5) * 2)).toFixed(2)).join(","));
  }
  return parseTable(rows.join("\n"));
}

test("ranked designs are sorted by detectable lift and avoid the erratic region as a test region", () => {
  const r = planDesign(history(), { testSize: 2, length: 14 });
  assert.ok(!r.error, r.error);
  assert.equal(r.total, 15);
  assert.equal(r.evaluated, 15);
  for (let i = 1; i < r.designs.length; i++) assert.ok(r.designs[i].mde >= r.designs[i - 1].mde);
  assert.ok(!r.designs[0].tests.includes("Wild"), JSON.stringify(r.designs[0]));
  assert.ok(r.worst.mde > r.designs[0].mde * 1.5, `${r.worst.mde} vs ${r.designs[0].mde}`);
  assert.ok(r.worst.tests.includes("Wild"));
});

test("a longer campaign never needs a bigger lift to be seen in this clean panel", () => {
  const r = planDesign(history(), { testSize: 2, length: 14 });
  const m = r.byLength.filter((x) => x.mde !== null);
  assert.ok(m.length >= 3);
  assert.ok(m[m.length - 1].mde < m[0].mde, JSON.stringify(m));
});

test("is repeatable and samples when there are too many splits", () => {
  const p = history();
  const a = planDesign(p, { testSize: 3, length: 14, maxCandidates: 8 });
  const b = planDesign(p, { testSize: 3, length: 14, maxCandidates: 8 });
  assert.equal(a.sampled, true);
  assert.equal(a.evaluated, 8);
  assert.deepEqual(a.designs, b.designs);
  assert.match(a.warnings.join(" "), /sampled at random/);
});

test("refuses bad input in plain words", () => {
  const p = history();
  assert.match(planDesign(p, { testSize: 5, length: 14 }).error, /at most 4/);
  assert.match(planDesign(p, { testSize: 0, length: 14 }).error, /at least 1/);
  assert.match(planDesign(p, { testSize: 2, length: 2 }).error, /at least 3/);
  assert.match(planDesign(history({ days: 30 }), { testSize: 2, length: 14 }).error, /at least 28|history/);
  assert.match(planDesign({ error: "bad" }).error, /bad/);
});
