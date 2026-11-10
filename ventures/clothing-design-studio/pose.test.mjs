import test from "node:test";
import assert from "node:assert/strict";
import { shouldersFromPose, POSE_IDX, SQUARE_RATIO, TURNED_RATIO, POSE_SOURCES, POSE_VERSION } from "./pose.mjs";
import { cameraOverlay } from "./camera.mjs";

// A 33-point pose with only the points we read filled; the rest unseen.
function pose({ ls, rs, lh, rh, v = 0.99 }) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const put = (i, p) => { if (p) lm[i] = { x: p[0], y: p[1], visibility: v }; };
  put(POSE_IDX.leftShoulder, ls); put(POSE_IDX.rightShoulder, rs); put(POSE_IDX.leftHip, lh); put(POSE_IDX.rightHip, rh);
  return lm;
}
const frame = { w: 600, h: 800 };

test("front-facing person: own-left shoulder on the picture's right, points ordered picture-left first, in pixels", () => {
  // shoulders 120 px apart, hips 138 px below: ratio 0.870 = the body model's square-on ratio
  const r = shouldersFromPose([pose({ ls: [0.4, 0.3], rs: [0.2, 0.3], lh: [0.37, 0.4725], rh: [0.23, 0.4725] })], frame);
  assert.equal(r.ok, true);
  assert.deepEqual(r.left, { x: 120, y: 240 });
  assert.deepEqual(r.right, { x: 240, y: 240 });
  assert.equal(r.facing, "front");
  assert.equal(r.span, 120);
  assert.ok(Math.abs(r.ratio - 120 / 138) < 1e-3);
  assert.ok(Math.abs(SQUARE_RATIO - 0.25 / 0.288) < 1e-12);
  assert.ok(!r.notes.some(n => /turned/.test(n)));
  // the found points feed the overlay exactly as taps would
  const o = cameraOverlay(r.left, r.right, { chest: 100, height: 178 }, {}, frame);
  assert.equal(o.ok, true);
});

test("a turned body (span short against the torso) is flagged; a back view is named", () => {
  const turned = shouldersFromPose([pose({ ls: [0.33, 0.3], rs: [0.27, 0.3], lh: [0.33, 0.4725], rh: [0.27, 0.4725] })], frame);
  assert.equal(turned.ok, true);
  assert.ok(turned.ratio < TURNED_RATIO);
  assert.ok(turned.notes.some(n => /turned away/.test(n)));
  const back = shouldersFromPose([pose({ ls: [0.2, 0.3], rs: [0.4, 0.3] })], frame);
  assert.equal(back.facing, "back");
  assert.deepEqual(back.left, { x: 120, y: 240 });
  assert.ok(back.notes.some(n => /back view/.test(n)));
  assert.ok(back.notes.some(n => /hips are not in view/.test(n)));
});

test("two people: the widest shoulders (nearest the camera) win and the count is noted", () => {
  const far = pose({ ls: [0.8, 0.3], rs: [0.75, 0.3] }), near = pose({ ls: [0.5, 0.35], rs: [0.2, 0.35] });
  const r = shouldersFromPose([far, near], frame);
  assert.equal(r.people, 2);
  assert.deepEqual(r.left, { x: 120, y: 280 });
  assert.ok(r.notes.some(n => /2 people/.test(n)));
});

test("widen pushes the points apart about their midpoint", () => {
  const r = shouldersFromPose([pose({ ls: [0.4, 0.3], rs: [0.2, 0.3] })], frame, { widen: 1.1 });
  assert.deepEqual(r.left, { x: 114, y: 240 });
  assert.deepEqual(r.right, { x: 246, y: 240 });
  assert.equal(shouldersFromPose([pose({ ls: [0.4, 0.3], rs: [0.2, 0.3] })], frame, { widen: 3 }).ok, false);
});

test("refusals: no person, hidden shoulder, tiny person, no frame; a bare landmark array is accepted", () => {
  assert.match(shouldersFromPose([], frame).error, /No person/);
  assert.match(shouldersFromPose([pose({ ls: [0.4, 0.3], rs: [0.2, 0.3], v: 0.2 })], frame).error, /not clearly in view/);
  assert.match(shouldersFromPose([pose({ ls: [0.301, 0.3], rs: [0.3, 0.3] })], frame).error, /too small/);
  assert.equal(shouldersFromPose([pose({ ls: [0.4, 0.3], rs: [0.2, 0.3] })], null).ok, false);
  assert.equal(shouldersFromPose(pose({ ls: [0.4, 0.3], rs: [0.2, 0.3] }), frame).ok, true);
});

test("model sources are pinned to one version over https", () => {
  for (const u of Object.values(POSE_SOURCES)) assert.match(u, /^https:\/\//);
  assert.ok(POSE_SOURCES.bundle.includes(`@${POSE_VERSION}/`));
});
