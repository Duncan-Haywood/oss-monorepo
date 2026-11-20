import test from "node:test";
import assert from "node:assert/strict";
import { planRect, assignEnvelope, assignRailingSides, isLeaf } from "./envelope.mjs";
import { ruleCode } from "./uniformat.mjs";

// a wall as a box body from (x0,y0) to (x1,y1) in plan, 0..3 m high
const box = (x0, y0, x1, y1, z0 = 0, z1 = 3) => {
  const P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  return { terms: [{ faces: [[P[0], P[1], P[2], P[3]], [P[4], P[5], P[6], P[7]]] }] };
};
const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
let nid = 1;
const wall = (x0, y0, x1, y1, o = {}) => ({ id: nid++, ifcClass: "IfcWall", ifcType: "IFCWALL", effectiveClass: "IFCWALL", isExternal: null, storeyElevation: 0, storey: "L0", plan: planRect(box(x0, y0, x1, y1, o.z0, o.z1), I), ...o });

test("plan rectangle: centre, axis, half length and thickness", () => {
  const p = planRect(box(0, 0, 10, 0.3), I);
  assert.ok(Math.abs(p.c[0] - 5) < 1e-6 && Math.abs(p.c[1] - 0.15) < 1e-6);
  assert.ok(Math.abs(p.hl - 5) < 1e-6 && Math.abs(p.ht - 0.15) < 1e-6);
  assert.ok(Math.abs(Math.abs(p.u[0]) - 1) < 1e-6);
  // rotated 30 degrees and in millimetres
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const R = [c, -s, 0, 1000, s, c, 0, 2000, 0, 0, 1, 0];
  const q = planRect(box(0, 0, 4000, 200), R, 0.001);
  assert.ok(Math.abs(q.hl - 2) < 1e-3 && Math.abs(q.ht - 0.1) < 1e-3, JSON.stringify(q));
});

test("outer walls of a box house read exterior, a partition inside reads interior", () => {
  const rows = [wall(0, 0, 10, 0.3), wall(0, 7.7, 10, 8), wall(0, 0, 0.3, 8), wall(9.7, 0, 10, 8), wall(4, 0.3, 4.1, 7.7)];
  assignEnvelope(rows);
  assert.deepEqual(rows.map((r) => r.envelope.exterior), [true, true, true, true, false]);
  assert.equal(rows[4].envelope.open, 0);
  assert.equal(ruleCode(rows[0], () => null).code, "B2010");
  assert.equal(ruleCode(rows[4], () => null).code, "C1010");
  assert.match(ruleCode(rows[4], () => null).why, /by geometry/);
  // a flag set by the author still wins
  rows[4].isExternal = true;
  assert.equal(ruleCode(rows[4], () => null).code, "B2010");
});

test("the inner leaf of a two-leaf wall reads with its skin", () => {
  const skin = wall(0, -0.25, 10, -0.15);
  const rows = [skin, wall(0, 0, 10, 0.2), wall(0, 7.8, 10, 8), wall(-0.25, -0.25, 0, 8), wall(10, -0.25, 10.25, 8)];
  assert.ok(isLeaf(rows[1].plan, skin.plan));
  assignEnvelope(rows);
  assert.equal(rows[1].envelope.exterior, true);
});

test("a wall at another height does not block", () => {
  const rows = [wall(0, 0, 10, 0.3), wall(0, -2, 10, -1.7, { z0: 3, z1: 6 })];
  assignEnvelope(rows);
  assert.equal(rows[0].envelope.exterior, true);
});

