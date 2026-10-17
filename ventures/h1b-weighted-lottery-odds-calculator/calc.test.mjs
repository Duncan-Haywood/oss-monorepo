import { test } from "node:test";
import assert from "node:assert/strict";
import { odds, solveLambda, evaluate, parseCsv, sampleList, reportCsv, DEFAULT_POOL, WEIGHTS } from "./calc.mjs";

test("expected selections match the target in the first draw", () => {
  const o = odds(DEFAULT_POOL, { advancedShare: 0 });
  const sel = Object.values(o.byLevel).reduce((s, b) => s + b.registrations * b.regular, 0);
  assert.ok(Math.abs(sel - 100000) < 1, String(sel));
});

test("higher wage level always means higher odds, and weights are 1-4", () => {
  assert.deepEqual(WEIGHTS, { 1: 1, 2: 2, 3: 3, 4: 4 });
  const o = odds(DEFAULT_POOL);
  for (const key of ["regular", "advanced"]) for (const l of [1, 2, 3]) assert.ok(o.byLevel[l + 1][key] > o.byLevel[l][key]);
});

test("an advanced degree never lowers the odds", () => {
  const o = odds(DEFAULT_POOL);
  for (const l of [1, 2, 3, 4]) assert.ok(o.byLevel[l].advanced >= o.byLevel[l].regular);
});

test("a flat pool at one level reproduces the flat odds", () => {
  const o = odds({ 1: 200000, 2: 0, 3: 0, 4: 0 }, { selections: 50000, advancedShare: 0 });
  assert.ok(Math.abs(o.byLevel[1].regular - o.flatOdds) < 0.1);
});

test("selecting more than the pool gives certainty, selecting none gives zero", () => {
  assert.equal(solveLambda({ 1: 10, 2: 0, 3: 0, 4: 0 }, 50), Infinity);
  assert.equal(odds(DEFAULT_POOL, { selections: 0, advancedSelections: 0 }).byLevel[4].regular, 0);
  assert.equal(solveLambda({ 1: 0, 2: 0, 3: 0, 4: 0 }, 5), 0);
});

test("parseCsv reads levels as digits or roman numerals and flags a missing column", () => {
  const rows = parseCsv("Name,Wage level,Master's\nA,IV,yes\nB,II,no\nC,3,Y");
  assert.deepEqual(rows.map((r) => [r.level, r.advanced]), [[4, true], [2, false], [3, true]]);
  assert.match(parseCsv("name,salary\nA,5").error, /wage level/);
});

test("evaluate gives per-person odds, the level-up gain and a union probability", () => {
  const r = evaluate(sampleList(), DEFAULT_POOL);
  assert.equal(r.summary.count, 5);
  const ben = r.rows.find((x) => x.name.startsWith("Ben"));
  const chen = r.rows.find((x) => x.name.startsWith("Chen"));
  assert.ok(ben.gainNext > 0);
  assert.equal(chen.gainNext, null);
  assert.ok(r.summary.atLeastOne > Math.max(...r.rows.map((x) => x.prob)) - 1e-9);
  const sum = r.rows.reduce((s, x) => s + x.prob, 0);
  assert.ok(Math.abs(sum - r.summary.expected) < 1e-9);
});

test("a bad level is reported per line and does not drop the rest", () => {
  const r = evaluate("name,level\nA,7\nB,2", DEFAULT_POOL);
  assert.equal(r.summary.errors, 1);
  assert.match(r.rows[0].error, /Line 2/);
  assert.equal(r.summary.count, 1);
});

test("report csv has a row per candidate", () => {
  const csv = reportCsv(evaluate(sampleList(), DEFAULT_POOL));
  assert.equal(csv.trim().split("\n").length, 6);
});
