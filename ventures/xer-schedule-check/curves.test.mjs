import { test } from "node:test";
import assert from "node:assert/strict";
import { curveTable, cumulative, tailF, LINEAR_F } from "./curves.mjs";

// the rows P6 6.0 exported in the public hospital file (eval/resource-curves-2026-11-21.md)
const row = (id, name, pts) => ({ curv_id: id, curv_name: name, default_flag: "Y", ...Object.fromEntries(pts.map((v, k) => [`pct_usage_${k}`, String(v)])) });
const BACK = [0, ...Array(10).fill(3.5), ...Array(10).fill(6.5)];
const LIN = [0, ...Array(20).fill(5)];
const BELL = [0, 0.5, 0.5, 1.5, 1.5, 4, 4, 7.5, 7.5, 11.5, 11.5, 11.5, 11.5, 7.5, 7.5, 4, 4, 1.5, 1.5, 0.5, 0.5];

test("P6's curves read as twenty shares of the duration, point 0 at the start", () => {
  const { curves, scaled, empty } = curveTable({ RSRCCURVDATA: [row("10", "Back Loaded", BACK), row("13", "Linear", LIN), row("11", "Bell Shaped", BELL)] });
  assert.deepEqual(scaled, []);
  assert.deepEqual(empty, []);
  const b = curves.get("10");
  assert.equal(b.shares.length, 20);
  assert.ok(Math.abs(b.F(0.5) - 0.35) < 1e-12);
  assert.ok(Math.abs(b.F(0.25) - 0.175) < 1e-12);
  assert.equal(b.F(1), 1);
  assert.equal(b.F(0), 0);
  assert.equal(curves.get("13").linear, true);
  assert.equal(b.linear, false);
  for (const f of [0.1, 0.33, 0.5, 0.77]) assert.ok(Math.abs(curves.get("13").F(f) - f) < 1e-12);
  // bell: half by the middle, symmetric
  const bell = curves.get("11");
  assert.ok(Math.abs(bell.F(0.5) - 0.5) < 1e-12);
  assert.ok(Math.abs(bell.F(0.3) + bell.F(0.7) - 1) < 1e-12);
});

test("a curve not adding to 100 is scaled and named; one with nothing is left out", () => {
  const { curves, scaled, empty } = curveTable({ RSRCCURVDATA: [row("1", "Half", [0, ...Array(20).fill(2.5)]), row("2", "Nothing", Array(21).fill(0)), row("3", "Start", [10, ...Array(20).fill(4.5)])] });
  assert.deepEqual(scaled, ["Half (50)"]);
  assert.deepEqual(empty, ["Nothing"]);
  assert.ok(Math.abs(curves.get("1").F(0.5) - 0.5) < 1e-12);
  assert.equal(curves.has("2"), false);
  // point 0 goes into the first twentieth
  assert.ok(Math.abs(curves.get("3").F(0.05) - 0.145) < 1e-12);
});

test("the tail of a curve after a share of the duration, rescaled to what is left", () => {
  const F = cumulative([0.1, 0.2, 0.3, 0.4]);
  const t = tailF(F, 0.5); // what is left: 0.3 then 0.4, of 0.7
  assert.ok(Math.abs(t(0.5) - 0.3 / 0.7) < 1e-12);
  assert.equal(t(1), 1);
  assert.equal(tailF(F, 0), F);
  assert.equal(tailF(F, 1), LINEAR_F);
});