test("doors in an unflagged wall follow the wall's envelope", () => {
  const rows = [wall(0, 0, 10, 0.3), wall(0, 7.7, 10, 8), wall(0, 0, 0.3, 8), wall(9.7, 0, 10, 8), wall(4, 0.3, 4.1, 7.7)];
  assignEnvelope(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const door = (host) => ({ id: 999, ifcClass: "IfcDoor", ifcType: "IFCDOOR", effectiveClass: "IFCDOOR", isExternal: null, host, storeyElevation: 0 });
  assert.equal(ruleCode(door(rows[0].id), (id) => byId.get(id)).code, "B2030");
  assert.equal(ruleCode(door(rows[4].id), (id) => byId.get(id)).code, "C1020");
});

test("a lining on the inside of an exterior wall reads exterior, marked as a leaf", () => {
  const rows = [wall(0, 0, 10, 0.3), wall(0, 0.3, 10, 0.35), wall(0, 7.7, 10, 8), wall(0, 0, 0.3, 8), wall(9.7, 0, 10, 8)];
  assignEnvelope(rows);
  assert.equal(rows[1].envelope.exterior, true);
  assert.equal(rows[1].envelope.leaf, true);
  assert.equal(rows[0].envelope.leaf, false);
  assert.match(ruleCode(rows[1], () => null).why, /inner leaf or lining/);
});

test("a wall flag the model gives every wall alike is set aside when the geometry disagrees", () => {
  // twelve partitions inside a box, every wall flagged IsExternal
  const rows = [wall(0, 0, 30, 0.3), wall(0, 7.7, 30, 8), wall(0, 0, 0.3, 8), wall(29.7, 0, 30, 8)];
  for (let i = 1; i <= 12; i++) rows.push(wall(2.3 * i, 0.3, 2.3 * i + 0.1, 7.7));
  for (const r of rows) r.isExternal = true;
  assignEnvelope(rows);
  assert.ok(rows.every((r) => r.envelope.flagSaysNothing));
  assert.equal(ruleCode(rows[0], () => null).code, "B2010");
  assert.equal(ruleCode(rows[5], () => null).code, "C1010");
  assert.match(ruleCode(rows[5], () => null).why, /on every wall of the model, not read/);
  // a mixed set of flags is kept, even where the geometry disagrees
  rows[5].isExternal = false;
  assignEnvelope(rows);
  assert.ok(rows.every((r) => !r.envelope.flagSaysNothing));
  assert.equal(ruleCode(rows[6], () => null).code, "B2010");
});

test("a kept flag the geometry disagrees with is named on the row", () => {
  const rows = [wall(0, 0, 10, 0.3), wall(0, 7.7, 10, 8), wall(0, 0, 0.3, 8), wall(9.7, 0, 10, 8), wall(4, 0.3, 4.1, 7.7)];
  rows.forEach((r, i) => (r.isExternal = i !== 2)); // mixed flags: kept
  assignEnvelope(rows);
  assert.equal(ruleCode(rows[4], () => null).code, "B2010");
  assert.match(ruleCode(rows[4], () => null).why, /geometry reads it inside the building, check it/);
  assert.match(ruleCode(rows[2], () => null).why, /geometry reads it on the outside/);
  assert.equal(ruleCode(rows[0], () => null).why, "wall, IsExternal");
});

test("railings: a balcony guard outside the walls is open, a gallery guard inside is closed", () => {
  const rail = (x0, y0, x1, y1, z0 = 3, z1 = 4) => ({ ...wall(x0, y0, x1, y1, { z0, z1 }), ifcClass: "IfcRailing", ifcType: "IFCRAILING", effectiveClass: "IFCRAILING" });
  const house = () => [wall(0, 0, 10, 0.3, { z1: 6 }), wall(0, 7.7, 10, 8, { z1: 6 }), wall(0, 0, 0.3, 8, { z1: 6 }), wall(9.7, 0, 10, 8, { z1: 6 })];
  const door = { id: nid++, ifcClass: "IfcDoor", ifcType: "IFCDOOR", effectiveClass: "IFCDOOR", host: 1 };
  const balcony = rail(2, 9.5, 6, 9.55), gallery = rail(3, 4, 7, 4.05);
  assignRailingSides([...house(), door, balcony, gallery]);
  assert.equal(balcony.railSide.exterior, true);
  assert.equal(gallery.railSide.exterior, false);
  // a railing above every wall is not read; nor is any railing in a model with no door or window
  const high = rail(3, 4, 7, 4.05, 7, 8), alone = rail(2, 9.5, 6, 9.55);
  assignRailingSides([...house(), door, high]);
  assert.equal(high.railSide, undefined);
  assignRailingSides([...house(), alone]);
  assert.equal(alone.railSide, undefined);
});
