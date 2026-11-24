import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeFaces, eyesOpenCandidates, toDetectorJson, describeFaces, eyesOpenFromBlink, EYES_CLOSED_AT, BLINK_SLOPE } from "./eyes.mjs";

// A face as FaceLandmarker returns it: landmarks spanning a box, and blend shapes.
function face(x0, y0, x1, y1, left, right) {
  return {
    pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }],
    shapes: { categories: [{ categoryName: "eyeBlinkLeft", score: left }, { categoryName: "eyeBlinkRight", score: right }, { categoryName: "eyeSquintLeft", score: 0.7 }] },
  };
}
const result = (...fs) => ({ faceLandmarks: fs.map((f) => f.pts), faceBlendshapes: fs.map((f) => f.shapes) });

test("the measured group frame: the one closed pair is flagged, the smiling squints are not", () => {
  // Scores measured on demo_group_closed.png (eval/cull-closed-eyes-2026-11-24.md).
  const s = summarizeFaces(result(face(0.703, 0.16, 0.88, 0.35, 0.253, 0.187), face(0.221, 0.31, 0.38, 0.47, 0.153, 0.156), face(0.423, 0.199, 0.58, 0.37, 0.629, 0.613)));
  assert.equal(s.count, 3);
  assert.equal(s.prominent, 3);
  assert.equal(s.closedCount, 1);
  assert.equal(s.eyesClosed, true);
  assert.deepEqual(s.faces.map((f) => f.closed), [false, false, true]);
  assert.equal(describeFaces(s), "3 faces, 1 with eyes closed");
});

test("the more-closed eye decides, as in the CLI detector", () => {
  // Page readings from eval/blink-rule-agreement-2026-11-24.md: shut eyes the model
  // reads unevenly (coffee-kitchen.jpg, portrait-laughing.jpg) and the widest open
  // laugh (portrait-smiling-woman.jpg), which must stay open.
  const s = summarizeFaces(result(face(0.1, 0.1, 0.3, 0.3, 0.793, 0.434), face(0.4, 0.1, 0.6, 0.4, 0.571, 0.411), face(0.6, 0.5, 0.9, 0.9, 0.478, 0.267)));
  assert.deepEqual(s.faces.map((f) => f.closed), [true, true, false]);
  assert.equal(s.faces[0].blink, 0.793);
  assert.equal(describeFaces(s), "3 faces, 2 with eyes closed");
  // A deliberate wink now counts too: the price of catching uneven real blinks.
  assert.equal(summarizeFaces(result(face(0.3, 0.3, 0.5, 0.5, 0.9, 0.1))).eyesClosed, true);
});

test("background faces under 1% of the frame never flag the frame", () => {
  const s = summarizeFaces(result(face(0.1, 0.1, 0.15, 0.15, 0.9, 0.9)));
  assert.equal(s.count, 1);
  assert.equal(s.prominent, 0);
  assert.equal(s.eyesClosed, false);
  assert.equal(describeFaces(s), "faces: background only");
});

test("a score exactly on the line is open (faces.py flags eyes_open under 0.5), and the line can be moved", () => {
  const r = result(face(0.2, 0.2, 0.5, 0.5, EYES_CLOSED_AT, EYES_CLOSED_AT));
  assert.equal(summarizeFaces(r).eyesClosed, false);
  assert.equal(eyesOpenFromBlink(EYES_CLOSED_AT), 0.5);
  assert.equal(summarizeFaces(r, { closedAt: 0.4 }).eyesClosed, true);
});

test("no faces, empty or missing result", () => {
  for (const r of [null, {}, { faceLandmarks: [], faceBlendshapes: [] }]) {
    const s = summarizeFaces(r);
    assert.equal(s.count, 0);
    assert.equal(s.eyesClosed, false);
    assert.equal(s.worstBlink, null);
  }
  assert.equal(describeFaces(summarizeFaces(null)), "no faces found");
  assert.equal(describeFaces(null), "");
});

test("missing blend shapes give an unknown blink, not a closed one", () => {
  const s = summarizeFaces({ faceLandmarks: [face(0.2, 0.2, 0.5, 0.5, 0, 0).pts] });
  assert.equal(s.faces[0].blink, null);
  assert.equal(s.eyesClosed, false);
  assert.deepEqual(toDetectorJson(s), { faces: [{ size: 0.09, eyes_open: null }] });
});

test("landmarks off the frame edge are clipped before the area", () => {
  const s = summarizeFaces(result(face(-0.2, -0.1, 0.3, 0.4, 0, 0)));
  assert.deepEqual(s.faces[0].box, [0, 0, 0.3, 0.4]);
  assert.ok(Math.abs(s.faces[0].area - 0.12) < 1e-9);
});

test("the burst pick skips blinking frames unless every frame blinks", () => {
  const a = { name: "a", eyes: { eyesClosed: true } }, b = { name: "b", eyes: { eyesClosed: false } }, c = { name: "c" };
  assert.deepEqual(eyesOpenCandidates([a, b, c]), [b, c]);
  assert.deepEqual(eyesOpenCandidates([a]), [a]);
  assert.deepEqual(eyesOpenCandidates([]), []);
});

test("detector JSON matches the shootflow/faces.py contract", () => {
  const s = summarizeFaces(result(face(0.2, 0.2, 0.5, 0.5, 0.62, 0.61)));
  assert.deepEqual(toDetectorJson(s), { faces: [{ size: 0.09, eyes_open: 0.157 }] });
});

test("the page's line and eyes_open map are the CLI detector's", () => {
  const py = readFileSync(new URL("../tools/mediapipe_face_detector.py", import.meta.url), "utf8");
  assert.equal(Number(py.match(/^BLINK_CLOSED_AT = ([\d.]+)/m)[1]), EYES_CLOSED_AT);
  assert.equal(Number(py.match(/^BLINK_SLOPE = ([\d.]+)/m)[1]), BLINK_SLOPE);
  assert.match(py, /worst = max\(blink\)/);
  // The CLI's eyes_open_from_blink at a few scores (computed with its formula).
  for (const [b, want] of [[0.1, 0.996], [0.45, 0.668], [0.55, 0.332], [0.9, 0.004]]) assert.equal(eyesOpenFromBlink(b), want);
});
