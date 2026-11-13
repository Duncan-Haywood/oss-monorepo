import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, cleanGeneral, rect, cutCorner } from "./geom.mjs";

// clean() takes a fast path for polygons with distinct, non-collinear corners.
// It must give exactly what the general path gives, including on the
// degenerate shapes (repeated corners, straight-through vertices, spikes,
// zero-width rooms, both orientations) where it has to hand over.
test("clean's fast path gives exactly what the general path gives", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const coord = () => Math.round(rnd() * 6) / 2; // a small grid, so repeats and collinear runs are common
  let fast = 0;
  for (let k = 0; k < 20000; k++) {
    const n = 3 + Math.floor(rnd() * 6);
    const poly = Array.from({ length: n }, () => [coord(), coord()]);
    if (rnd() < 0.3) poly.reverse();
    if (rnd() < 0.2) poly[n - 1] = [poly[0][0] + (rnd() < 0.5 ? 1e-7 : 0), poly[0][1]];
    assert.deepEqual(clean(poly), cleanGeneral(poly), JSON.stringify(poly));
  }
  for (const poly of [rect(0, 0, 10, 12), rect(10, 12, 0, 0), rect(3, 3, 3, 9), [[0, 0], [0, 4], [4, 4], [4, 0]],
    cutCorner({ x0: 0, y0: 0, x1: 12, y1: 11 }, { x0: 6, y0: 9, x1: 12, y1: 11 })]) {
    assert.deepEqual(clean(poly), cleanGeneral(poly), JSON.stringify(poly));
    if (poly.length >= 4 && clean(poly).length === poly.length) fast++;
  }
  assert.ok(fast >= 3, "the rectangles take the fast path");
});

test("clean returns fresh points, never the caller's arrays", () => {
  const poly = rect(0, 0, 4, 5);
  const out = clean(poly);
  for (let i = 0; i < out.length; i++) assert.ok(!poly.includes(out[i]));
});
