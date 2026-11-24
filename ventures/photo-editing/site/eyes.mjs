// Closed-eye check for the cull page: turns MediaPipe Face Landmarker output
// into a per-frame verdict, and loads the landmarker on request.
//
// Opt-in. The library (Apache-2.0) and the 3.6 MB model are fetched from
// public CDNs the first time the box is ticked; the photos themselves are
// read on this computer and never sent anywhere.
//
// The verdict uses the model's eyeBlinkLeft/eyeBlinkRight blend-shape scores,
// with the same rule as the CLI detector (tools/mediapipe_face_detector.py), so
// a frame gets one verdict whichever way it is culled: a face counts as
// eyes-closed when the MORE-closed eye's score passes EYES_CLOSED_AT (0.5).
// Until 2026-11-24's second change the page needed BOTH eyes at 0.45 or more;
// on 115 labelled photos that missed 2 of the 6 closed faces it found, because
// on real shut eyes the model often reads one lid far lower (0.79 / 0.43,
// 0.57 / 0.41). The CLI's rule, set on 2026-11-16 before these readings, flags
// 6 of 7 closed photos and 0 of 108 others with the page's own search
// (eval/blink-rule-agreement-2026-11-24.md). The cost: a deliberate wink now
// counts as a blink. The margin is thin (the highest open face read 0.478),
// so treat the flag as a hint.

export const EYES_CLOSED_AT = 0.5;
// eyes_open for shootflow/faces.py: the CLI's logistic map of the blink score,
// 0.5 at the line (BLINK_CLOSED_AT, BLINK_SLOPE in the CLI detector).
export const BLINK_SLOPE = 14;
// Faces under 1% of the frame are background people; a blink there is not the
// shot's fault (the same line as shootflow/faces.py).
export const MIN_FACE_AREA = 0.01;
// Faces the landmarker is asked for: the CLI detector's MAX_FACES, so a big group
// shot is checked to the same depth either way (it was 20 here until 2026-11-24,
// which left faces 21 to 32 of a group photo unchecked on the page only).
export const MAX_FACES = 32;

export const MEDIAPIPE_VERSION = "0.10.21";
export const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
export const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

function blendScore(shapes, name) {
  const c = shapes?.categories?.find((k) => k.categoryName === name);
  return c ? c.score : null;
}

// Raw faces from one FaceLandmarker.detect() result: box (in the units of the
// image passed in, landmarks scaled by w and h) and the more-closed eye's score.
function rawFaces(result, w = 1, h = 1) {
  return (result?.faceLandmarks || []).map((pts, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      const x = p.x * w, y = p.y * h;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const shapes = result.faceBlendshapes?.[i];
    const l = blendScore(shapes, "eyeBlinkLeft"), r = blendScore(shapes, "eyeBlinkRight");
    return { box: [x0, y0, x1, y1], blink: l == null || r == null ? null : Math.max(l, r) };
  });
}

// result: what FaceLandmarker.detect() returns ({ faceLandmarks, faceBlendshapes }),
// landmarks normalised 0..1 to the image that was passed in. edgeFaces: half
// faces found by the mirrored edge search (edgeFacesFromResult), merged in.
export function summarizeFaces(result, { closedAt = EYES_CLOSED_AT, minArea = MIN_FACE_AREA, edgeFaces = [] } = {}) {
  const whole = rawFaces(result).map((f) => ({ ...f, box: clipBox(f.box) }));
  const faces = mergeEdgeFaces(whole, edgeFaces).map((f) => {
    const [x0, y0, x1, y1] = f.box;
    const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    const out = { box: f.box, area, blink: f.blink, prominent: area >= minArea, closed: f.blink != null && area >= minArea && f.blink > closedAt };
    if (f.edge) out.edge = f.edge;
    return out;
  });
  const prominent = faces.filter((f) => f.prominent);
  const scored = prominent.filter((f) => f.blink != null);
  const worst = scored.length ? Math.max(...scored.map((f) => f.blink)) : null;
  return {
    faces,
    count: faces.length,
    prominent: prominent.length,
    closedCount: faces.filter((f) => f.closed).length,
    eyesClosed: faces.some((f) => f.closed),
    worstBlink: worst,
  };
}

