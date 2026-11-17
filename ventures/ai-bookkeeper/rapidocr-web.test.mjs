// rapidocr-web.mjs: the RapidOCR port the page runs. The model calls need ONNX Runtime and
// 16 MB of weights, so these tests check every step around them with no network: OpenCV's
// resize and rectangle geometry, pyclipper's unclip, the detector's post-processing, crops,
// CTC decoding and the rows, then the whole pipeline over a fake `ort`. The models themselves
// were checked against the Python engine on SRD's photos (eval/rapidocr-web-2026-11-17.md).
import test from "node:test";
import assert from "node:assert/strict";
import {
  resizeLinear, minAreaRect, miniBox, unclip, boxesFromProb, filterBoxes, sortBoxes, cropBox,
  rot90, ctcDecode, charList, rapidRows, createRapidOcr, bgrFromRgba, dilate2, components, RAPID_URLS,
} from "./rapidocr-web.mjs";
import { readPhotos } from "./photoocr.mjs";

const grey = (w, h, f) => {
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.fill(f(x, y), (y * w + x) * 3, (y * w + x) * 3 + 3);
  return { width: w, height: h, data };
};

test("resizeLinear: OpenCV's INTER_LINEAR values (half-pixel centres, fixed point)", () => {
  // cv2.resize(np.array([[0, 100, 200, 250]], np.uint8) as 3 channels, (8, 1)) gives these
  const row = grey(4, 1, (x) => [0, 100, 200, 250][x]);
  const up = resizeLinear(row, 8, 1);
  assert.deepEqual([...up.data].filter((_, i) => i % 3 === 0), [0, 25, 75, 125, 175, 213, 238, 250]);
  // shrinking by two averages neighbours, no wider smoothing
  const down = resizeLinear(grey(4, 1, (x) => [0, 100, 200, 250][x]), 2, 1);
  assert.deepEqual([...down.data].filter((_, i) => i % 3 === 0), [50, 225]);
  // the same size is the same image
  const same = resizeLinear(row, 4, 1);
  assert.deepEqual([...same.data], [...row.data]);
});

test("minAreaRect: an axis-aligned block and a tilted one", () => {
  const block = [];
  for (let y = 10; y <= 14; y++) for (let x = 20; x <= 60; x++) block.push([x, y]);
  const r = minAreaRect(block);
  assert.equal(Math.round(r.short), 4);
  const xs = r.corners.map((c) => Math.round(c[0])).sort((a, b) => a - b);
  assert.deepEqual([xs[0], xs[3]], [20, 60]);
  // a line of points at 30 degrees: the rectangle follows it, short side 0
  const line = Array.from({ length: 20 }, (_, i) => [i * Math.cos(Math.PI / 6), i * Math.sin(Math.PI / 6)]);
  assert.ok(minAreaRect(line).short < 1e-9);
  // miniBox orders the corners top-left, top-right, bottom-right, bottom-left
  const { box } = miniBox(block);
  assert.deepEqual(box.map((p) => p.map(Math.round)), [[20, 10], [60, 10], [60, 14], [20, 14]]);
});

test("unclip: pyclipper's round offset by area x 1.6 / perimeter grows each side by that distance", () => {
  const box = [[0, 0], [100, 0], [100, 10], [0, 10]];
  const d = (100 * 10 * 1.6) / 220; // 7.27
  const { box: out } = miniBox(unclip(box, 1.6));
  const w = Math.hypot(out[1][0] - out[0][0], out[1][1] - out[0][1]);
  const h = Math.hypot(out[3][0] - out[0][0], out[3][1] - out[0][1]);
  assert.ok(Math.abs(w - (100 + 2 * d)) <= 1, `width ${w}`);
  assert.ok(Math.abs(h - (10 + 2 * d)) <= 1, `height ${h}`);
  // the corner order (clockwise or not) does not matter
  const back = miniBox(unclip([...box].reverse(), 1.6)).box;
  assert.deepEqual(back, out);
});

test("dilate2 and components: the 2 x 2 dilation and 8-connected blobs", () => {
  const w = 6, h = 4, m = new Uint8Array(w * h);
  m[1 * w + 1] = 1; m[2 * w + 4] = 1;
  const d = dilate2(m, w, h);
  // a pixel spreads right and down
  assert.deepEqual([d[1 * w + 1], d[1 * w + 2], d[2 * w + 1], d[2 * w + 2], d[0 * w + 1]], [1, 1, 1, 1, 0]);
  assert.equal(components(d, w, h).length, 2);
  const diag = new Uint8Array(9); diag[0] = 1; diag[4] = 1; diag[8] = 1;
  assert.equal(components(diag, 3, 3).length, 1);
});

