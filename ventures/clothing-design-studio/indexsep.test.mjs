import test from "node:test";
import assert from "node:assert/strict";
import { separate } from "./separation.mjs";
import { indexSeparate, gridSize, sigmaAt, perceivedDeltaE, flatOnGrid, compareFlatIndex, indexFilms, indexPreviewRgba, indexBrief, MAX_GRID, printLinear, gainFromPatch, calibrationFilms } from "./indexsep.mjs";

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

test("dot gain: the spread model darkens a bare cell by gain/4 per inked neighbour, and no gain changes nothing", () => {
  // 3 x 3: black dot in the middle on white, palette [black, white garment]
  const labels = new Uint8Array([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  const flat = printLinear(labels, ["#000000", "#ffffff"], "#ffffff", { w: 3, garmentIndex: 1 });
  const spread = printLinear(labels, ["#000000", "#ffffff"], "#ffffff", { w: 3, dotGainPct: 20, garmentIndex: 1 });
  assert.equal(flat[3], 1); // left of the dot, no gain
  assert.ok(Math.abs(spread[3] - 0.95) < 1e-6, `edge neighbour takes 5% black, got ${spread[3]}`);
  assert.equal(spread[0], 1); // corner: not a 4-neighbour
  assert.equal(spread[12], 0); // the dot itself
  const total = [...Array(9).keys()].reduce((s, i) => s + (1 - spread[i * 3]), 0);
  assert.ok(Math.abs(total - 1.2) < 1e-6, `an isolated dot covers 1.2 cells at 20% gain, got ${total}`);
});

test("compensated dots keep a grey ramp under 20% gain; plain dots go dark", () => {
  const ramp = img(200, 60, x => { const v = Math.round(255 * x / 199); return [v, v, v]; });
  const plain = indexSeparate(ramp, oneInk(200, 60)), comp = indexSeparate(ramp, oneInk(200, 60), { dotGainPct: 20 });
  const p = perceivedDeltaE(plain, plain.labels, 4, 20), c = perceivedDeltaE(comp, comp.labels, 4, 20);
  assert.ok(p > 2.5, `uncompensated print darkens, got ${p}`);
  assert.ok(c < 1.2, `compensated print matches once blurred, got ${c}`);
  assert.equal(comp.dotGainPct, 20);
  assert.ok(comp.inks[0].coveragePct < plain.inks[0].coveragePct, "fewer dots when they spread");
  assert.match(indexBrief(comp), /compensated for 20% dot gain/);
  // gain 0 is the old behaviour, cell for cell
  assert.deepEqual(indexSeparate(ramp, oneInk(200, 60), { dotGainPct: 0 }).labels, plain.labels);
});

test("gainFromPatch recovers the gain from a checkerboard printed through the spread model", () => {
  for (const g of [0, 15, 35]) {
    const w = 20, labels = new Uint8Array(w * w).map((_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 1 : 0);
    const px = printLinear(labels, ["#1d3a8a", "#f4efe6"], "#f4efe6", { w, dotGainPct: g, garmentIndex: 1 });
    let m = [0, 0, 0], n = 0; // interior only: the strip's edge cells touch fewer dots
    for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++, n++) for (let k = 0; k < 3; k++) m[k] += px[(y * w + x) * 3 + k];
    m = m.map(v => v / n);
    const hex = "#" + m.map(v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)).toString(16).padStart(2, "0")).join("");
    const r = gainFromPatch({ garment: "#f4efe6", solid: "#1d3a8a", patch: hex });
    assert.ok(Math.abs(r.dotGainPct - g) < 2, `gain ${g}: read ${r.dotGainPct}`);
  }
  const loss = gainFromPatch({ garment: "#ffffff", solid: "#000000", patch: "#d0d0d0" });
  assert.equal(loss.dotGainPct, 0);
  assert.match(loss.warnings.join(" "), /dot loss/);
  assert.throws(() => gainFromPatch({ garment: "#ffffff", solid: "#fefefe", patch: "#ffffff" }), /too close/);
  assert.throws(() => gainFromPatch({ garment: "white", solid: "#000000", patch: "#777777" }), /#rrggbb/);
});

test("calibration films: solid, checkerboard and bare squares at the index dot size, underbase first", () => {
  const idx = indexSeparate(img(40, 20, () => [120, 120, 120]), { ...oneInk(40, 20, "#1b1b1d"), underbase: true, screens: 2 });
  const f = calibrationFilms(idx);
  assert.deepEqual(f.map(x => x.name), ["00-calibration-underbase-white", "01-calibration-000000"]);
  assert.match(f[1].svg, /width="3cm" height="1cm"/);
  assert.match(f[1].svg, /50% checkerboard of 1 mm dots/);
});

test("dot gain, wet on wet: a later ink spreads over an earlier one, never the reverse", () => {
  // one row: ink 0 (printed first, yellow) next to ink 1 (printed second, blue)
  const labels = new Uint8Array([0, 1]);
  const px = printLinear(labels, ["#ffff00", "#0000ff", "#ffffff"], "#ffffff", { w: 2, dotGainPct: 40, garmentIndex: 2, ranks: [1, 2, 0] });
  assert.ok(Math.abs(px[0] - 0.9) < 1e-6 && Math.abs(px[2] - 0.1) < 1e-6, `yellow cell takes 10% blue, got ${[...px.slice(0, 3)]}`);
  assert.deepEqual([...px.slice(3)], [0, 0, 1], "the later blue is untouched");
});