function clipBox([x0, y0, x1, y1]) {
  return [Math.max(0, x0), Math.max(0, y0), Math.min(1, x1), Math.min(1, y1)];
}

// ------------------------------------------------- half faces at the edge
// The face finder needs a whole face, so a face cut by the frame edge is not
// found at all (the page's one miss on its labelled set). The CLI detector
// (tools/mediapipe_face_detector.py, eval/blink-edge-mirror-2026-11-16.md)
// reflects a strip along each edge across that edge, so the half face and its
// reflection make a whole one, and keeps a face found there only when it is
// centred on the mirror line. Same constants here.
export const EDGE_DEPTH = 0.4;            // strip depth, share of the frame across the edge
export const EDGE_MARGIN = 0.15;          // plain margin, share of the mirrored pair's larger side
export const EDGE_CENTRE_TOLERANCE = 0.1; // face centre to mirror line, share of its width
export const EDGE_MARGIN_GREY = 230;
export const EDGES = ["left", "right", "top", "bottom"];
// Faces from different views overlapping this much are one face (the CLI's DUPLICATE_IOU).
export const DUPLICATE_IOU = 0.3;

// Where things sit in the mirrored view of one edge of a w x h frame.
// Returns { edge, depth, vw, vh, line, pad }: the view's size, the mirror
// line's coordinate in it (x for left/right, y for top/bottom) and the margin.
export function edgeLayout(w, h, edge) {
  const across = edge === "left" || edge === "right" ? w : h;
  const depth = Math.max(1, Math.round(EDGE_DEPTH * across));
  const [bw, bh] = edge === "left" || edge === "right" ? [2 * depth, h] : [w, 2 * depth];
  const pad = Math.round(EDGE_MARGIN * Math.max(bw, bh));
  return { edge, depth, vw: bw + 2 * pad, vh: bh + 2 * pad, line: depth + pad, pad };
}

