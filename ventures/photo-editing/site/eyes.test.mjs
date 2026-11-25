import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { summarizeFaces, eyesOpenCandidates, toDetectorJson, describeFaces, eyesOpenFromBlink, loadFaceLandmarker, EYES_CLOSED_AT, BLINK_SLOPE, MAX_FACES, MIN_FACE_AREA } from "./eyes.mjs";

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
  // The background-face line is shootflow/faces.py's.
  const faces = readFileSync(new URL("../src/shootflow/faces.py", import.meta.url), "utf8");
  assert.equal(Number(faces.match(/^_MIN_FACE_SIZE = ([\d.]+)/m)[1]), MIN_FACE_AREA);
  // The CLI's eyes_open_from_blink at a few scores (computed with its formula).
  for (const [b, want] of [[0.1, 0.996], [0.45, 0.668], [0.55, 0.332], [0.9, 0.004]]) assert.equal(eyesOpenFromBlink(b), want);
});

test("a face of exactly 1% of the frame counts, as in faces.py (size under 0.01 is skipped)", () => {
  const s = summarizeFaces(result(face(0, 0, 0.5, 0.02, 0.9, 0.9)));
  assert.equal(s.faces[0].area, 0.01);
  assert.equal(s.prominent, 1);
  assert.equal(s.faces[0].closed, true);
  assert.equal(s.eyesClosed, true);
});

test("the page asks the landmarker for as many faces as the CLI detector keeps, with blend shapes", async () => {
  const py = readFileSync(new URL("../tools/mediapipe_face_detector.py", import.meta.url), "utf8");
  assert.equal(Number(py.match(/^MAX_FACES = (\d+)/m)[1]), MAX_FACES);
  const dir = mkdtempSync(join(tmpdir(), "eyes-"));
  writeFileSync(join(dir, "vision_bundle.mjs"), `
    export const FilesetResolver = { forVisionTasks: async (p) => ({ wasm: p }) };
    export const FaceLandmarker = { createFromOptions: async (files, options) => ({ files, options }) };
  `);
  const base = pathToFileURL(dir).href;
  const got = await loadFaceLandmarker({ base, model: "model.task" });
  assert.equal(got.files.wasm, `${base}/wasm`);
  assert.deepEqual(got.options, {
    baseOptions: { modelAssetPath: "model.task", delegate: "CPU" },
    runningMode: "IMAGE",
    numFaces: MAX_FACES,
    outputFaceBlendshapes: true,
  });
});

// ---------------------------------------------------- half faces at the edge
import { edgeLayout, edgeFaceBox, edgeFacesFromResult, drawEdgeView, mergeEdgeFaces, needsEdgeSearch, iou, EDGES } from "./eyes.mjs";

test("edge layout matches the CLI's mirror_strip on a 1000 x 600 frame", () => {
  // right: strip 400 deep, pair 800 x 600, margin round(0.15 * 800) = 120.
  assert.deepEqual(edgeLayout(1000, 600, "right"), { edge: "right", depth: 400, vw: 1040, vh: 840, line: 520, pad: 120 });
  // top: strip 240 deep, pair 1000 x 480, margin 150.
  assert.deepEqual(edgeLayout(1000, 600, "top"), { edge: "top", depth: 240, vw: 1300, vh: 780, line: 390, pad: 150 });
});

test("a face centred on the mirror line maps back to its visible half; one off the line is dropped", () => {
  const w = 1000, h = 600;
  const R = edgeLayout(w, h, "right"); // line at x 520; the frame's x 1000 sits there
  // face spanning x 460..580 in the view, rows 220..340: visible half 940..1000 in the frame.
  assert.deepEqual(edgeFaceBox([460, 220, 580, 340], R, w, h), [940, 100, 1000, 220]);
  assert.equal(edgeFaceBox([300, 220, 420, 340], R, w, h), null); // a whole face inside the strip
  const L = edgeLayout(w, h, "left"); // the frame's x 0 at the line (520)
  assert.deepEqual(edgeFaceBox([460, 220, 580, 340], L, w, h), [0, 100, 60, 220]);
  const B = edgeLayout(w, h, "bottom"); // line at y 240 + 150
  assert.deepEqual(edgeFaceBox([400, 350, 500, 430], B, w, h), [250, 560, 350, 600]);
  const T = edgeLayout(w, h, "top");
  assert.deepEqual(edgeFaceBox([400, 350, 500, 430], T, w, h), [250, 0, 350, 40]);
});

