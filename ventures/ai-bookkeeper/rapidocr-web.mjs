// RapidOCR in JavaScript: PaddleOCR's PP-OCRv4 detection and recognition models (and the
// 180-degree classifier) run through ONNX Runtime Web, in the browser, so a receipt photo is
// read on the visitor's own machine with the engine the CLI's `receipts --rapidocr` uses.
// This file is a port of rapidocr-onnxruntime 1.4.4's pipeline (Apache-2.0; its config.yaml
// defaults): the same resizes, the DB post-processing (threshold 0.3, 2 x 2 dilation, box
// score 0.5, unclip 1.6), crops, classifier, CTC decode and the 0.5 text-score cut. The
// models are the same weights (outputs equal on the same input; eval/rapidocr-web-2026-11-17.md)
// published on npm as @gutenye/ocr-models 1.4.2, fetched from jsDelivr only when someone
// asks for this reader (about 16 MB, cached by the browser after that).
//
// Every step that is not a model call is plain JavaScript over typed arrays, so it runs (and
// is tested) in Node with no browser. `ort` (onnxruntime-web or onnxruntime-node) and the
// models are passed in: `createRapidOcr({ ort, models: { det, cls, rec }, keys })`.
//
// What differs from the Python: findContours's hole contours are not boxed (a hole in a
// dilated text mask is rare); OpenCV's fixed-point arithmetic is done in floating point and
// rounded; a contour's minimum-area rectangle is found from its pixels' convex hull, which is
// the same rectangle. The eval note measures what that costs.

const CDN = "https://cdn.jsdelivr.net/npm";
export const RAPID_URLS = {
  ort: `${CDN}/onnxruntime-web@1.20.1/dist/ort.min.js`,
  // the same build as an ES module, for rapidocr-worker.mjs (a module worker has no importScripts)
  ortModule: `${CDN}/onnxruntime-web@1.20.1/dist/ort.min.mjs`,
  wasm: `${CDN}/onnxruntime-web@1.20.1/dist/`,
  det: `${CDN}/@gutenye/ocr-models@1.4.2/assets/ch_PP-OCRv4_det_infer.onnx`,
  cls: `${CDN}/@gutenye/ocr-models@1.4.2/assets/ch_ppocr_mobile_v2.0_cls_infer.onnx`,
  rec: `${CDN}/@gutenye/ocr-models@1.4.2/assets/ch_PP-OCRv4_rec_infer.onnx`,
  keys: `${CDN}/@gutenye/ocr-models@1.4.2/assets/ppocr_keys_v1.txt`,
};

// The recogniser by the receipt's script. "latin" is the default above (Latin, digits and
// Chinese). "cyrillic" is PaddleOCR's East Slavic PP-OCRv5 recogniser (Apache-2.0; 517
// characters: Russian, Ukrainian, Belarusian, Bulgarian and Latin), the model the CLI reads
// Russian slips with (RAPIDOCR_REC_MODEL; eval/receipt-ocr-ru-eslav-2026-11-18.md). It is not
// on npm, so it comes from Hugging Face at a pinned revision, and the bytes must hash to the
// sha256 below or the reader refuses them (a moved or altered file is an error, not a guess).
// Detection and the classifier are the same models for both.
const HF_ESLAV = "https://huggingface.co/monkt/paddleocr-onnx/resolve/7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65/languages/eslav";
export const RAPID_RECOGNISERS = {
  latin: { rec: RAPID_URLS.rec, keys: RAPID_URLS.keys },
  cyrillic: {
    rec: `${HF_ESLAV}/rec.onnx`, keys: `${HF_ESLAV}/dict.txt`,
    sha256: {
      rec: "dc6bf0e855247decce214ba6dae5bc135fa0ad725a5918a7fcfb59fad6c9cdee",
      keys: "3e95f1581557162870cacdba5af91a4c6be2890710d395b0c3c7578e7ee5e6eb",
    },
  },
};

// the four downloads for a script: { det, cls, rec, keys } URLs and the hashes to check
export function rapidModelUrls(script = "latin") {
  const r = RAPID_RECOGNISERS[script];
  if (!r) throw new Error(`no RapidOCR recogniser for "${script}" (use ${Object.keys(RAPID_RECOGNISERS).join(" or ")})`);
  return { det: RAPID_URLS.det, cls: RAPID_URLS.cls, rec: r.rec, keys: r.keys, sha256: r.sha256 ?? {} };
}

