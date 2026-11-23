import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryLength, railRuns, railingLength, addRailingLines, prismLength } from "./railings.mjs";
import { quantitiesFromRows } from "./geometry-quantities.mjs";

// an axis-aligned box as a closed shell, faces outward
function box([x0, y0, z0], [x1, y1, z1]) {
  const p = (x, y, z) => [x, y, z];
  return { s: 1, loops: [
    [p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), p(x1, y0, z0)], // bottom, down
    [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], // top, up
    [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], // -y
    [p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0)], // +y
    [p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0)], // -x
    [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], // +x
  ] };
}
const row = (shells, lengthUnit = 1) => ({ id: 1, ifcType: "IFCRAILING", lengthUnit, computed: { status: "ok", solids: { body: { terms: [], shells } } } });
const posts = (xs, y = 0, h = 0.89) => xs.map((x) => box([x - 0.02, y - 0.02, 0], [x + 0.02, y + 0.02, h]));
const close = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) <= t, `${a} vs ${b}`);

// The kleine_Wohnung_R22 top rail (Revit 2022, stored Length 11.03 m): a
// U of mitred 0.05 x 0.01 m bars, its 14 faces as the export writes them.
const P = (x, y, z) => [x, y, z];
const kleine = { s: 1, loops: [
  [P(2.565, 5.999, 0.9), P(2.565, 5.949, 0.9), P(2.565, 5.949, 0.89), P(2.565, 5.999, 0.89)],
  [P(2.565, 0.001, 0.9), P(2.565, 0.001, 0.89), P(2.565, 0.051, 0.89), P(2.565, 0.051, 0.9)],
  [P(2.565, 0.001, 0.89), P(2.565, 0.001, 0.9), P(0.001, 0.001, 0.9), P(0.001, 0.001, 0.89)],
  [P(2.565, 0.051, 0.89), P(2.565, 0.001, 0.89), P(0.001, 0.001, 0.89), P(0.051, 0.051, 0.89)],
  [P(2.565, 0.051, 0.9), P(2.565, 0.051, 0.89), P(0.051, 0.051, 0.89), P(0.051, 0.051, 0.9)],
  [P(2.565, 0.001, 0.9), P(2.565, 0.051, 0.9), P(0.051, 0.051, 0.9), P(0.001, 0.001, 0.9)],
  [P(0.001, 0.001, 0.89), P(0.001, 0.001, 0.9), P(0.001, 5.999, 0.9), P(0.001, 5.999, 0.89)],
  [P(0.051, 0.051, 0.89), P(0.001, 0.001, 0.89), P(0.001, 5.999, 0.89), P(0.051, 5.949, 0.89)],
  [P(0.051, 0.051, 0.9), P(0.051, 0.051, 0.89), P(0.051, 5.949, 0.89), P(0.051, 5.949, 0.9)],
  [P(0.001, 0.001, 0.9), P(0.051, 0.051, 0.9), P(0.051, 5.949, 0.9), P(0.001, 5.999, 0.9)],
  [P(0.001, 5.999, 0.89), P(0.001, 5.999, 0.9), P(2.565, 5.999, 0.9), P(2.565, 5.999, 0.89)],
  [P(0.051, 5.949, 0.89), P(0.001, 5.999, 0.89), P(2.565, 5.999, 0.89), P(2.565, 5.949, 0.89)],
  [P(0.051, 5.949, 0.9), P(0.051, 5.949, 0.89), P(2.565, 5.949, 0.89), P(2.565, 5.949, 0.9)],
  [P(0.001, 5.999, 0.9), P(0.051, 5.949, 0.9), P(2.565, 5.949, 0.9), P(2.565, 5.999, 0.9)],
] };

test("a mitred U-shaped top rail reads its middle line's length, the posts under it left out", () => {
  const m = railingLength(row([...posts([0.5, 1.3, 2.1], 0.026), ...posts([0.5, 1.3, 2.1], 5.974), kleine]));
  // middle line: 2.539 + 5.948 + 2.539 = 11.026 m
  close(m.length, 11.026, 0.002);
  assert.equal(m.runs.length, 1);
  close(m.runs[0].width, 0.05, 1e-3);
  close(m.runs[0].strip, m.runs[0].sweep, 1e-3);
});