// Paints the mirrored view of src (a canvas or image, w x h) into ctx, whose
// canvas is layout.vw x layout.vh: the strip on the frame's side of the line,
// its reflection on the other, a plain grey margin round both.
export function drawEdgeView(ctx, src, w, h, L) {
  const g = EDGE_MARGIN_GREY;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgb(${g},${g},${g})`;
  ctx.fillRect(0, 0, L.vw, L.vh);
  const { depth: d, pad: p } = L;
  // [sx, sy, sw, sh] of the strip in the frame, and where its unflipped copy goes.
  const strip = { left: [0, 0, d, h], right: [w - d, 0, d, h], top: [0, 0, w, d], bottom: [0, h - d, w, d] }[L.edge];
  const plain = { left: [p + d, p], right: [p, p], top: [p, p + d], bottom: [p, p] }[L.edge];
  const flip = { left: [p, p], right: [p + d, p], top: [p, p], bottom: [p, p + d] }[L.edge];
  ctx.drawImage(src, ...strip, plain[0], plain[1], strip[2], strip[3]);
  if (L.edge === "left" || L.edge === "right") ctx.setTransform(-1, 0, 0, 1, 2 * flip[0] + d, 0);
  else ctx.setTransform(1, 0, 0, -1, 0, 2 * flip[1] + d);
  ctx.drawImage(src, ...strip, flip[0], flip[1], strip[2], strip[3]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// A face box found in the mirrored view (view pixels) mapped back to the frame
// (pixels), clipped to its visible half; null when it is not centred on the
// mirror line (a whole face, or a reflection, which the ordinary pass sees).
export function edgeFaceBox(box, L, w, h) {
  const [left, top, right, bottom] = box;
  const [a0, a1] = L.edge === "left" || L.edge === "right" ? [left, right] : [top, bottom];
  const centre = (a0 + a1) / 2, span = a1 - a0;
  if (!(span > 0) || Math.abs(centre - L.line) > EDGE_CENTRE_TOLERANCE * span) return null;
  const { depth: d, pad: p, line } = L;
  let m;
  if (L.edge === "right") m = [left - p + w - d, top - p, line - p + w - d, bottom - p];
  else if (L.edge === "left") m = [0, top - p, right - line, bottom - p];
  else if (L.edge === "bottom") m = [left - p, top - p + h - d, right - p, line - p + h - d];
  else m = [left - p, 0, right - p, bottom - line];
  const x0 = Math.max(0, m[0]), y0 = Math.max(0, m[1]), x1 = Math.min(w, m[2]), y1 = Math.min(h, m[3]);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

// Half faces from the landmarker's result on one mirrored view, boxes
// normalised 0..1 to the frame.
export function edgeFacesFromResult(result, L, w, h) {
  const out = [];
  for (const f of rawFaces(result, L.vw, L.vh)) {
    const b = edgeFaceBox(f.box, L, w, h);
    if (b) out.push({ box: [b[0] / w, b[1] / h, b[2] / w, b[3] / h], blink: f.blink, edge: L.edge });
  }
  return out;
}

export function iou(a, b) {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

// Edge faces join the whole-frame list unless they overlap a face already in
// it (or an earlier edge face: a corner face is seen from two edges), in which
// case the blink scores are averaged, as the CLI merges its views.
export function mergeEdgeFaces(whole, edgeFaces) {
  const faces = whole.map((f) => ({ ...f, views: [f.blink] }));
  for (const e of edgeFaces) {
    const same = faces.find((f) => iou(f.box, e.box) >= DUPLICATE_IOU);
    if (same) same.views.push(e.blink);
    else faces.push({ ...e, views: [e.blink] });
  }
  return faces.map(({ views, ...f }) => {
    const known = views.filter((v) => v != null);
    return { ...f, blink: known.length ? known.reduce((s, v) => s + v, 0) / known.length : null };
  }).slice(0, MAX_FACES);
}

// Whether a frame needs the edge search: not when the whole-frame pass already
// found someone blinking (more faces cannot clear that verdict).
export function needsEdgeSearch(summary) {
  return !!summary && !summary.eyesClosed;
}

// The burst pick: frames whose eyes were checked and found closed drop out,
// unless every frame in the burst has someone blinking (then all stay in).
export function eyesOpenCandidates(frames) {
  const open = frames.filter((f) => !f.eyes?.eyesClosed);
  return open.length ? open : frames;
}

// The SHOOTFLOW_FACE_DETECTOR contract shootflow/faces.py reads:
// {"faces": [{"size": share of frame, "eyes_open": 0..1 or null}]}.
export function eyesOpenFromBlink(blink, { closedAt = EYES_CLOSED_AT, slope = BLINK_SLOPE } = {}) {
  return +Math.min(1, Math.max(0, 1 / (1 + Math.exp(slope * (blink - closedAt))))).toFixed(3);
}
export function toDetectorJson(summary) {
  return { faces: summary.faces.map((f) => ({ size: +f.area.toFixed(4), eyes_open: f.blink == null ? null : eyesOpenFromBlink(f.blink) })) };
}

// Short text for the large view's info line.
export function describeFaces(summary) {
  if (!summary) return "";
  if (!summary.prominent) return summary.count ? "faces: background only" : "no faces found";
  const n = summary.prominent;
  const who = n === 1 ? "1 face" : `${n} faces`;
  if (!summary.eyesClosed) return `${who}, eyes open`;
  return summary.closedCount === n ? `${who}, eyes closed` : `${who}, ${summary.closedCount} with eyes closed`;
}

let landmarkerPromise = null;
export function loadFaceLandmarker({ base = MEDIAPIPE_BASE, model = FACE_MODEL_URL } = {}) {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import(/* @vite-ignore */ `${base}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${base}/wasm`);
      return FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: model, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: MAX_FACES,
        outputFaceBlendshapes: true,
      });
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}
