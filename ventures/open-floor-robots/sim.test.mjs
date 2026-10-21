import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRESETS, VARIANTS, rasterise, freeCount, plan, laneWidth, planLength, planTurning, planTimeS, runtimeH,
  paint, coverage, radii, summarise, cspace } from "./sim.mjs";

const ref = JSON.parse(readFileSync(new URL("./fixtures/reference.json", import.meta.url), "utf8"));
const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

for (const r of ref.plans) {
  test(`${r.room} / ${r.variant}: same grid, path and coverage as the Python planner`, () => {
    const g = rasterise(PRESETS[r.room]);
    assert.equal(g.w, r.w);
    assert.equal(g.h, r.h);
    assert.equal(freeCount(g), r.free);
    const v = VARIANTS[r.variant];
    const p = plan(g, { cleanWidth: laneWidth(v), overlap: 0.10 });
    assert.equal(p.cells, r.cells);
    assert.equal(p.lanes, r.lanes);
    close(p.laneSpacing, r.lane_spacing);
    assert.deepEqual(p.waypoints, r.waypoints);
    assert.deepEqual(p.phases, r.phases);
    close(planLength(p), r.length);
    close(planLength(p, "edge"), r.edge_length);
    close(planTurning(p), r.turning);
    close(planTimeS(p), r.time_s);
    close(runtimeH(v), r.runtime_h);
    for (const t of v.tools) close(coverage(g, paint(g, p.waypoints, p.phases, radii(t))), r.coverage[t.name]);
  });
}

test("the path never leaves the robot-centre region", () => {
  const g = rasterise(PRESETS.living);
  const p = plan(g);
  const mask = cspace(g, 0.175);
  for (const [i, j] of p.waypoints) assert.equal(mask[j * g.w + i], 1);
});

test("summarise gives the numbers the page shows", () => {
  const s = summarise("bedroom", "combo");
  assert.ok(s.coverage.vacuum > s.coverage.mop, "the side brush reaches the walls; the pad does not");
  assert.ok(s.runtimeMin > 60 && s.runtimeMin < 200);
  assert.ok(s.floorM2 > 7 && s.floorM2 < 8);
});
