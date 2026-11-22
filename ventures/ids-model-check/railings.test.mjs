import { test } from "node:test";
import assert from "node:assert/strict";
import { boundaryLength, railRuns, railingLength, addRailingLines } from "./railings.mjs";
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
