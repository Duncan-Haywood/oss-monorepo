// Closed-eye check for the cull page: turns MediaPipe Face Landmarker output
// into a per-frame verdict, and loads the landmarker on request.
//
// Opt-in. The library (Apache-2.0) and the 3.6 MB model are fetched from
// public CDNs the first time the box is ticked; the photos themselves are
// read on this computer and never sent anywhere.
//
// The verdict uses the model's eyeBlinkLeft/eyeBlinkRight blend-shape scores.
// A face counts as eyes-closed when BOTH scores reach EYES_CLOSED_AT (a wink
// or a squint on one side is not a blink). The line sits between what was
// measured on the check set (eval/cull-closed-eyes-2026-11-24.md): open eyes,
// smiling or squinting, scored 0.005 to 0.27; the one closed pair 0.61 to 0.63.
// That is one closed face, not a calibrated rate: treat the flag as a hint.

export const EYES_CLOSED_AT = 0.45;
// Faces under 1% of the frame are background people; a blink there is not the
// shot's fault (the same line as shootflow/faces.py).
export const MIN_FACE_AREA = 0.01;

export const MEDIAPIPE_VERSION = "0.10.21";
export const MEDIAPIPE_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
export const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

function blendScore(shapes, name) {
  const c = shapes?.categories?.find((k) => k.categoryName === name);
  return c ? c.score : null;
}

// result: what FaceLandmarker.detect() returns ({ faceLandmarks, faceBlendshapes }),
// landmarks normalised 0..1 to the image that was passed in.
export function summarizeFaces(result, { closedAt = EYES_CLOSED_AT, minArea = MIN_FACE_AREA } = {}) {
  const faces = (result?.faceLandmarks || []).map((pts, i) => {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(1, x1); y1 = Math.min(1, y1);
    const area = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    const shapes = result.faceBlendshapes?.[i];
    const l = blendScore(shapes, "eyeBlinkLeft"), r = blendScore(shapes, "eyeBlinkRight");
    const blink = l == null || r == null ? null : Math.min(l, r);
    return { box: [x0, y0, x1, y1], area, blink, prominent: area >= minArea, closed: blink != null && area >= minArea && blink >= closedAt };
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

// The burst pick: frames whose eyes were checked and found closed drop out,
// unless every frame in the burst has someone blinking (then all stay in).
export function eyesOpenCandidates(frames) {
  const open = frames.filter((f) => !f.eyes?.eyesClosed);
  return open.length ? open : frames;
}

// The SHOOTFLOW_FACE_DETECTOR contract shootflow/faces.py reads:
// {"faces": [{"size": share of frame, "eyes_open": 0..1 or null}]}.
export function toDetectorJson(summary) {
  return { faces: summary.faces.map((f) => ({ size: +f.area.toFixed(4), eyes_open: f.blink == null ? null : +(1 - f.blink).toFixed(3) })) };
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
        numFaces: 20,
        outputFaceBlendshapes: true,
      });
    })();
    landmarkerPromise.catch(() => { landmarkerPromise = null; });
  }
  return landmarkerPromise;
}
