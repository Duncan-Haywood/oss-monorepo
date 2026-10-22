import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { panelizeWall } from "./panels.mjs";

const r = takeoff(samplePlan());

test("panels cover the wall, stay under the limit and never cut through a framing member", () => {
  for (const w of r.walls) {
    const s = panelizeWall(w, 144);
    assert.equal(s.panels[0].x0, 0);
    assert.equal(s.panels.at(-1).x1, w.length);
    assert.ok(Math.abs(s.panels.reduce((t, p) => t + p.width, 0) - w.length) < 1e-6);
    assert.ok(!s.over, w.id);
    assert.ok(s.panels.every((p) => p.width <= 144 + 1e-6));
    for (const c of s.cuts) for (const m of w.members) if (m.kind !== "plate") assert.ok(!(m.x + 1e-6 < c && c < m.x + m.w - 1e-6), `${w.id} cut ${c} crosses ${m.label}`);
    // every member lands in exactly one panel
    const seen = s.panels.flatMap((p) => p.members).sort((a, b) => a - b);
    assert.deepEqual(seen, w.members.map((_, i) => i));
  }
});

test("a 40 ft wall under a 12 ft limit takes the fewest panels (4) and they are even", () => {
  const front = r.walls[0];
  const s = panelizeWall(front, 144);
  assert.equal(s.panels.length, 4);
  assert.ok(Math.max(...s.panels.map((p) => p.width)) - Math.min(...s.panels.map((p) => p.width)) < 40);
});

test("a wall shorter than the limit is one panel; an impossible limit is flagged, not hidden", () => {
  assert.equal(panelizeWall(r.walls[5], 400).panels.length, 1);
  const tight = panelizeWall(r.walls[0], 20);
  assert.ok(tight.over);
});