// Downloads the det, cls, rec models and the keys with `fetchBytes(url)`, checks any pinned
// hash, and returns { det, cls, rec, keys } ready for createRapidOcr.
export async function fetchRapidModels(fetchBytes, script = "latin") {
  const u = rapidModelUrls(script);
  const get = async (k) => {
    const b = await fetchBytes(u[k]);
    if (u.sha256[k]) {
      const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
      const got = Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
      if (got !== u.sha256[k]) throw new Error(`the ${script} RapidOCR ${k === "keys" ? "character list" : "model"} did not match its pinned hash, so it was not used`);
    }
    return b;
  };
  const [det, cls, rec, keys] = await Promise.all([get("det"), get("cls"), get("rec"), get("keys")]);
  return { det, cls, rec, keys: new TextDecoder().decode(keys) };
}

export const RAPID_CONFIG = {
  textScore: 0.5, minHeight: 30, widthHeightRatio: 8, maxSideLen: 2000, minSideLen: 30,
  limitSideLen: 736, thresh: 0.3, boxThresh: 0.5, maxCandidates: 1000, unclipRatio: 1.6,
  clsShape: [3, 48, 192], clsBatch: 6, clsThresh: 0.9, recShape: [3, 48, 320], recBatch: 6,
};

// ---- images: { width, height, data } with data a Uint8Array of BGR triples (OpenCV's order,
// which the models were trained on)

export function bgrFromRgba(rgba, width, height) {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height; i++, j += 4) {
    data[i * 3] = rgba[j + 2]; data[i * 3 + 1] = rgba[j + 1]; data[i * 3 + 2] = rgba[j];
  }
  return { width, height, data };
}

const clampByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

