/**
 * Automatic shoulder finding for the photo and camera try-on (`camera.html`).
 *
 * The shopper used to tap both shoulders by hand. Here an on-device pose model
 * (MediaPipe Pose Landmarker "lite", Apache-2.0) finds them: the model files
 * are fetched once, on the shopper's click, from jsDelivr and Google's model
 * storage; the picture itself is never sent anywhere, the model runs in the
 * page (WebAssembly). The taps stay as the fallback and as the correction.
 *
 * The pure part (`shouldersFromPose`) turns the model's normalised landmarks
 * into the two image points `cameraOverlay` takes, and checks what the model
 * can tell us about the photo: are both shoulders seen, is the person facing
 * the camera, are they turned sideways (shoulder span short against the
 * torso), is more than one person in the picture.
 *
 * Landmark meaning (MediaPipe pose topology): 11 = the person's own left
 * shoulder, 12 = their right, 23/24 = left/right hip, 0 = nose. A person
 * facing the camera has their own left shoulder on the picture's right.
 *
 * The model marks the shoulder JOINT, a little inside the bony shoulder point
 * that the body model's width (0.25 x height, `tryon.mjs`) is measured
 * between. `widen` pushes the two points apart about their midpoint to make
 * up for that; it is 1 (no change) by default because no tape-measured photo
 * has fixed it yet (README, "Automatic shoulders").
 */

