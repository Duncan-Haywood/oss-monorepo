import test from "node:test";
import assert from "node:assert/strict";
import { sleeveTubes, maskGrid, edgeDistance, height, smooth, buildGarmentMesh, orbitMatrix, project, multiply, rotationY, identity } from "./garment3d.mjs";
import { VIEWBOX } from "./catalogue.mjs";

const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const cx = VIEWBOX.x + VIEWBOX.width / 2, cy = VIEWBOX.y + VIEWBOX.height / 2;

test("edge distance is 0 outside, grows inward, peaks at the middle of a disc", () => {
  const g = maskGrid(disc(cx, cy, 120), { cell: 6 });
  const d = edgeDistance(g);
  const mid = Math.round((cy - VIEWBOX.y) / 6) * g.vcols + Math.round((cx - VIEWBOX.x) / 6);
  assert.equal(d[0], 0);
  assert.ok(d[mid] > 15 && d[mid] < 21, `centre distance ${d[mid]} cells for a 20-cell radius`);
});

test("height is zero at the edge, rounded, and capped at the radius", () => {
  assert.equal(height(0, 6, 46), 0);
  assert.ok(height(1, 6, 46) > 0 && height(1, 6, 46) < height(4, 6, 46));
  assert.ok(Math.abs(height(100, 6, 46) - 46) < 1e-9);
  assert.ok(Math.abs(height(100, 6, 105, 58) - 58) < 1e-9, "an ellipse tops out at its thickness");
});

test("mesh: front and back meet at the edge, bulge opposite ways, indices valid", () => {
  const m = buildGarmentMesh(disc(cx, cy, 150), { cell: 6, radius: 46, thickness: 46 });
  const n = m.vertexCount / 2;
  let maxF = 0, minB = 0;
  for (let k = 0; k < n; k++) { maxF = Math.max(maxF, m.positions[k * 3 + 2]); minB = Math.min(minB, m.positions[(n + k) * 3 + 2]); }
  assert.ok(Math.abs(maxF - 46) < 1e-3 && Math.abs(minB + 46) < 1e-3);
  assert.ok(m.frontCount > 0 && m.frontCount === m.indices.length / 2);
  for (const i of m.indices) assert.ok(i < m.vertexCount);
  assert.equal(m.triangleCount, m.indices.length / 3);
  for (let k = 0; k < m.normals.length; k += 3) assert.ok(Math.abs(Math.hypot(m.normals[k], m.normals[k + 1], m.normals[k + 2]) - 1) < 1e-4);
});

test("the back mirrors u and keeps v; front normals face the viewer", () => {
  const m = buildGarmentMesh(disc(cx, cy, 150), { cell: 6 });
  const g91 = m.grid.vcols;
  const n = m.vertexCount / 2;
  const k = 40 * g91 + 40;
  assert.ok(Math.abs(m.uvs[k * 2] + m.uvs[(n + k) * 2] - 1) < 1e-6);
  assert.equal(m.uvs[k * 2 + 1], m.uvs[(n + k) * 2 + 1]);
  let ok = 0;
  for (let q = 0; q < n; q++) if (m.positions[q * 3 + 2] > 5) { assert.ok(m.normals[q * 3 + 2] > 0); ok++; }
  assert.ok(ok > 100);
});

test("an empty mask gives an empty mesh, not a crash", () => {
  const m = buildGarmentMesh(() => false);
  assert.equal(m.indices.length, 0);
});

test("orbit: yaw 0 puts the centre on screen and the front nearer; a half turn swaps them", () => {
  const m0 = orbitMatrix({ yaw: 0, distance: 900 });
  const front = project(m0, [0, 0, 46]), back = project(m0, [0, 0, -46]);
  assert.ok(Math.abs(front[0]) < 1e-9 && front[2] < back[2]);
  const mPi = orbitMatrix({ yaw: Math.PI, distance: 900 });
  assert.ok(project(mPi, [0, 0, -46])[2] < project(mPi, [0, 0, 46])[2]);
});

test("matrix helpers: identity is neutral, rotations compose", () => {
  const r = rotationY(0.7);
  assert.deepEqual(Array.from(multiply(identity(), r)), Array.from(r));
  const q = multiply(rotationY(0.3), rotationY(0.4));
  for (let i = 0; i < 16; i++) assert.ok(Math.abs(q[i] - rotationY(0.7)[i]) < 1e-6);
});

