import { test } from "node:test";
import assert from "node:assert/strict";
import { takeoff, samplePlan } from "./engine.mjs";
import { panelizeWall, panelParts } from "./panels.mjs";

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

test("per-panel parts: plates are trimmed to the panel span and total the wall's plate length", () => {
  for (const w of r.walls) {
    const pan = panelizeWall(w, 144);
    const parts = panelParts(w, pan);
    const plateIn = parts.flatMap((p) => p.pieces.filter((x) => x.kind === "plate")).reduce((t, x) => t + x.qty * x.length, 0);
    const plateWall = w.members.filter((m) => m.kind === "plate").reduce((t, m) => t + m.length, 0);
    assert.ok(Math.abs(plateIn - plateWall) < 1e-6, w.id);
    const framing = parts.flatMap((p) => p.pieces.filter((x) => x.kind !== "plate")).reduce((t, x) => t + x.qty, 0);
    assert.equal(framing, w.members.filter((m) => m.kind !== "plate").length, w.id);
    assert.ok(parts.every((p) => p.lb > 0 && p.pieces.every((x) => x.length <= p.width + 1e-6 || x.kind !== "plate")));
  }
});

test("a panel's weight matches a hand count: one 2x4 stud of 92.625 in is 1.5*3.5*92.625/1728*28 = 7.9 lb", () => {
  const w = { id: "t", length: 48, members: [{ kind: "stud", x: 0, w: 1.5, size: "2x4", length: 92.625, label: "end stud" }] };
  const [p] = panelParts(w, panelizeWall(w, 144));
  assert.equal(p.lb, 7.9);
  const [q] = panelParts(w, panelizeWall(w, 144), { pcf: 0 });
  assert.equal(q.lb, 0);
});

test("sheathing weight: width x height less openings in the span, at the typed lb per sq ft; off by default and none on a gable", () => {
  const w = { id: "t", length: 96, height: 96, members: [{ kind: "stud", x: 0, w: 1.5, size: "2x4", length: 92.625, label: "end stud" }] };
  const pan = panelizeWall(w, 144);
  assert.equal(panelParts(w, pan)[0].sheathLb, 0);
  const [a] = panelParts(w, pan, { sheathPsf: 1.5 });
  assert.equal(a.sheathLb, 96); // 96x96 in = 64 sq ft x 1.5
  assert.equal(a.totalLb, Math.round((a.lb + a.sheathLb) * 10) / 10);
  const [b] = panelParts(w, pan, { sheathPsf: 1.5, openings: [{ offset: 24, width: 36, height: 48 }, { offset: 90, width: 36, height: 48 }] });
  assert.equal(b.sheathLb, (64 - (36 * 48 + 6 * 48) / 144) * 1.5); // second opening only 6 in inside the wall
  assert.equal(panelParts({ ...w, gable: { pitch: 6 } }, pan, { sheathPsf: 1.5 })[0].sheathLb, 0); // a gable record without its eave height is skipped
});

test("sheathing weight on a gable wall: eave rectangle plus the triangle under each panel", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "G", length: 240, stud: "2x4", gable: { pitch: 6, peak: 90 }, openings: [] }];
  const w = takeoff(plan).walls[0];
  assert.ok(w.gable.eave > 0);
  const exact = (240 * w.gable.eave + 240 * w.gable.peakRise / 2) / 144; // lb at 1 lb/sq ft
  for (const max of [240, 100]) {
    const parts = panelParts(w, panelizeWall(w, max), { sheathPsf: 1 });
    assert.equal(parts.length > 1, max === 100);
    assert.ok(Math.abs(parts.reduce((t, p) => t + p.sheathLb, 0) - exact) < 0.05 * parts.length, `panel areas add up (${max})`);
  }
});

test("panel order: pooled panel pieces cover every panel piece and cost about what the whole-wall order does", async () => {
  const { panelOrder } = await import("./panels.mjs");
  const plan = samplePlan();
  const po = panelOrder(r, plan, 144);
  assert.equal(po.panels, r.walls.reduce((t, w) => t + panelizeWall(w, 144).panels.length, 0));
  // lumber is conserved: pieces ordered = pieces in the panels, and a panel plate break never loses length
  const inCuts = po.cuts.reduce((t, c) => t + c.qty * c.length, 0);
  const inBars = po.orders.reduce((t, o) => t + o.bars.reduce((s, b) => s + b.cuts.reduce((u, c) => u + c.length, 0), 0), 0);
  assert.ok(Math.abs(inCuts - inBars) < 1e-6);
  assert.ok(inCuts >= r.cuts.reduce((t, c) => t + c.qty * c.length, 0) - 1e-6);
  assert.ok(Math.abs(po.cost - po.wholeWallCost) / po.wholeWallCost < 0.01);
  assert.equal(po.wholeWallCost, r.summary.cost);
});

test("panel pull lists place every panel piece once, on boards that exist", async () => {
  const { panelOrder, panelPullText } = await import("./panels.mjs");
  const plan = samplePlan();
  const po = panelOrder(r, plan, 144);
  const placed = po.assignment.panels.reduce((t, p) => t + p.boards.reduce((u, b) => u + b.cuts.length, 0), 0);
  const ordered = po.cuts.reduce((t, c) => t + c.qty, 0);
  assert.equal(placed, ordered);
  assert.equal(po.assignment.panels.length, po.panels);
  assert.ok(po.assignment.sharedBoards <= po.assignment.boards);
  for (const p of po.assignment.panels) for (const b of p.boards) assert.ok(b.cuts.reduce((t, c) => t + c, 0) <= b.boardLength + 1e-6);
  assert.ok(panelPullText(po).length > po.panels);
});

test("a gable wall's sloped plates are trimmed along the slope, not by their horizontal run", () => {
  const plan = samplePlan();
  plan.walls = [{ id: "G", length: 240, stud: "2x4", gable: { pitch: 6, peak: 90 }, openings: [] }];
  const g = takeoff(plan).walls[0];
  const pan = panelizeWall(g, 96);
  const parts = panelParts(g, pan);
  const sloped = g.members.filter((m) => m.sloped && m.label === "top plate");
  const total = parts.flatMap((p) => p.pieces).filter((x) => x.label === "top plate").reduce((t, x) => t + x.length * x.qty, 0);
  assert.ok(Math.abs(total - sloped.reduce((t, m) => t + m.length, 0)) < 0.2, `top plate pieces ${total} vs whole ${sloped.reduce((t, m) => t + m.length, 0)}`);
});