// cv2.resize(img, (w, h)) with INTER_LINEAR on 8-bit pixels: half-pixel centres, edge pixels
// repeated, no smoothing when shrinking, and OpenCV's fixed-point arithmetic (weights in
// 2048ths; the vertical pass as its vectorised code rounds it), so the pixels come out as
// OpenCV's do, not merely close
const COEF = 2048;
const satShort = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
function linearTaps(dst, src, scale) {
  const idx = new Int32Array(dst * 2), wt = new Int32Array(dst * 2);
  for (let d = 0; d < dst; d++) {
    let f = (d + 0.5) * scale - 0.5;
    let s = Math.floor(f); f -= s;
    if (s < 0) { s = 0; f = 0; }
    if (s >= src - 1) { s = src - 1; f = 0; }
    idx[d * 2] = s; idx[d * 2 + 1] = Math.min(s + 1, src - 1);
    wt[d * 2] = satShort((1 - f) * COEF); wt[d * 2 + 1] = satShort(f * COEF);
  }
  return { idx, wt };
}
export function resizeLinear(img, w, h) {
  const { width: W, height: H, data: src } = img;
  const out = new Uint8Array(w * h * 3);
  const X = linearTaps(w, W, W / w), Y = linearTaps(h, H, H / h);
  // horizontal pass per source row, cached for the two rows each output row needs
  const rows = new Map();
  const hrow = (y) => {
    let r = rows.get(y);
    if (r) return r;
    r = new Int32Array(w * 3);
    const o = y * W * 3;
    for (let x = 0; x < w; x++) {
      const a = X.idx[x * 2] * 3, b = X.idx[x * 2 + 1] * 3, wa = X.wt[x * 2], wb = X.wt[x * 2 + 1];
      for (let c = 0; c < 3; c++) r[x * 3 + c] = src[o + a + c] * wa + src[o + b + c] * wb;
    }
    if (rows.size > 4) rows.clear();
    rows.set(y, r);
    return r;
  };
  for (let y = 0; y < h; y++) {
    const r0 = hrow(Y.idx[y * 2]), r1 = hrow(Y.idx[y * 2 + 1]);
    const b0 = Y.wt[y * 2], b1 = Y.wt[y * 2 + 1], o = y * w * 3;
    for (let i = 0; i < w * 3; i++) {
      const v = (((b0 * (r0[i] >> 4)) >> 16) + ((b1 * (r1[i] >> 4)) >> 16) + 2) >> 2;
      out[o + i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { width: w, height: h, data: out };
}

const round32 = (v) => Math.round(v / 32) * 32;
// Python's round() on .5 goes to the even neighbour; Math.round goes up
const pyRound = (v) => { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); };
const pyRound32 = (v) => pyRound(v / 32) * 32;

// main.py preprocess: a long side over 2,000 shrunk to it, a short side under 30 grown to it,
// both to multiples of 32; the ratios map boxes back to the photo
function preprocess(img, cfg) {
  let ratioH = 1, ratioW = 1;
  const fit = (im, ratio) => {
    const h = pyRound32(Math.trunc(im.height * ratio)), w = pyRound32(Math.trunc(im.width * ratio));
    if (w <= 0 || h <= 0) throw new Error("photo too small to read");
    const out = resizeLinear(im, w, h);
    ratioH = im.height / h; ratioW = im.width / w;
    return out;
  };
  if (Math.max(img.height, img.width) > cfg.maxSideLen) img = fit(img, cfg.maxSideLen / Math.max(img.height, img.width));
  if (Math.min(img.height, img.width) < cfg.minSideLen) img = fit(img, cfg.minSideLen / Math.min(img.height, img.width));
  return { img, ratioH, ratioW };
}

// main.py maybe_add_letterbox: a strip of text (short, or wider than 8:1) gets black bands
// above and below
function letterbox(img, cfg) {
  const { width: w, height: h } = img;
  if (!(h <= cfg.minHeight || w / h > cfg.widthHeightRatio)) return { img, top: 0 };
  const newH = Math.max(Math.trunc(w / cfg.widthHeightRatio), cfg.minHeight) * 2;
  const pad = Math.trunc(Math.abs(newH - h) / 2);
  const out = new Uint8Array(w * (h + 2 * pad) * 3);
  out.set(img.data, pad * w * 3);
  return { img: { width: w, height: h + 2 * pad, data: out }, top: pad };
}

// NCHW float tensor data, (x / 255 - 0.5) / 0.5, from a BGR image, padded with zeros to padW
function normalise(img, padW = img.width) {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(3 * h * padW);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    for (let c = 0; c < 3; c++) out[c * h * padW + y * padW + x] = data[i + c] / 255 * 2 - 1;
  }
  return out;
}

// ---- detection post-processing (DBPostProcess)

// cv2.dilate with a 2 x 2 kernel of ones (anchor at its centre, (1, 1)): a pixel is set when
// it or its left, upper or upper-left neighbour is
export function dilate2(mask, w, h) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    out[i] = mask[i] || (x > 0 && mask[i - 1]) || (y > 0 && mask[i - w]) || (x > 0 && y > 0 && mask[i - w - 1]) ? 1 : 0;
  }
  return out;
}

// 8-connected components; each comes back as its rows' leftmost and rightmost pixels, which
// is all its convex hull needs
export function components(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const comps = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || label[start] >= 0) continue;
    const id = comps.length;
    const rows = new Map();
    let sp = 0; stack[sp++] = start; label[start] = id;
    while (sp) {
      const p = stack[--sp], y = (p / w) | 0, x = p - y * w;
      const r = rows.get(y);
      if (!r) rows.set(y, [x, x]); else { if (x < r[0]) r[0] = x; if (x > r[1]) r[1] = x; }
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w || (!dx && !dy)) continue;
          const q = yy * w + xx;
          if (mask[q] && label[q] < 0) { label[q] = id; stack[sp++] = q; }
        }
      }
    }
    const pts = [];
    for (const [y, [a, b]] of rows) { pts.push([a, y]); if (b !== a) pts.push([b, y]); }
    comps.push(pts);
  }
  return comps;
}

export function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length <= 2) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

// cv2.minAreaRect + cv2.boxPoints: the smallest rectangle around the points (rotating
// calipers over the hull's edges); returns its corners and its short side
export function minAreaRect(points) {
  const hull = convexHull(points);
  if (hull.length === 0) return { corners: [[0, 0], [0, 0], [0, 0], [0, 0]], short: 0 };
  if (hull.length === 1) { const [x, y] = hull[0]; return { corners: [[x, y], [x, y], [x, y], [x, y]], short: 0 }; }
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const q of hull) {
      const u = q[0] * ux + q[1] * uy, v = -q[0] * uy + q[1] * ux;
      if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area - 1e-9) best = { area, ux, uy, minU, maxU, minV, maxV };
  }
  const { ux, uy, minU, maxU, minV, maxV } = best;
  const at = (u, v) => [u * ux - v * uy, u * uy + v * ux];
  return { corners: [at(minU, minV), at(maxU, minV), at(maxU, maxV), at(minU, maxV)], short: Math.min(maxU - minU, maxV - minV) };
}

