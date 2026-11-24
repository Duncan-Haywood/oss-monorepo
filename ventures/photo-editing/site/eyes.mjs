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
    const blink = l == null || r == null ? null : Math.max(l, r);
    return { box: [x0, y0, x1, y1], area, blink, prominent: area >= minArea, closed: blink != null && area >= minArea && blink > closedAt };
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