test("a body in millimetres reads in metres", () => {
  const mm = { s: 1, loops: kleine.loops.map((l) => l.map((q) => q.map((x) => x * 1000))) };
  close(railingLength(row([mm], 0.001)).length, 11.026, 0.002);
});

test("two separate runs add up; a lower rail under a counted one does not", () => {
  const a = box([0, -0.025, 0.89], [4, 0.025, 0.9]);
  const b = box([5, -0.025, 0.89], [8, 0.025, 0.9]);
  const mid = box([0, -0.01, 0.45], [4, 0.01, 0.46]); // under a, hidden from above
  const hand = box([0, 0.06, 0.8], [4, 0.09, 0.83]); // beside a, seen from above, 6 cm off
  const m = railingLength(row([a, b, mid, hand, ...posts([0.2, 3.8, 5.2, 7.8])]));
  close(m.length, 7, 1e-9);
  assert.equal(m.runs.length, 2);
  assert.equal(m.under, 1);
});

test("posts with no rail on top, and a strip whose two readings disagree, give no Length", () => {
  assert.equal(railingLength(row(posts([0, 1, 2]))).reason, "no rail on top");
  assert.equal(railingLength({ computed: { status: "ok" } }).reason, "no body");
  // a rail whose section deepens along it (1 cm at one end, 10 cm at the
  // other), cut off-centre because its top face has extra corners at one end:
  // the strip reads 4 m, the sweep about 5.8 m
  const z = (x) => 0.89 - 0.09 * (x / 4), y0 = -0.025, y1 = 0.025;
  const wedge = { s: 1, loops: [
    [[0, y0, 0.9], [0.1, y0, 0.9], [0.2, y0, 0.9], [0.3, y0, 0.9], [4, y0, 0.9], [4, y1, 0.9], [0, y1, 0.9]], // top, up
    [[0, y0, z(0)], [0, y1, z(0)], [4, y1, z(4)], [4, y0, z(4)]], // bottom
    [[0, y0, z(0)], [4, y0, z(4)], [4, y0, 0.9], [0.3, y0, 0.9], [0.2, y0, 0.9], [0.1, y0, 0.9], [0, y0, 0.9]], // -y
    [[0, y1, z(0)], [0, y1, 0.9], [4, y1, 0.9], [4, y1, z(4)]], // +y
    [[0, y0, z(0)], [0, y0, 0.9], [0, y1, 0.9], [0, y1, z(0)]], // -x
    [[4, y0, z(4)], [4, y1, z(4)], [4, y1, 0.9], [4, y0, 0.9]], // +x
  ] };
  const m = railingLength(row([wedge]));
  close(m.runs[0].strip, 4, 1e-3);
  assert.ok(m.runs[0].sweep > 5, `${m.runs[0].sweep}`);
  assert.equal(m.length, null);
  assert.equal(m.reason, "readings disagree");
});

// A straight prism of a 2D section (outer loop, optional hole, both
// anticlockwise) from point a to point b, drawn as Tekla's IFC4 export writes
// a tessellated member: side quads, and each end as its outer loop and its
// hole loop wound the same way (the hole is not reversed).
function prism(outer, hole, a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d), t = d.map((x) => x / L);
  const u0 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let u = [u0[1] * t[2] - u0[2] * t[1], u0[2] * t[0] - u0[0] * t[2], u0[0] * t[1] - u0[1] * t[0]];
  const nu = Math.hypot(...u);
  u = u.map((x) => x / nu);
  const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  const at = (q, o) => [0, 1, 2].map((k) => o[k] + q[0] * u[k] + q[1] * v[k]);
  const loops = [];
  const sides = (ring, out) => ring.forEach((q, i) => {
    const r = ring[(i + 1) % ring.length], quad = [at(q, a), at(r, a), at(r, b), at(q, b)];
    loops.push(out ? quad : quad.reverse());
  });
  sides(outer, true);
  if (hole) sides(hole, false);
  loops.push([...outer].reverse().map((q) => at(q, a)), outer.map((q) => at(q, b)));
  if (hole) loops.push([...hole].reverse().map((q) => at(q, a)), hole.map((q) => at(q, b)));
  return { s: 1, loops };
}
const ring = (r, n = 16) => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
// IPE80 without fillets, in metres: 46 x 80, web 3.8, flanges 5.2
const ipe80 = [[-0.023, -0.04], [0.023, -0.04], [0.023, -0.0348], [0.0019, -0.0348], [0.0019, 0.0348], [0.023, 0.0348], [0.023, 0.04], [-0.023, 0.04], [-0.023, 0.0348], [-0.0019, 0.0348], [-0.0019, -0.0348], [-0.023, -0.0348]];