test("edge faces come back normalised to the frame with the edge named", () => {
  const w = 1000, h = 600, R = edgeLayout(w, h, "right");
  const pts = [{ x: 460 / R.vw, y: 220 / R.vh }, { x: 580 / R.vw, y: 340 / R.vh }];
  const res = { faceLandmarks: [pts], faceBlendshapes: [{ categories: [{ categoryName: "eyeBlinkLeft", score: 0.71 }, { categoryName: "eyeBlinkRight", score: 0.61 }] }] };
  const [f] = edgeFacesFromResult(res, R, w, h);
  assert.equal(f.edge, "right");
  assert.equal(f.blink, 0.71);
  f.box.forEach((v, i) => assert.ok(Math.abs(v - [0.94, 100 / 600, 1, 220 / 600][i]) < 1e-9));
});

test("the measured miss: a half face at the right edge is flagged once merged", () => {
  // portrait-woman-white-background.jpg: no whole face; the right-edge view read 0.703 on the page.
  const s = summarizeFaces({ faceLandmarks: [], faceBlendshapes: [] }, { edgeFaces: [{ box: [0.78, 0.2, 1, 0.78], blink: 0.703, edge: "right" }] });
  assert.equal(s.eyesClosed, true);
  assert.equal(s.faces[0].edge, "right");
  assert.equal(describeFaces(s), "1 face, eyes closed");
  assert.equal(toDetectorJson(s).faces[0].eyes_open < 0.5, true);
});

test("an edge face overlapping a whole face is the same face, its scores averaged", () => {
  const whole = [{ box: [0.7, 0.2, 1, 0.6], blink: 0.4 }];
  const merged = mergeEdgeFaces(whole, [{ box: [0.72, 0.22, 1, 0.6], blink: 0.6, edge: "right" }, { box: [0, 0, 0.1, 0.2], blink: 0.2, edge: "left" }]);
  assert.equal(merged.length, 2);
  assert.ok(Math.abs(merged[0].blink - 0.5) < 1e-12);
  assert.equal(merged[1].edge, "left");
  assert.equal(iou([0, 0, 1, 1], [0, 0, 1, 1]), 1);
});

test("frames already flagged skip the edge search", () => {
  assert.equal(needsEdgeSearch({ eyesClosed: true }), false);
  assert.equal(needsEdgeSearch({ eyesClosed: false }), true);
  assert.equal(needsEdgeSearch(null), false);
});

test("drawEdgeView paints the strip and its reflection either side of the line", () => {
  // A recording context: the plain copy goes on the frame's side, the flipped one beyond the line.
  for (const edge of EDGES) {
    const calls = [];
    let t = [1, 0, 0, 1, 0, 0];
    const ctx = { setTransform: (...m) => { t = m; }, fillRect: () => {}, set fillStyle(v) {}, drawImage: (src, sx, sy, sw, sh, dx, dy, dw, dh) => calls.push({ t: [...t], sx, sy, sw, sh, dx, dy, dw, dh }) };
    const L = edgeLayout(100, 60, edge);
    drawEdgeView(ctx, {}, 100, 60, L);
    assert.equal(calls.length, 2);
    const [plain, flipped] = calls;
    // Where the frame's edge lands: map the source edge coordinate through each draw.
    const map = (c, x, y) => [c.t[0] * (c.dx + (x - c.sx) * c.dw / c.sw) + c.t[4], c.t[3] * (c.dy + (y - c.sy) * c.dh / c.sh) + c.t[5]];
    const edgePt = { left: [0, 30], right: [100, 30], top: [50, 0], bottom: [50, 60] }[edge];
    const i = edge === "left" || edge === "right" ? 0 : 1;
    assert.equal(map(plain, ...edgePt)[i], L.line, `${edge} plain`);
    assert.equal(map(flipped, ...edgePt)[i], L.line, `${edge} flipped`);
    // and the strip's inner side lands depth away on opposite sides of the line
    const inner = { left: [L.depth, 30], right: [100 - L.depth, 30], top: [50, L.depth], bottom: [50, 60 - L.depth] }[edge];
    assert.equal(Math.abs(map(plain, ...inner)[i] - L.line), L.depth);
    assert.equal(map(plain, ...inner)[i] + map(flipped, ...inner)[i], 2 * L.line, `${edge} mirrored`);
  }
});
