import test from "node:test";
import assert from "node:assert/strict";
import { cameraOverlay, overlayPath } from "./camera.mjs";
import { tryOn } from "./tryon.mjs";

const body = { chest: 100, waist: 88, hip: 100, height: 180 };

test("level shoulders: scale is span over the body shoulder width, hem is length below the shoulder line", () => {
  const t = tryOn(body);
  const r = cameraOverlay({ x: 200, y: 300 }, { x: 400, y: 300 }, body);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.pxPerCm - 200 / t.bodyWidths.shoulder) < 0.06);
  const hem = r.points[3], shoulder = r.points[1];
  const expectDown = (180 * 0.818 - t.length.hemFromFloor) * r.pxPerCm;
  assert.ok(Math.abs(hem.y - 300 - expectDown) < expectDown * 0.01);
  assert.equal(shoulder.y, 300);
  assert.ok(Math.abs(shoulder.x - 200) < 0.2);
  // the hem is wider than the shoulders on a regular tee in M
  assert.ok(r.points[4].x - r.points[3].x > 0);
  assert.equal(r.points.length, 8);
});

test("a tilted pair of taps rotates the outline about the shoulder midpoint", () => {
  const a = cameraOverlay({ x: 200, y: 300 }, { x: 400, y: 300 }, body);
  const b = cameraOverlay({ x: 200, y: 300 }, { x: 400, y: 340 }, body);
  assert.ok(b.tiltDeg > 10);
  assert.ok(b.points[3].x < a.points[3].x); // tilting the shoulder line down to the right swings the hem to the left on screen
  assert.ok(b.notes.some(n => /tilted/.test(n)));
  assert.match(overlayPath(b.points), /^M .* Z$/);
});

test("bad taps and off-frame outlines are reported", () => {
  assert.equal(cameraOverlay(null, { x: 1, y: 1 }, body).ok, false);
  assert.equal(cameraOverlay({ x: 10, y: 10 }, { x: 12, y: 10 }, body).ok, false);
  assert.equal(cameraOverlay({ x: 400, y: 10 }, { x: 200, y: 10 }, body).ok, false);
  assert.equal(cameraOverlay({ x: 200, y: 100 }, { x: 400, y: 100 }, { chest: 10 }).ok, false);
  const r = cameraOverlay({ x: 200, y: 300 }, { x: 400, y: 300 }, body, {}, { w: 600, h: 400 });
  assert.ok(r.notes.some(n => /off the picture/.test(n)));
});
