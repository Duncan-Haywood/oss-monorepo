import test from "node:test";
import assert from "node:assert/strict";
import { separate } from "./separation.mjs";
import { indexSeparate, gridSize, sigmaAt, perceivedDeltaE, flatOnGrid, compareFlatIndex, indexFilms, indexPreviewRgba, indexBrief, MAX_GRID } from "./indexsep.mjs";

const NONE = 255;
/** w x h RGBA from f(x, y) -> [r, g, b]. */
function img(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return { data, width: w, height: h };
}
/** A hand-made "flat separation": one black ink, everything inked, on a white garment. */
const oneInk = (w, h, garment = "#ffffff") => ({ inks: [{ hex: "#000000", order: 1, label: 0 }], labels: new Uint8Array(w * h), width: w, height: h, widthCm: w / 10, garment, minFeatureMm: 1, underbase: false, screens: 1 });

test("grid: one cell per finest dot, never finer than the source, capped on the long side", () => {
  assert.deepEqual(gridSize(640, 400, 28, 0.3), { w: 640, h: 400 }); // 933 cells wanted, the source has 640
  assert.deepEqual(gridSize(4000, 2000, 28, 0.5), { w: 560, h: 280 });
  const big = gridSize(9000, 9000, 60, 0.05);
  assert.equal(Math.max(big.w, big.h), MAX_GRID);
});

test("1 arcminute of blur: 0.291 mm at 1 m, 0.873 mm at 3 m", () => {
  assert.equal(sigmaAt(1), 0.291);
  assert.equal(sigmaAt(3), 0.873);
});

test("a grey ramp dithered with black on white looks like the ramp once blurred; flat black does not", () => {
  const ramp = img(200, 60, x => { const v = Math.round(255 * x / 199); return [v, v, v]; });
  const base = oneInk(200, 60);
  const idx = indexSeparate(ramp, base);
  assert.equal(idx.dotMm, 1);
  const sharp = perceivedDeltaE(idx, idx.labels, 0), soft = perceivedDeltaE(idx, idx.labels, 4);
  assert.ok(sharp > 20, `dots are visible up close, got ${sharp}`);
  assert.ok(soft < 2, `blurred, the dither should match the ramp, got ${soft}`);
  assert.ok(perceivedDeltaE(idx, flatOnGrid(base, idx.width, idx.height), 4) > 40, "a solid black print is far from a ramp");
});

test("mid grey in linear light comes out about half black dots, half bare garment", () => {
  const v = 188; // sRGB 188 is linear 0.50
  const idx = indexSeparate(img(120, 120, () => [v, v, v]), oneInk(120, 120));
  assert.ok(Math.abs(idx.inks[0].coveragePct - 50) < 5, `${idx.inks[0].coveragePct}%`);
  assert.ok(Math.abs(idx.garmentPct - 50) < 5);
});

test("cells the flat separation left unprinted stay unprinted", () => {
  const w = 80, h = 40, base = oneInk(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < 20; x++) base.labels[y * w + x] = NONE;
  const idx = indexSeparate(img(w, h, () => [100, 100, 100]), base);
  for (let y = 0; y < h; y++) for (let x = 0; x < 20; x++) assert.equal(idx.labels[y * w + x], NONE);
  assert.ok(idx.labels.some(l => l === 0));
});

/** The separation test's painting: cream surround, blue band, red disc with a soft edge, gold line. */
function painting() {
  return img(120, 80, (x, y) => {
    let c = [245, 240, 225];
    if (x > 10 && x < 110 && y > 8 && y < 72) c = [30 + x, 40, 120 + y];
    const d = Math.hypot(x - 40, y - 40);
    if (d < 20) { const t = Math.min(1, (20 - d) / 8); c = c.map((v, k) => Math.round(v * (1 - t) + [200, 30, 30][k] * t)); }
    if (x === 90 && y > 16 && y < 64) c = [212, 175, 55];
    return c;
  });
}

test("on a shaded painting the index print sits closer than flat inks at arm's length, and repeats exactly", () => {
  const p = painting(), base = separate(p, { colours: 3, widthCm: 3.6 });
  const a = indexSeparate(p, base), b = indexSeparate(p, base);
  assert.deepEqual(a.labels, b.labels);
  const [, oneMetre] = compareFlatIndex(base, a, [0.5, 1]);
  assert.ok(oneMetre.index < oneMetre.flat, JSON.stringify(oneMetre));
  const total = a.inks.reduce((s, i) => s + i.coveragePct, 0) + a.garmentPct;
  assert.ok(Math.abs(total - 100) < 0.5, total);
});

test("films: white underbase first on a dark garment, one per ink, sized in cm; brief and preview", () => {
  const p = painting(), base = separate(p, { colours: 3, widthCm: 3.6, garment: "#111111" });
  const idx = indexSeparate(p, base);
  const f = indexFilms(idx);
  assert.equal(base.underbase, true);
  assert.equal(f[0].name, "00-underbase-white");
  assert.equal(f.length, idx.inks.length + 1);
  assert.match(f[1].svg, new RegExp(`width="${idx.widthCm}cm" height="${idx.heightCm}cm"`));
  assert.equal(indexPreviewRgba(idx).length, idx.width * idx.height * 4);
  const brief = indexBrief(idx, compareFlatIndex(base, idx, [1]));
  assert.match(brief, /Index separation: 3 inks \+ white underbase = 4 screens/);
  assert.match(brief, /Seen from 1 m: flat inks [\d.]+ delta E from the painting, index [\d.]+/);
});

test("refuses without a flat separation", () => {
  assert.throws(() => indexSeparate(painting(), null), /run the flat separation first/);
});