test("smoothing keeps outside vertices at zero and never exceeds the maximum", () => {
  const g = maskGrid(disc(cx, cy, 100), { cell: 6 });
  const raw = new Float32Array(g.v.length).map((_, k) => (g.v[k] ? (k % 2 ? 50 : 10) : 0));
  const s = smooth(raw, g.vcols, g.vrows, g.v);
  for (let k = 0; k < s.length; k++) { if (!g.v[k]) assert.equal(s[k], 0); assert.ok(s[k] <= 50 + 1e-6); }
});

import { dropArm, ARM } from "./garment3d.mjs";
import { GARMENTS } from "./catalogue.mjs";

test("armDrop 0 leaves positions as before; the body columns never move", () => {
  assert.deepEqual(dropArm(250, 300, 0.4).slice(0, 2), [250, 300]);
  assert.deepEqual(dropArm(250 + ARM.bodyHalf, 200, 0.4).slice(0, 2), [250 + ARM.bodyHalf, 200]);
  const a = buildGarmentMesh(disc(cx, cy, 150), { cell: 6 }), b = buildGarmentMesh(disc(cx, cy, 150), { cell: 6, armDrop: 0 });
  assert.deepEqual(Array.from(a.positions), Array.from(b.positions));
});

test("arms swing down and in, mirrored left and right, by the full angle at the sleeve end", () => {
  const r = dropArm(470, 260, 0.4), l = dropArm(30, 260, 0.4);
  assert.ok(r[1] > 260 && r[0] < 470, "right sleeve end drops and moves toward the body");
  assert.ok(Math.abs((r[0] - 250) + (l[0] - 250)) < 1e-9 && Math.abs(r[1] - l[1]) < 1e-9, "mirror images");
  // hand check: rotating (82, 198) about the shoulder by 0.4 rad (full weight at 220 from centre)
  const c = Math.cos(0.4), s = Math.sin(0.4);
  assert.ok(Math.abs(r[0] - (250 + 138 + 82 * c - 198 * s)) < 1e-9 && Math.abs(r[1] - (62 + 82 * s + 198 * c)) < 1e-9);
  assert.equal(r[2], 0.4);
});

test("a long-sleeve mesh with dropped arms stays valid, uvs unchanged, and keeps the torso", async () => {
  const outline = GARMENTS.longsleeve.outline.front;
  const inside = (x, y) => { // the outline as a polygon, via its straight segments only
    const pts = [...outline.matchAll(/(-?\d+) (-?\d+)/g)].map(m => [+m[1], +m[2]]);
    let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    } return c;
  };
  const flat = buildGarmentMesh(inside), hung = buildGarmentMesh(inside, { armDrop: 0.35 });
  assert.equal(hung.indices.length, flat.indices.length);
  assert.deepEqual(Array.from(hung.uvs), Array.from(flat.uvs));
  let moved = 0, torsoMoved = 0;
  for (let k = 0; k < flat.positions.length; k += 3) {
    assert.ok(Number.isFinite(hung.positions[k]) && Number.isFinite(hung.positions[k + 1]));
    const d = Math.hypot(hung.positions[k] - flat.positions[k], hung.positions[k + 1] - flat.positions[k + 1]);
    if (d > 1e-6) moved++;
    if (Math.abs(flat.positions[k]) < ARM.bodyHalf - 1 && d > 1e-6) torsoMoved++;
  }
  assert.ok(moved > 100 && torsoMoved === 0, `${moved} moved, ${torsoMoved} torso`);
  for (let k = 0; k < hung.normals.length; k += 3) assert.ok(Math.abs(Math.hypot(hung.normals[k], hung.normals[k + 1], hung.normals[k + 2]) - 1) < 1e-4);
});

test("sleeve tubes: a flat band beyond the body gets a round section as deep as it is wide", () => {
  const band = (x, y) => Math.abs(y - cy) <= 30 && Math.abs(x - ARM.centre) <= 240;
  const g = maskGrid(band, { cell: 3 });
  const d = edgeDistance(g);
  const zs = new Float32Array(g.v.length);
  const deepest = sleeveTubes(zs, d, g);
  assert.ok(deepest > 26 && deepest < 34, `sleeve depth ${deepest} for a 30-unit half-width`);
  const mid = Math.round((cy - VIEWBOX.y) / 3) * g.vcols + Math.round((ARM.centre - VIEWBOX.x) / 3);
  assert.equal(zs[mid], 0);
});

test("buildGarmentMesh works with tubes off and on", () => {
  for (const tubes of [false, true]) {
    const m = buildGarmentMesh(disc(cx, cy, 200), { cell: 8, tubes, armDrop: 0.3 });
    for (const i of m.indices) assert.ok(i < m.vertexCount);
    for (const x of m.positions) assert.ok(Number.isFinite(x));
  }
});