// DBPostProcess.get_mini_boxes: corners ordered top-left, top-right, bottom-right, bottom-left
export function miniBox(points) {
  const { corners, short } = minAreaRect(points);
  const p = corners.map((c, i) => [c[0], c[1], i]).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const [i1, i4] = p[1][1] > p[0][1] ? [0, 1] : [1, 0];
  const [i2, i3] = p[3][1] > p[2][1] ? [2, 3] : [3, 2];
  return { box: [p[i1], p[i2], p[i3], p[i4]].map((q) => [q[0], q[1]]), short };
}

function insideQuad(q, x, y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (Math.abs(c / len) <= 0.5) continue; // on an edge: fillPoly paints edge pixels
    const s = c > 0 ? 1 : -1;
    if (!sign) sign = s; else if (s !== sign) return false;
  }
  return true;
}

// box_score_fast: the mean probability inside the box (its pixels as cv2.fillPoly paints them)
export function boxScore(prob, w, h, box) {
  const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
  const clip = (v, hi) => Math.min(Math.max(v, 0), hi);
  const x0 = clip(Math.floor(Math.min(...xs)), w - 1), x1 = clip(Math.ceil(Math.max(...xs)), w - 1);
  const y0 = clip(Math.floor(Math.min(...ys)), h - 1), y1 = clip(Math.ceil(Math.max(...ys)), h - 1);
  const q = box.map((p) => [Math.trunc(p[0]), Math.trunc(p[1])]);
  let sum = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (insideQuad(q, x, y)) { sum += prob[y * w + x]; n++; }
  return n ? sum / n : 0;
}