test("boxesFromProb: one text line in a probability map becomes one box in the photo's pixels", () => {
  const w = 64, h = 32, prob = new Float32Array(w * h);
  for (let y = 12; y < 18; y++) for (let x = 8; x < 50; x++) prob[y * w + x] = 0.9;
  // a speck under 3 pixels and a faint block under the box score are dropped
  prob[2 * w + 2] = 0.9;
  for (let y = 24; y < 30; y++) for (let x = 8; x < 50; x++) prob[y * w + x] = 0.35;
  const boxes = boxesFromProb(prob, w, h, 128, 64);
  assert.equal(boxes.length, 1);
  const [tl, , br] = filterBoxes(boxes, 128, 64)[0];
  assert.ok(tl[0] < 16 && tl[1] < 24 && br[0] > 98 && br[1] > 34, JSON.stringify(boxes));
});

test("sortBoxes: top to bottom, left to right within 10 pixels", () => {
  const b = (x, y) => [[x, y], [x + 10, y], [x + 10, y + 5], [x, y + 5]];
  const s = sortBoxes([b(50, 22), b(5, 20), b(0, 60), b(30, 25)]);
  // (30, 25) moves ahead of (50, 22): within 10 pixels of height and further left (main.py's
  // pass compares neighbours only, so it is not a full left-to-right sort of a row)
  assert.deepEqual(s.map((q) => q[0]), [[5, 20], [30, 25], [50, 22], [0, 60]]);
});

test("cropBox straightens a box; tall crops turn a quarter left", () => {
  const img = grey(40, 40, (x, y) => (x >= 10 && x < 30 && y >= 5 && y < 10 ? 0 : 255));
  const c = cropBox(img, [[10, 5], [30, 5], [30, 10], [10, 10]]);
  assert.deepEqual([c.width, c.height], [20, 5]);
  assert.ok(c.data.every((v) => v < 40));
  const tall = cropBox(img, [[0, 0], [4, 0], [4, 20], [0, 20]]);
  assert.deepEqual([tall.width, tall.height], [20, 4]);
  const r = rot90({ width: 2, height: 1, data: new Uint8Array([1, 1, 1, 2, 2, 2]) });
  assert.deepEqual([r.width, r.height, r.data[0], r.data[3]], [1, 2, 2, 1]);
});

test("ctcDecode: repeats and blanks dropped, score the kept steps' mean", () => {
  const chars = charList("A\nB\n");
  assert.deepEqual(chars, ["blank", "A", "B", " "]);
  // steps: A A blank A B B space
  const best = [1, 1, 0, 1, 2, 2, 3], p = [0.9, 0.8, 0.99, 0.7, 0.6, 0.5, 0.95];
  const probs = new Float32Array(best.length * 4);
  best.forEach((k, t) => { probs[t * 4 + k] = p[t]; });
  const r = ctcDecode(probs, best.length, 4, chars);
  assert.equal(r.text, "AAB ");
  assert.ok(Math.abs(r.score - (0.9 + 0.7 + 0.6 + 0.95) / 4) < 1e-6);
  assert.deepEqual(ctcDecode(new Float32Array(8).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 2, 4, chars), { text: "", score: 0 });
});

test("rapidRows matches rapidocr_rows.py's selftest", () => {
  const box = (x, y, w = 40, h = 10) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const got = rapidRows([[box(200, 52), "96,000", 0.9], [box(10, 50), "Total", 0.9], [box(10, 30), "VAT 10%", 0.9], [box(200, 31), "8,728", 0.9]]);
  assert.equal(got, "VAT 10%  8,728\nTotal  96,000\n");
  assert.equal(rapidRows([]), "");
  assert.equal(rapidRows(null), "");
});

