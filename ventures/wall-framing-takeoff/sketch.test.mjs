import { test } from "node:test";
import assert from "node:assert/strict";
import { emptySketch, addWall, addOpening, snapPoint, pointAtLength, nearestWall, removeWall, moveCorner, moveWall, moveOpening, resizeOpening, planFromSketch, sketchToDxf } from "./sketch.mjs";
import { takeoff } from "./engine.mjs";

const ft = (n) => n * 12;
function house() {
  const sk = emptySketch();
  const c = [[0, 0], [ft(40), 0], [ft(40), ft(28)], [0, ft(28)]];
  const ws = c.map((p, i) => addWall(sk, { x: p[0], y: p[1] }, { x: c[(i + 1) % 4][0], y: c[(i + 1) % 4][1] }));
  const part = addWall(sk, { x: ft(14), y: 0 }, { x: ft(14), y: ft(28) });
  return { sk, ws, part };
}

test("a drawn rectangle with a partition becomes four corner walls and a tee", () => {
  const { sk } = house();
  const r = planFromSketch(sk);
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.stats.exterior, 4);
  assert.equal(r.stats.interior, 1);
  assert.equal(r.stats.tees, 2);
  assert.deepEqual(r.plan.walls.slice(0, 4).map((w) => w.length).sort((a, b) => a - b), [336, 336, 480, 480]);
});

test("a door and a window land on the right wall at the drawn offset and width", () => {
  const { sk, ws } = house();
  assert.ok(addOpening(sk, ws[0].id, "door", ft(17) + 18, 36).ok);   // centred at 17 ft 18 in on the front wall
  assert.ok(addOpening(sk, ws[2].id, "window", ft(10), 72).ok);
  const r = planFromSketch(sk);
  const ops = r.plan.walls.flatMap((w) => (w.openings || []).map((o) => ({ wall: w.id, ...o })));
  assert.equal(ops.length, 2);
  const door = ops.find((o) => o.kind === "door"), win = ops.find((o) => o.kind === "window");
  assert.equal(door.width, 36); assert.equal(win.width, 72);
  // offsets are from the wall's start in its walking direction; either end of a 480 in wall
  assert.ok([ft(17), 480 - ft(17) - 36].includes(door.offset), String(door.offset));
  assert.ok([ft(10) - 36, 480 - ft(10) - 36].includes(win.offset), String(win.offset));
  // and the engine takes it
  assert.ok(takeoff({ ...r.plan, studSpacing: 16, studLength: 92.625, kerf: 0.125, topPlateLap: 24, cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5 }) );
});

test("openings slide inside the wall, and overlaps and oversize ones are refused", () => {
  const { sk, ws } = house();
  const a = addOpening(sk, ws[1].id, "door", 2, 36);        // would hang off the start
  assert.ok(a.ok); assert.equal(a.opening.offset, 0);
  assert.equal(addOpening(sk, ws[1].id, "window", 20, 36).ok, false); // overlaps the door
  assert.equal(addOpening(sk, ws[1].id, "window", 50, 400).ok, false); // longer than the 336 in wall
});

test("snapping prefers wall ends, then the grid, and ortho holds a line", () => {
  const { sk } = house();
  assert.deepEqual(snapPoint({ x: 477, y: 3 }, sk, { grid: 6 }), { x: 480, y: 0 });
  assert.deepEqual(snapPoint({ x: 100, y: 100 }, sk, { grid: 12 }), { x: 96, y: 96 });
  assert.deepEqual(snapPoint({ x: 100, y: 130 }, sk, { grid: 12, from: { x: 96, y: 96 }, ortho: true }), { x: 96, y: 132 });
  assert.deepEqual(pointAtLength({ x: 0, y: 0 }, { x: 50, y: 9 }, 120, true), { x: 120, y: 0 });
  assert.equal(pointAtLength({ x: 0, y: 0 }, { x: 0, y: 0 }, 120, true), null);
});