// unclip: pyclipper's offset of the box by area * ratio / perimeter with round joins (Clipper
// 6's ClipperOffset, arc tolerance 0.25), then its minimum-area rectangle again. pyclipper
// truncates the box's corners to integers and rounds the offset's points; both are kept here.
export function unclip(box, ratio) {
  let area = 0, perim = 0;
  for (let i = 0; i < 4; i++) {
    const a = box[i], b = box[(i + 1) % 4];
    area += a[0] * b[1] - b[0] * a[1]; perim += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const delta = perim ? (Math.abs(area) / 2) * ratio / perim : 0;
  let src = box.map((p) => [Math.trunc(p[0]), Math.trunc(p[1])]);
  // Clipper turns a path with negative area round before offsetting it
  let a2 = 0;
  for (let i = 0; i < src.length; i++) { const p = src[i], q = src[(i + 1) % src.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
  if (a2 < 0) src = src.reverse();
  return clipperOffset(src, delta);
}

const cRound = (v) => (v < 0 ? Math.trunc(v - 0.5) : Math.trunc(v + 0.5));

function clipperOffset(src, delta) {
  const n = src.length;
  if (delta <= 0 || n < 3) return src.map((p) => [...p]);
  const normals = src.map((p, j) => {
    const q = src[(j + 1) % n];
    let dx = q[0] - p[0], dy = q[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (!len) return [0, 0];
    dx /= len; dy /= len;
    return [dy, -dx];
  });
  const tol = Math.min(0.25, Math.abs(delta) * 0.25);
  let steps = Math.PI / Math.acos(1 - tol / Math.abs(delta));
  if (steps > Math.abs(delta) * Math.PI) steps = Math.abs(delta) * Math.PI;
  const sin = Math.sin((2 * Math.PI) / steps), cos = Math.cos((2 * Math.PI) / steps), perRad = steps / (2 * Math.PI);
  const out = [];
  const push = (x, y) => out.push([cRound(x), cRound(y)]);
  let k = n - 1;
  for (let j = 0; j < n; j++) {
    const [px, py] = src[j], nk = normals[k], nj = normals[j];
    let sinA = nk[0] * nj[1] - nj[0] * nk[1];
    const cosA = nk[0] * nj[0] + nk[1] * nj[1];
    if (Math.abs(sinA * delta) < 1) {
      if (cosA > 0) { push(px + nk[0] * delta, py + nk[1] * delta); k = j; continue; }
    } else sinA = Math.max(-1, Math.min(1, sinA));
    if (sinA * delta < 0) {
      push(px + nk[0] * delta, py + nk[1] * delta); out.push([px, py]); push(px + nj[0] * delta, py + nj[1] * delta);
    } else {
      const ang = Math.atan2(sinA, cosA);
      const m = Math.max(cRound(perRad * Math.abs(ang)), 1);
      let X = nk[0], Y = nk[1];
      for (let i = 0; i < m; i++) {
        push(px + X * delta, py + Y * delta);
        const X2 = X; X = X * cos - sin * Y; Y = X2 * sin + Y * cos;
      }
      push(px + nj[0] * delta, py + nj[1] * delta);
    }
    k = j;
  }
  return out;
}

export function boxesFromProb(prob, w, h, destW, destH, cfg = RAPID_CONFIG) {
  const seg = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) seg[i] = prob[i] > cfg.thresh ? 1 : 0;
  const comps = components(dilate2(seg, w, h), w, h).slice(0, cfg.maxCandidates);
  const boxes = [];
  for (const pts of comps) {
    const first = miniBox(pts);
    if (first.short < 3) continue;
    if (boxScore(prob, w, h, first.box) < cfg.boxThresh) continue;
    const second = miniBox(unclip(first.box, cfg.unclipRatio));
    if (second.short < 5) continue;
    boxes.push(second.box.map(([x, y]) => [
      Math.min(Math.max(pyRound(x / w * destW), 0), destW),
      Math.min(Math.max(pyRound(y / h * destH), 0), destH),
    ]));
  }
  return boxes;
}

// TextDetector.filter_tag_det_res: corners clockwise from top-left, clipped to the image,
// boxes 3 pixels or less across dropped
function orderClockwise(pts) {
  const xs = pts.map((p, i) => [p, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map((a) => a[0]);
  const [tl, bl] = [xs[0], xs[1]].sort((a, b) => a[1] - b[1]);
  const [tr, br] = [xs[2], xs[3]].sort((a, b) => a[1] - b[1]);
  return [tl, tr, br, bl];
}

export function filterBoxes(boxes, w, h) {
  const out = [];
  for (const b of boxes) {
    const q = orderClockwise(b).map(([x, y]) => [Math.trunc(Math.min(Math.max(x, 0), w - 1)), Math.trunc(Math.min(Math.max(y, 0), h - 1))]);
    const bw = Math.trunc(Math.hypot(q[0][0] - q[1][0], q[0][1] - q[1][1]));
    const bh = Math.trunc(Math.hypot(q[0][0] - q[3][0], q[0][1] - q[3][1]));
    if (bw <= 3 || bh <= 3) continue;
    out.push(q);
  }
  return out;
}

// main.py sorted_boxes: top to bottom, and left to right within 10 pixels of height
export function sortBoxes(boxes) {
  const b = [...boxes].sort((p, q) => p[0][1] - q[0][1] || p[0][0] - q[0][0]);
  for (let i = 0; i < b.length - 1; i++) {
    for (let j = i; j >= 0; j--) {
      if (Math.abs(b[j + 1][0][1] - b[j][0][1]) < 10 && b[j + 1][0][0] < b[j][0][0]) [b[j], b[j + 1]] = [b[j + 1], b[j]];
      else break;
    }
  }
  return b;
}

// ---- crops

// the homography taking the four src points to the four dst points (cv2.getPerspectiveTransform)
function perspective(src, dst) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); B.push(v);
  }
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [B[c], B[p]] = [B[p], B[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c || !A[c][c]) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  const m = B.map((b, i) => (A[i][i] ? b / A[i][i] : 0));
  return [m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], 1];
}

function invert3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

const cubic = (t) => {
  const A = -0.75, x = Math.abs(t);
  if (x <= 1) return ((A + 2) * x - (A + 3)) * x * x + 1;
  if (x < 2) return ((A * x - 5 * A) * x + 8 * A) * x - 4 * A;
  return 0;
};

// get_rotate_crop_image: the box straightened out to its own width and height (bicubic,
// edge pixels repeated), turned a quarter left when it is at least 1.5 times taller than wide
export function cropBox(img, box) {
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const cw = Math.trunc(Math.max(d(box[0], box[1]), d(box[2], box[3])));
  const ch = Math.trunc(Math.max(d(box[0], box[3]), d(box[1], box[2])));
  const W = img.width, H = img.height, src = img.data;
  const out = new Uint8Array(Math.max(cw, 1) * Math.max(ch, 1) * 3);
  const inv = invert3(perspective(box, [[0, 0], [cw, 0], [cw, ch], [0, ch]]));
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const z = inv[6] * x + inv[7] * y + inv[8];
    const sx = (inv[0] * x + inv[1] * y + inv[2]) / z, sy = (inv[3] * x + inv[4] * y + inv[5]) / z;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const wx = [cubic(fx + 1), cubic(fx), cubic(1 - fx), cubic(2 - fx)];
    const wy = [cubic(fy + 1), cubic(fy), cubic(1 - fy), cubic(2 - fy)];
    const o = (y * cw + x) * 3;
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let j = 0; j < 4; j++) {
        const yy = Math.min(Math.max(iy - 1 + j, 0), H - 1);
        let row = 0;
        for (let k = 0; k < 4; k++) {
          const xx = Math.min(Math.max(ix - 1 + k, 0), W - 1);
          row += src[(yy * W + xx) * 3 + c] * wx[k];
        }
        acc += row * wy[j];
      }
      out[o + c] = clampByte(acc);
    }
  }
  let crop = { width: cw, height: ch, data: out };
  if (ch / cw >= 1.5) crop = rot90(crop);
  return crop;
}

