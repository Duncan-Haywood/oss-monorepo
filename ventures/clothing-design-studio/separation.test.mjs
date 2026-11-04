import test from "node:test";
import assert from "node:assert/strict";
import { separate, films, maskSvg, previewRgba, separationBrief, toLab } from "./separation.mjs";

/** A 60x40 "painting": cream surround, red disc, blue band, thin 1px gold line, soft noise. */
function painting({ noise = 0, surround = [245, 240, 225] } = {}) {
  const w = 60, h = 40, data = new Uint8ClampedArray(w * h * 4);
  let s = 1;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * noise;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = surround;
    if (x > 5 && x < 55 && y > 4 && y < 36) c = [30, 40, 120];
    if ((x - 20) ** 2 + (y - 20) ** 2 < 100) c = [200, 30, 30];
    if (x === 45 && y > 8 && y < 32) c = [212, 175, 55];
    const i = (y * w + x) * 4;
    data[i] = c[0] + r(); data[i + 1] = c[1] + r(); data[i + 2] = c[2] + r(); data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

test("finds the three inks, drops the plain surround, orders light to dark", () => {
  const sep = separate(painting(), { colours: 3, garment: "#ffffff", smooth: 0 });
  assert.equal(sep.inks.length, 3);
  assert.ok(sep.inkedPct < 100 && sep.inkedPct > 55, `surround should not be inked, got ${sep.inkedPct}`);
  const hexes = sep.inks.map(i => i.hex);
  assert.ok(hexes.some(h => parseInt(h.slice(1, 3), 16) > 150 && parseInt(h.slice(3, 5), 16) < 80), "a red ink");
  const l = sep.inks.map(i => i.luminance);
  assert.deepEqual(l, [...l].sort((a, b) => b - a));
  assert.deepEqual(sep.inks.map(i => i.order), [1, 2, 3]);
});

test("coverage sums to 100 and the run is repeatable", () => {
  const a = separate(painting({ noise: 20 }), { colours: 4 });
  const b = separate(painting({ noise: 20 }), { colours: 4 });
  assert.deepEqual(a.inks.map(i => i.hex), b.inks.map(i => i.hex));
  const total = a.inks.reduce((s, i) => s + i.coveragePct, 0);
  assert.ok(Math.abs(total - 100) < 0.6, total);
});

test("a dark garment adds a white underbase screen; a white one does not", () => {
  const dark = separate(painting(), { colours: 3, garment: "#111111" });
  const white = separate(painting(), { colours: 3, garment: "#ffffff" });
  assert.equal(dark.underbase, true);
  assert.equal(dark.screens, dark.inks.length + 1);
  assert.equal(white.underbase, false);
  assert.equal(white.screens, white.inks.length);
  assert.equal(films(dark)[0].name, "00-underbase-white");
});

test("warns when a line is thinner than the mesh holds at the chosen width", () => {
  const narrow = separate(painting(), { colours: 3, widthCm: 6, smooth: 0, background: "auto" });
  const wide = separate(painting(), { colours: 3, widthCm: 60, smooth: 0 });
  const thin = s => Math.max(...s.inks.map(i => i.thinSharePct));
  assert.ok(thin(narrow) >= thin(wide));
  assert.ok(wide.inks.some(i => i.thinSharePct === 0) || thin(wide) < 100);
});

test("raised outline sits on colour boundaries only and widens with the line width", () => {
  const thin = separate(painting(), { colours: 3, widthCm: 5, raisedLineMm: 0.5, smooth: 0 });
  const thick = separate(painting(), { colours: 3, widthCm: 5, raisedLineMm: 2.5, smooth: 0 });
  assert.ok(thin.raised.coveragePct > 0 && thin.raised.coveragePct < 40);
  assert.ok(thick.raised.coveragePct > thin.raised.coveragePct);
  // an interior pixel of the blue band, far from any boundary, is not outlined
  assert.equal(thin.raised.mask[30 * thin.width + 50], 0);
});

test("transparent pixels are never inked; an all-background image is refused", () => {
  const img = painting();
  for (let i = 0; i < 60 * 10; i++) img.data[i * 4 + 3] = 0;
  const sep = separate(img, { colours: 3, background: "none" });
  assert.equal(sep.labels[5], 255);
  const blank = { data: new Uint8ClampedArray(20 * 20 * 4).fill(255), width: 20, height: 20 };
  assert.throws(() => separate(blank, { colours: 3 }), /too little artwork/);
  assert.throws(() => separate({ data: new Uint8ClampedArray(3), width: 4, height: 4 }), /RGBA/);
});

test("large images are shrunk and the size in cm keeps the aspect ratio", () => {
  const w = 900, h = 450, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const left = (i % w) < w / 2; data[i * 4] = left ? 20 : 220; data[i * 4 + 1] = left ? 20 : 40; data[i * 4 + 2] = left ? 90 : 40; data[i * 4 + 3] = 255; }
  const sep = separate({ data, width: w, height: h }, { colours: 2, widthCm: 30, background: "none" });
  assert.ok(sep.width <= 320 && sep.height <= 320);
  assert.equal(sep.heightCm, 15);
});

test("films are 1:1 SVGs in cm, one per ink plus the outline, and the preview/brief render", () => {
  const sep = separate(painting(), { colours: 3, widthCm: 20, garment: "#222222" });
  const fs = films(sep);
  assert.equal(fs.length, sep.inks.length + 2);
  for (const f of fs) { assert.match(f.svg, /^<svg [^>]*width="20cm"/); assert.match(f.svg, /viewBox="0 0 60 40"/); }
  assert.equal(previewRgba(sep).length, 60 * 40 * 4);
  const brief = separationBrief(sep);
  assert.match(brief, /screens/); assert.match(brief, /Raised outline layer/); assert.match(brief, /Screen 0: white underbase/);
  assert.ok(!maskSvg(sep, sep.raised.mask, { title: "<x>" }).includes("<x>"));
});

test("Lab conversion: white is L 100, black is L 0", () => {
  assert.ok(Math.abs(toLab(255, 255, 255)[0] - 100) < 0.1);
  assert.ok(Math.abs(toLab(0, 0, 0)[0]) < 0.1);
});
