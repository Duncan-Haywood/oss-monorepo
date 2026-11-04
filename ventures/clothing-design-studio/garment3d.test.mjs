import test from "node:test";
import assert from "node:assert/strict";
import { maskGrid, edgeDistance, height, smooth, buildGarmentMesh, orbitMatrix, project, multiply, rotationY, identity } from "./garment3d.mjs";
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