test("a one-member railing reads as a member: an upright tube post and a long I-section rail", () => {
  // Tekla's 1.1 m posts (test-2026-4.ifc): a 57 mm tube, upright, so no rail on top
  const post = railingLength(row([prism(ring(0.0285), ring(0.0235), [0, 0, 3.4], [0, 0, 4.5])]));
  close(post.length, 1.1, 1e-9);
  assert.equal(post.from, "member");
  // a 12.2 m IPE80 lying flat: its top is a 46 mm strip, but the sweep's cut
  // takes the I's hull for its section, so the rail reading disagrees
  const rail = railingLength(row([prism(ipe80, null, [18.15, -4.25, 4.5], [30.35, -4.25, 4.5])]));
  close(rail.length, 12.2, 1e-9);
  assert.equal(rail.from, "member");
  assert.equal(rail.heldBy, "readings disagree");
  // in millimetres too, and sloped like a stair's handrail
  const mm = prism(ring(28.5), ring(23.5), [0, 0, 0], [3000, 0, 1500]);
  close(railingLength(row([mm], 0.001)).length, Math.hypot(3, 1.5), 1e-9);
  const p = prismLength(prism(ipe80, null, [0, 0, 0], [2, 0, 0]));
  close(p.section, 2 * 0.046 * 0.0052 + 0.0038 * 0.0696, 1e-9);
});

test("a rail the top-rail reading reads keeps that reading", () => {
  const m = railingLength(row([box([0, -0.025, 0.89], [4, 0.025, 0.9])]));
  close(m.length, 4, 1e-9);
  assert.equal(m.from, "rail");
});

test("posts in a row, a glass panel and a tapered bar are not one member", () => {
  // three upright posts: each a prism, but the body is wider than 1/10 its height
  assert.equal(railingLength(row(posts([0, 0.3, 0.6]))).length, null);
  assert.equal(prismLength({ terms: [], shells: posts([0, 0.3, 0.6]) }), null);
  // two posts 5 cm apart still too wide for 0.89 m
  assert.equal(prismLength({ terms: [], shells: posts([0, 0.05]) }), null);
  // a 1 x 1.1 m glass panel, 10 mm thick
  assert.equal(railingLength(row([box([0, 0, 0], [1, 0.01, 1.1])])).length, null);
  // a bar whose end is cut on the skew is not a prism
  const skew = prism(ring(0.02, 8), null, [0, 0, 0], [1, 0, 0]);
  skew.loops[skew.loops.length - 1] = skew.loops.at(-1).map(([x, y, z]) => [x + 0.5 * z, y, z]);
  for (const l of skew.loops) for (const q of l) if (Math.abs(q[0] - 1) < 1e-9) q[0] += 0.5 * q[2];
  assert.equal(prismLength({ terms: [], shells: [skew] }), null);
});

test("an outline whose shared edge is split differently on its two faces still cancels inside", () => {
  // two unit squares side by side; the left one's right edge split at y = 0.3
  const L = { s: 1, l: [[0, 0, 0], [1, 0, 0], [1, 0.3, 0], [1, 1, 0], [0, 1, 0]] };
  const R = { s: 1, l: [[1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0]] };
  close(boundaryLength([L, R], 1e-9), 6, 1e-9);
  close(boundaryLength([L], 1e-9), 4, 1e-9);
});

test("railing rows carry their Length into Qto_RailingBaseQuantities", () => {
  const rows = [row([kleine])];
  assert.equal(addRailingLines(rows), 1);
  const q = quantitiesFromRows(rows).get(1);
  close(q.get("Length").value, 11.026, 0.002);
  assert.equal(q.get("Length").kind, "length");
  assert.equal(railRuns({ terms: [], shells: [] }).length, 0);
});