export const POSE_VERSION = "0.10.21";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${POSE_VERSION}`;
export const POSE_SOURCES = Object.freeze({
  bundle: `${CDN}/vision_bundle.mjs`,
  wasm: `${CDN}/wasm`,
  model: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
});
export const POSE_IDX = Object.freeze({ nose: 0, leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24 });

/**
 * Body-model ratio of shoulder width to the shoulder-to-hip drop, both as a
 * share of height (`tryon.mjs`: shoulder width 0.25 H; shoulder line 0.818 H,
 * hip 0.53 H). Used only to tell a square-on photo from a turned one.
 */
export const SQUARE_RATIO = 0.25 / (0.818 - 0.53);
/**
 * Below this span-to-torso ratio of the model's own points the body is called
 * turned. The model's points are joint centres, so a square-on chest reads
 * under SQUARE_RATIO: the one real photo run (a front-on yoga pose, 2026-11-10)
 * read 0.511. 0.45 is a guess set under that; no turned photo has been run.
 */
export const TURNED_RATIO = 0.45;

const r1 = x => Math.round(x * 10) / 10;
const fin = v => Number.isFinite(+v);
const seen = (p, min) => p && fin(p.x) && fin(p.y) && (p.visibility == null || +p.visibility >= min);

/**
 * @param {Array<Array<{x:number,y:number,visibility?:number}>>|Array<{x,y}>} poses
 *   the model's `landmarks` (one array of 33 normalised points per person), or one such array
 * @param {{w:number,h:number}} frame  size of the picture the model was given, px
 * @param {{minVisibility?:number, widen?:number}} [opts]
 * @returns {{ok:true,left:{x,y},right:{x,y},span:number,ratio:number|null,people:number,facing:string,notes:string[]}|{ok:false,error:string}}
 */
export function shouldersFromPose(poses, frame, opts = {}) {
  const minV = opts.minVisibility ?? 0.5;
  const widen = opts.widen ?? 1;
  if (!frame || !(+frame.w > 0) || !(+frame.h > 0)) return { ok: false, error: "No picture size to place the shoulders on." };
  if (!(widen >= 0.8 && widen <= 1.5)) return { ok: false, error: "The widening factor should be between 0.8 and 1.5." };
  const list = Array.isArray(poses) && Array.isArray(poses[0]) ? poses : Array.isArray(poses) && poses.length ? [poses] : [];
  if (!list.length) return { ok: false, error: "No person was found in the picture. Tap the two shoulders instead." };
  const px = p => ({ x: +p.x * frame.w, y: +p.y * frame.h });
  // Keep the person with the widest pair of seen shoulders: the one nearest the camera.
  const candidates = list.map(lm => {
    const a = lm[POSE_IDX.leftShoulder], b = lm[POSE_IDX.rightShoulder];
    if (!seen(a, minV) || !seen(b, minV)) return null;
    const A = px(a), B = px(b);
    return { lm, A, B, span: Math.hypot(B.x - A.x, B.y - A.y) };
  }).filter(Boolean).sort((p, q) => q.span - p.span);
  if (!candidates.length) return { ok: false, error: "The shoulders are not clearly in view (hidden by hair, an arm or the picture edge). Retake the photo or tap them by hand." };
  const best = candidates[0];
  if (best.span < 20) return { ok: false, error: "The person is too small in the picture to place the shoulders. Move closer or tap them by hand." };
  const notes = [];
  if (list.length > 1) notes.push(`${list.length} people were found; the one nearest the camera is used.`);
  // Own-left shoulder on the picture's right means the person faces the camera.
  const facing = best.A.x > best.B.x ? "front" : "back";
  if (facing === "back") notes.push("The model reads this as a back view (or a mirrored selfie). The outline is front-on; it still sizes, but check the picture is not mirrored.");
  let [left, right] = best.A.x <= best.B.x ? [best.A, best.B] : [best.B, best.A];
  if (widen !== 1) {
    const mx = (left.x + right.x) / 2, my = (left.y + right.y) / 2;
    left = { x: mx + (left.x - mx) * widen, y: my + (left.y - my) * widen };
    right = { x: mx + (right.x - mx) * widen, y: my + (right.y - my) * widen };
  }
  // Turned or not: shoulder span against the shoulder-to-hip drop, when the hips are seen.
  let ratio = null;
  const lh = best.lm[POSE_IDX.leftHip], rh = best.lm[POSE_IDX.rightHip];
  if (seen(lh, minV) && seen(rh, minV)) {
    const H1 = px(lh), H2 = px(rh);
    const torso = Math.hypot((H1.x + H2.x) / 2 - (best.A.x + best.B.x) / 2, (H1.y + H2.y) / 2 - (best.A.y + best.B.y) / 2);
    if (torso > 0) ratio = best.span / torso;
    if (ratio != null && ratio < TURNED_RATIO) notes.push("The shoulders look narrow for the torso: the body seems turned away from the camera, which makes the scale too small. Stand square and retake.");
  } else {
    notes.push("The hips are not in view, so whether the body is turned could not be checked.");
  }
  notes.push("Shoulders placed by an on-device pose model. Check the two dots sit on the shoulders; tap the picture to place them by hand instead.");
  return {
    ok: true,
    left: { x: r1(left.x), y: r1(left.y) },
    right: { x: r1(right.x), y: r1(right.y) },
    span: r1(Math.hypot(right.x - left.x, right.y - left.y) ),
    ratio: ratio == null ? null : Math.round(ratio * 1000) / 1000,
    people: list.length,
    facing,
    notes,
  };
}

let detectorPromise = null;
/**
 * Browser only. Load the pose model once (about 6 MB from jsDelivr and Google
 * model storage) and run it on a canvas or image. Returns the raw landmarks.
 * `sources` can point at self-hosted copies of the same files.
 */
export async function detectPose(image, sources = POSE_SOURCES) {
  detectorPromise ??= (async () => {
    const mp = await import(/* @vite-ignore */ sources.bundle);
    const files = await mp.FilesetResolver.forVisionTasks(sources.wasm);
    return mp.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: sources.model, delegate: "CPU" },
      runningMode: "IMAGE",
      numPoses: 2,
    });
  })();
  let det;
  try { det = await detectorPromise; } catch (e) { detectorPromise = null; throw e; }
  return det.detect(image).landmarks || [];
}

/**
 * Live tracking on the camera stream (2026-11-11). The model runs on video
 * frames (`runningMode: "VIDEO"`, `detectForVideo`), a few times a second,
 * and the two shoulder points are smoothed so the outline does not shake.
 *
 * Smoothing is the One Euro filter (Casiez, Roussel and Vogel, CHI 2012): a
 * low-pass filter whose cut-off rises with speed, so a still shopper gets a
 * steady outline and a moving one is followed without much lag. Each of the
 * four coordinates is filtered on its own. `minCutoff` (Hz) sets the jitter
 * left when still, `beta` how fast the cut-off opens with speed, in px/s.
 * Defaults (0.3 Hz, 0.005) were picked on synthetic frames at 15 fps with 4 px
 * of detector jitter (`posetrack.test.mjs`, README "Live tracking"): jitter
 * cut to about a third, lag about 16 px when stepping sideways at 300 px/s.
 * Not tuned on a recorded clip of a real person.
 *
 * When the model loses the shoulders the last points are held for `holdMs`,
 * then dropped, so a passing arm does not make the outline jump away.
 */
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

export class OneEuro {
  constructor({ minCutoff = 0.3, beta = 0.005, dCutoff = 1 } = {}) {
    if (!(minCutoff > 0) || !(beta >= 0) || !(dCutoff > 0)) throw new RangeError("One Euro filter: minCutoff and dCutoff must be above 0, beta 0 or more.");
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  /** @param {number} value  @param {number} tMs  timestamp in milliseconds */
  filter(value, tMs) {
    if (!Number.isFinite(value) || !Number.isFinite(tMs)) return this.x;
    if (this.x == null || this.t == null || tMs <= this.t) {
      // First sample, or a clock that did not move forward: take the value as is.
      if (this.x == null || this.t == null) { this.x = value; this.t = tMs; }
      return this.x;
    }
    const dt = (tMs - this.t) / 1000;
    const dxRaw = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff, dt) * (dxRaw - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff, dt) * (value - this.x);
    this.t = tMs;
    return this.x;
  }
}

export class ShoulderTracker {
  /**
   * @param {{minCutoff?:number,beta?:number,dCutoff?:number,holdMs?:number,jumpPx?:number}} [opts]
   *   jumpPx: a jump wider than this between two detections (another person
   *   stepped in, or the model swapped people) restarts the filter instead of
   *   gliding across the frame.
   */
  constructor(opts = {}) {
    this.holdMs = opts.holdMs ?? 600;
    this.jumpPx = opts.jumpPx ?? 120;
    this.f = ["lx", "ly", "rx", "ry"].map(() => new OneEuro(opts));
    this.last = null; this.lastSeen = null; this.frames = 0; this.lost = 0;
  }
  reset() { this.f.forEach(f => f.reset()); this.last = null; this.lastSeen = null; }
  /**
   * @param {ReturnType<typeof shouldersFromPose>} found  this frame's result
   * @param {number} tMs
   * @returns {{state:"tracking"|"holding"|"lost", left?:{x,y}, right?:{x,y}, notes?:string[]}}
   */
  update(found, tMs) {
    this.frames++;
    if (found && found.ok) {
      const raw = [found.left.x, found.left.y, found.right.x, found.right.y];
      if (this.last) {
        const jump = Math.max(Math.hypot(raw[0] - this.last.left.x, raw[1] - this.last.left.y), Math.hypot(raw[2] - this.last.right.x, raw[3] - this.last.right.y));
        if (jump > this.jumpPx) this.f.forEach(f => f.reset());
      }
      const [lx, ly, rx, ry] = raw.map((v, i) => this.f[i].filter(v, tMs));
      this.last = { left: { x: r1(lx), y: r1(ly) }, right: { x: r1(rx), y: r1(ry) } };
      this.lastSeen = tMs;
      return { state: "tracking", ...this.last, notes: found.notes };
    }
    this.lost++;
    if (this.last && tMs - this.lastSeen <= this.holdMs) return { state: "holding", ...this.last, notes: [] };
    this.reset();
    return { state: "lost", error: found && found.error };
  }
}

let videoPromise = null;
/**
 * Browser only. A second landmarker in VIDEO mode for the live stream; same
 * files as `detectPose`, loaded once. `tMs` must rise from call to call.
 */
export async function detectPoseVideo(video, tMs, sources = POSE_SOURCES) {
  videoPromise ??= (async () => {
    const mp = await import(/* @vite-ignore */ sources.bundle);
    const files = await mp.FilesetResolver.forVisionTasks(sources.wasm);
    return mp.PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: sources.model, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 2,
    });
  })();
  let det;
  try { det = await videoPromise; } catch (e) { videoPromise = null; throw e; }
  return det.detectForVideo(video, tMs).landmarks || [];
}