test("duplicate and tiny walls are refused; removing a wall removes its openings; nearestWall finds the front", () => {
  const { sk, ws } = house();
  assert.equal(addWall(sk, { x: 0, y: 0 }, { x: ft(40), y: 0 }), null);
  assert.equal(addWall(sk, { x: 5, y: 5 }, { x: 5.2, y: 5 }), null);
  addOpening(sk, ws[0].id, "door", 100, 36);
  assert.equal(nearestWall(sk, { x: 100, y: 4 }).wall.id, ws[0].id);
  assert.equal(nearestWall(sk, { x: 100, y: 60 }, 10)?.wall.id === ws[0].id, false);
  removeWall(sk, ws[0].id);
  assert.equal(sk.openings.length, 0);
  assert.ok(!sketchToDxf(sk).includes("DOORS"));
});

test("an empty sketch says to draw a wall; an open outline still reads", () => {
  assert.equal(planFromSketch(emptySketch()).ok, false);
  const sk = emptySketch(); addWall(sk, { x: 0, y: 0 }, { x: 120, y: 0 });
  const r = planFromSketch(sk);
  assert.ok(r.ok); assert.equal(r.plan.walls[0].length, 120);
});

test("dragging a corner moves both walls that meet there and keeps the loop closed", () => {
  const { sk, ws } = house();
  assert.ok(moveCorner(sk, ws[1].id, "b", { x: ft(44), y: ft(28) }).ok);   // far corner out 4 ft
  assert.deepEqual(sk.walls[2].a, { x: ft(44), y: ft(28) });
  const r = planFromSketch(sk);
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.stats.exterior, 4);
});

test("sliding a wall drags the walls that meet its ends", () => {
  const { sk, ws } = house();
  assert.ok(moveWall(sk, ws[2].id, 0, ft(2)).ok);                          // back wall 2 ft out
  assert.deepEqual(sk.walls[2].a, { x: ft(40), y: ft(30) });
  assert.equal(Math.round(Math.hypot(sk.walls[1].b.x - sk.walls[1].a.x, sk.walls[1].b.y - sk.walls[1].a.y)), ft(30));
});

test("a move that would crush a wall or strand an opening is refused and changes nothing", () => {
  const { sk, ws } = house();
  assert.ok(addOpening(sk, ws[1].id, "door", ft(14), 36).ok);              // on the 28 ft right wall
  const before = JSON.stringify(sk);
  const r = moveCorner(sk, ws[1].id, "b", { x: ft(40), y: ft(2) });        // right wall now 2 ft: door no longer fits
  assert.equal(r.ok, false);
  assert.equal(moveCorner(sk, ws[0].id, "b", { x: 0, y: 0 }).ok, false);   // front wall to nothing
  assert.equal(JSON.stringify(sk), before);
});

test("an opening slides along its wall and resizes from either edge, refusing overlaps and slivers", () => {
  const { sk, ws } = house();
  const a = addOpening(sk, ws[0].id, "door", ft(5), 36).opening;          // front wall, 40 ft
  const b = addOpening(sk, ws[0].id, "window", ft(20), 48).opening;
  assert.ok(moveOpening(sk, a.id, ft(10)).ok);
  assert.equal(a.offset, ft(10) - 18);
  assert.ok(moveOpening(sk, a.id, -50).ok);                                // clamped to the wall start
  assert.equal(a.offset, 0);
  const before = JSON.stringify(sk);
  assert.equal(moveOpening(sk, a.id, ft(20)).ok, false);                   // onto the window
  assert.equal(resizeOpening(sk, a.id, "b", ft(20)).ok, false);            // grows into the window
  assert.equal(resizeOpening(sk, a.id, "b", 3).ok, false);                 // sliver
  assert.equal(resizeOpening(sk, a.id, "a", -1).ok, false);                // past the wall start
  assert.equal(JSON.stringify(sk), before);
  assert.ok(resizeOpening(sk, a.id, "b", 60).ok);
  assert.equal(a.width, 60);
  assert.ok(resizeOpening(sk, b.id, "a", b.offset - 12).ok);
  assert.equal(b.width, 60);
  assert.ok(planFromSketch(sk).ok);
});