// a fake ONNX Runtime: the detector marks dark pixels, the classifier says upright, the
// recogniser spells "TOTAL 9.99" with confidence 0.9 whatever it is shown
function fakeOrt() {
  class Tensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
  const make = (name) => ({
    inputNames: ["x"], outputNames: ["y"],
    run: async ({ x }) => {
      const [n, , h, w] = x.dims;
      if (name === "det") {
        const out = new Float32Array(h * w);
        for (let i = 0; i < h * w; i++) out[i] = x.data[i] < 0 ? 0.95 : 0.01;
        return { y: new Tensor("float32", out, [1, 1, h, w]) };
      }
      if (name === "cls") return { y: new Tensor("float32", new Float32Array(n * 2).map((_, i) => (i % 2 ? 0.01 : 0.99)), [n, 2]) };
      const chars = charList("T\nO\nA\nL\n9\n.\n");
      const word = "TOTAL 9.99", steps = 2 * word.length + 1, classes = chars.length;
      const out = new Float32Array(n * steps * classes);
      for (let b = 0; b < n; b++) for (let t = 0; t < steps; t++) {
        const k = t % 2 ? chars.indexOf(word[(t - 1) / 2]) : 0;
        out[(b * steps + t) * classes + k] = 0.9;
      }
      return { y: new Tensor("float32", out, [n, steps, classes]) };
    },
    release: async () => {},
  });
  return { Tensor, InferenceSession: { create: async (m) => make(m) } };
}

test("createRapidOcr: the whole pipeline over a fake runtime returns boxes in the photo's pixels", async () => {
  // a white 300 x 200 photo with one dark bar of text
  const img = grey(300, 200, (x, y) => (x >= 60 && x < 240 && y >= 90 && y < 110 ? 20 : 250));
  const ocr = createRapidOcr({ ort: fakeOrt(), models: { det: "det", cls: "cls", rec: "rec" }, keys: "T\nO\nA\nL\n9\n.\n" });
  const res = await ocr.read(img);
  assert.equal(res.length, 1);
  const [box, text, score] = res[0];
  assert.equal(text, "TOTAL 9.99");
  assert.ok(Math.abs(score - 0.9) < 1e-6);
  const xs = box.map((p) => p[0]), ys = box.map((p) => p[1]);
  assert.ok(Math.min(...xs) < 60 && Math.max(...xs) > 240 && Math.min(...ys) < 90 && Math.max(...ys) > 110, JSON.stringify(box));
  assert.ok(Math.max(...xs) <= 300 && Math.max(...ys) <= 200);
  assert.equal(rapidRows(res), "TOTAL 9.99\n");
  // a blank photo has no text
  assert.deepEqual(await ocr.read(grey(100, 100, () => 255)), []);
  await ocr.close();
});

test("bgrFromRgba swaps red and blue and drops alpha", () => {
  assert.deepEqual([...bgrFromRgba(new Uint8Array([10, 20, 30, 255]), 1, 1).data], [30, 20, 10]);
});

test("the page fetches pinned versions from jsDelivr", () => {
  for (const u of Object.values(RAPID_URLS)) assert.match(u, /^https:\/\/cdn\.jsdelivr\.net\/npm\/(onnxruntime-web@1\.20\.1|@gutenye\/ocr-models@1\.4\.2)\//);
});

const photo = (name) => ({ name, type: "image/jpeg" });
const tesseract = (texts) => async () => ({ recognize: async () => texts.shift() ?? null, close: async () => {} });

test("readPhotos: RapidOCR's reading leads tesseract's and settles the total", async () => {
  // tesseract misreads the total on all four readings; RapidOCR reads it with the subtotal and tax that confirm it
  const r = await readPhotos([photo("a.jpg")], {
    passes: ["6", "4"],
    loadEngine: tesseract(["Cafe\nSubtotal 9.00\nTax 0.99\nTotal 6.99", "Cafe\nTotal 6.99"]),
    loadRapid: async () => ({ read: async () => "Cafe\nSubtotal  9.00\nTax  0.99\nTotal  9.99\n", close: async () => {} }),
  });
  assert.equal(r.rapid, 1);
  assert.equal(r.readings, 3);
  assert.match(r.text, /Total\s+9\.99/);
});

test("readPhotos: when RapidOCR cannot load, tesseract reads alone and says why", async () => {
  const r = await readPhotos([photo("a.jpg")], {
    passes: ["6"],
    loadEngine: tesseract(["Cafe\nTotal 6.99"]),
    loadRapid: async () => { throw new Error("offline"); },
  });
  assert.equal(r.rapid, 0);
  assert.equal(r.rapidError, "offline");
  assert.match(r.text, /Total 6\.99/);
  // rapid: false never tries it
  let tried = false;
  const s = await readPhotos([photo("b.jpg")], { rapid: false, passes: ["6"], loadEngine: tesseract(["Shop\nTotal 1.00"]), loadRapid: async () => { tried = true; } });
  assert.equal(tried, false);
  assert.equal(s.rapidError, null);
});