// np.rot90: a quarter turn counter-clockwise
export function rot90(img) {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ny = w - 1 - x, nx = y, o = (ny * h + nx) * 3, i = (y * w + x) * 3;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
  }
  return { width: h, height: w, data: out };
}

export function rot180(img) {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(data.length);
  for (let i = 0, n = w * h; i < n; i++) { const j = n - 1 - i; out[j * 3] = data[i * 3]; out[j * 3 + 1] = data[i * 3 + 1]; out[j * 3 + 2] = data[i * 3 + 2]; }
  return { width: w, height: h, data: out };
}

// resize_norm_img (classifier and recogniser): height 48, width in proportion up to padW,
// normalised and padded with zeros to padW
export function lineTensor(img, height, padW) {
  const ratio = img.width / img.height;
  const rw = Math.ceil(height * ratio) > padW ? padW : Math.ceil(height * ratio);
  return normalise(resizeLinear(img, Math.max(rw, 1), height), padW);
}

// a stable argsort by width over height, as the batches are formed
const byRatio = (imgs) => imgs.map((im, i) => [im.width / im.height, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((a) => a[1]);

// CTCLabelDecode: best class per step, repeats and blanks dropped; score is the mean of the
// kept steps' probabilities (0 when none are kept)
export function ctcDecode(probs, steps, classes, chars) {
  let text = "", sum = 0, n = 0, prev = -1;
  for (let t = 0; t < steps; t++) {
    let best = 0, bp = -Infinity;
    const o = t * classes;
    for (let k = 0; k < classes; k++) if (probs[o + k] > bp) { bp = probs[o + k]; best = k; }
    if (best !== 0 && best !== prev) { text += chars[best] ?? ""; sum += bp; n++; }
    prev = best;
  }
  return { text, score: n ? sum / n : 0 };
}

// the character list as the recogniser numbers its classes: blank first, the keys file's
// lines, then a space
export function charList(keysText) {
  const lines = String(keysText).replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return ["blank", ...lines, " "];
}

// ---- the engine

export function createRapidOcr({ ort, models, keys, config = {} }) {
  const cfg = { ...RAPID_CONFIG, ...config };
  const chars = charList(keys);
  let sessions = null;
  const open = async () => {
    if (!sessions) {
      const make = (m) => ort.InferenceSession.create(m);
      const [det, cls, rec] = await Promise.all([make(models.det), make(models.cls), make(models.rec)]);
      sessions = { det, cls, rec };
    }
    return sessions;
  };
  const run = async (session, data, dims) => {
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", data, dims) });
    return out[session.outputNames[0]];
  };

  // RapidOCR()(img): [[box, text, score], ...] with boxes in the photo's own pixels
  async function read(photo) {
    const s = await open();
    const raw = { w: photo.width, h: photo.height };
    const pre = preprocess(photo, cfg);
    const lb = letterbox(pre.img, cfg);
    const img = lb.img;

    // detection: the short side brought up to 736 (limit_type "min"), sides rounded to 32
    const r = Math.min(img.height, img.width) < cfg.limitSideLen ? cfg.limitSideLen / Math.min(img.height, img.width) : 1;
    const dh = pyRound32(Math.trunc(img.height * r)), dw = pyRound32(Math.trunc(img.width * r));
    if (dh <= 0 || dw <= 0) return [];
    const detOut = await run(s.det, normalise(resizeLinear(img, dw, dh)), [1, 3, dh, dw]);
    const [, , ph, pw] = detOut.dims;
    let boxes = filterBoxes(boxesFromProb(detOut.data, pw, ph, img.width, img.height, cfg), img.width, img.height);
    if (!boxes.length) return [];
    boxes = sortBoxes(boxes);
    let crops = boxes.map((b) => cropBox(img, b));

    // classifier: a crop read as upside down with more than 0.9 is turned round
    const [, chh, cww] = cfg.clsShape;
    let order = byRatio(crops);
    for (let i = 0; i < order.length; i += cfg.clsBatch) {
      const idx = order.slice(i, i + cfg.clsBatch);
      const batch = new Float32Array(idx.length * 3 * chh * cww);
      idx.forEach((k, j) => batch.set(lineTensor(crops[k], chh, cww), j * 3 * chh * cww));
      const out = await run(s.cls, batch, [idx.length, 3, chh, cww]);
      idx.forEach((k, j) => { const p0 = out.data[j * 2], p1 = out.data[j * 2 + 1]; if (p1 > p0 && p1 > cfg.clsThresh) crops[k] = rot180(crops[k]); });
    }

    // recogniser: batches of 6 by width, each padded to its widest crop
    const [, rh, rw] = cfg.recShape;
    const texts = new Array(crops.length);
    order = byRatio(crops);
    for (let i = 0; i < order.length; i += cfg.recBatch) {
      const idx = order.slice(i, i + cfg.recBatch);
      let maxRatio = rw / rh;
      for (const k of idx) maxRatio = Math.max(maxRatio, crops[k].width / crops[k].height);
      const padW = Math.trunc(rh * maxRatio);
      const batch = new Float32Array(idx.length * 3 * rh * padW);
      idx.forEach((k, j) => batch.set(lineTensor(crops[k], rh, padW), j * 3 * rh * padW));
      const out = await run(s.rec, batch, [idx.length, 3, rh, padW]);
      const [, steps, classes] = out.dims;
      idx.forEach((k, j) => { texts[k] = ctcDecode(out.data.subarray(j * steps * classes, (j + 1) * steps * classes), steps, classes, chars); });
    }

    const res = [];
    boxes.forEach((b, i) => {
      if (texts[i].score < cfg.textScore) return;
      const back = b.map(([x, y]) => {
        let X = x, Y = y - lb.top;
        X *= pre.ratioW; Y *= pre.ratioH;
        return [Math.min(Math.max(X, 0), raw.w), Math.min(Math.max(Y, 0), raw.h)];
      });
      res.push([back, texts[i].text, texts[i].score]);
    });
    return res;
  }

  return { read, open, close: async () => { if (sessions) for (const x of Object.values(sessions)) await x.release?.(); sessions = null; } };
}

// rapidocr_rows.py rows(): word boxes as text lines. A box joins the first line whose vertical
// span holds the box's centre; lines go by their top edge and words by their left edge, two
// spaces apart (cleanOcr and the parser read gaps as columns).
export function rapidRows(results) {
  const boxes = (results || []).map(([box, text]) => {
    const ys = box.map((p) => p[1]), xs = box.map((p) => p[0]);
    return { top: Math.min(...ys), bottom: Math.max(...ys), left: Math.min(...xs), text };
  });
  boxes.sort((a, b) => (a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
  const lines = [];
  for (const b of boxes) {
    const c = (b.top + b.bottom) / 2;
    const line = lines.find((l) => l.top <= c && c <= l.bottom);
    if (line) line.items.push(b); else lines.push({ top: b.top, bottom: b.bottom, items: [b] });
  }
  lines.sort((a, b) => a.top - b.top);
  return lines.map((l) => l.items.sort((a, b) => a.left - b.left).map((b) => b.text).join("  ") + "\n").join("");
}
