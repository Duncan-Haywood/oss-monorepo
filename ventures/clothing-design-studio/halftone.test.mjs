import test from "node:test";
import assert from "node:assert/strict";
import { screenAngles, maxLpi, checkScreen, toneMap, halftone, halftoneSvg, halftoneBrief } from "./halftone.mjs";

function gray(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  return { data, width: w, height: h };
}

test("screen angles: process convention for four inks, even spacing otherwise, all distinct", () => {
  assert.deepEqual(screenAngles(4), [15, 75, 0, 45]);
  for (const n of [2, 3, 5]) assert.equal(new Set(screenAngles(n)).size, n);
  assert.deepEqual(screenAngles(0), []);
});

test("mesh and lpi: 230 mesh holds 51 lpi; 110 mesh at 55 lpi is refused", () => {
  assert.equal(maxLpi(230), 51);
  assert.ok(checkScreen({ lpi: 45, mesh: 230 }).ok);
  const bad = checkScreen({ lpi: 55, mesh: 110 });
  assert.equal(bad.ok, false);
  assert.match(bad.warnings[0], /finer mesh/);
});

test("tone: black on white is full ink, white is none, transparent is none", () => {
  const img = gray(2, 1, x => (x === 0 ? 0 : 255));
  img.data[7] = 0; // second pixel transparent
  const { tone } = toneMap(img, { ink: "#000000", garment: "#ffffff" });
  assert.equal(tone[0], 1); assert.equal(tone[1], 0);
});

test("a 50% flat grey gives dots covering about half the film", () => {
  const img = gray(200, 200, () => 128);
  const h = halftone(toneMap(img), { lpi: 20, angle: 0, widthMm: 100 });
  const areaDots = h.dots.reduce((s, d) => s + Math.PI * d.r * d.r, 0);
  const frac = areaDots / (h.widthMm * h.heightMm);
  assert.ok(Math.abs(frac - 0.5) < 0.06, `coverage ${frac}`);
  assert.ok(h.dots.every(d => d.r * 2 <= h.pitchMm));
});

test("a gradient makes bigger dots toward the dark side", () => {
  const img = gray(200, 100, x => 255 - Math.round(x * 255 / 199));
  const h = halftone(toneMap(img), { lpi: 15, angle: 0, widthMm: 100 });
  const left = h.dots.filter(d => d.x < 30), right = h.dots.filter(d => d.x > 70);
  const avg = a => a.reduce((s, d) => s + d.r, 0) / a.length;
  assert.ok(avg(right) > 2 * avg(left));
});

test("highlight cut-off drops tiny dots and says so; empty film is fine", () => {
  const img = gray(100, 100, () => 250); // ~2% tone
  const h = halftone(toneMap(img), { lpi: 20, widthMm: 50, minDotPct: 5 });
  assert.equal(h.dots.length, 0);
  assert.ok(h.dropped > 0);
  assert.ok(h.warnings.some(w => /highlight cut-off/.test(w)));
});

test("deterministic, SVG is sane, brief carries the warnings", () => {
  const img = gray(120, 80, (x, y) => (x + y) % 255);
  const a = halftone(toneMap(img), { lpi: 30, angle: 45, widthMm: 80, mesh: 110 });
  const b = halftone(toneMap(img), { lpi: 30, angle: 45, widthMm: 80, mesh: 110 });
  assert.deepEqual(a.dots, b.dots);
  const svg = halftoneSvg(a, { title: 'a "test" <film>' });
  assert.match(svg, /^<svg /); assert.ok(!svg.includes("<film>")); assert.ok(svg.includes("<circle"));
  assert.match(halftoneBrief(a, { name: "Red" }), /Check: mesh 110/);
});

test("rotated grid keeps every dot inside the film", () => {
  const img = gray(150, 100, () => 60);
  const h = halftone(toneMap(img), { lpi: 25, angle: 30, widthMm: 90 });
  assert.ok(h.dots.length > 50);
  assert.ok(h.dots.every(d => d.x >= 0 && d.x <= h.widthMm && d.y >= 0 && d.y <= h.heightMm));
});

test("singleInkFilm: darker regions get bigger dots, unprinted pixels none, width follows the separation", async () => {
  const { singleInkFilm } = await import("./halftone.mjs");
  const w = 40, h = 20, labels = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) labels[y * w + x] = x < 15 ? 0 : x < 30 ? 1 : 255;
  const sep = { width: w, height: h, widthCm: 10, heightCm: 5, garment: "#ffffff", labels, inks: [{ label: 0, hex: "#202020" }, { label: 1, hex: "#a0a0a0" }] };
  const f = singleInkFilm(sep, { lpi: 40, angle: 0, minDotPct: 1 });
  assert.equal(f.widthMm, 100);
  const left = f.dots.filter(d => d.x < 36), mid = f.dots.filter(d => d.x >= 40 && d.x < 72), right = f.dots.filter(d => d.x > 80);
  assert.ok(left.length && mid.length);
  const mean = a => a.reduce((s, d) => s + d.r, 0) / a.length;
  assert.ok(mean(left) > mean(mid) * 1.3, "dark region should carry bigger dots");
  assert.equal(right.length, 0, "unprinted region carries no dots");
});

test("singleInkFilm warns when ink and garment match; contrastInk flips on dark cloth", async () => {
  const { singleInkFilm, contrastInk } = await import("./halftone.mjs");
  const sep = { width: 4, height: 4, widthCm: 5, heightCm: 5, garment: "#1b1b1d", labels: new Uint8Array(16), inks: [{ label: 0, hex: "#c81e1e" }] };
  const f = singleInkFilm(sep, { ink: "#000000" });
  assert.equal(f.ok, false); assert.match(f.warnings[0], /too close/);
  assert.equal(contrastInk("#1b1b1d"), "#f2f2f2"); assert.equal(contrastInk("#f7f7f4"), "#111111");
});
