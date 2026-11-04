import test from "node:test";
import assert from "node:assert/strict";
import { halftone, halftoneSvg, halftoneBrief, screenAngles, minAngleGap } from "./halftone.mjs";

function flat(g, w = 40, h = 40, a = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = g; data[i * 4 + 3] = a; }
  return { data, width: w, height: h };
}
function ramp(w = 64, h = 16) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, g = 255 - Math.round(255 * x / (w - 1)); data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255; }
  return { data, width: w, height: h };
}

test("ink share of a flat tone equals the tone, across the range", () => {
  for (const dark of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const ht = halftone(flat(Math.round(255 * (1 - dark))), { widthCm: 10, lpi: 45, dpi: 600 });
    assert.ok(Math.abs(ht.coveragePct - dark * 100) < 3, `tone ${dark}: got ${ht.coveragePct}`);
  }
});

test("white prints nothing, black prints solid, transparent is ignored", () => {
  assert.equal(halftone(flat(255), { widthCm: 5 }).coveragePct, 0);
  assert.equal(halftone(flat(0), { widthCm: 5 }).coveragePct, 100);
  const half = flat(0, 40, 40); for (let i = 0; i < 800; i++) half.data[i * 4 + 3] = 0;
  assert.equal(halftone(half, { widthCm: 5 }).coveragePct, 100);
  assert.throws(() => halftone(flat(0, 8, 8, 0)), /empty|transparent/);
});

test("a ramp gets more ink to the dark side and the run is repeatable", () => {
  const a = halftone(ramp(), { widthCm: 12, lpi: 40 }), b = halftone(ramp(), { widthCm: 12, lpi: 40 });
  assert.deepEqual(a.mask, b.mask);
  const share = (x0, x1) => { let n = 0, t = 0; for (let y = 0; y < a.height; y++) for (let x = Math.floor(x0 * a.width); x < Math.floor(x1 * a.width); x++) { t++; n += a.mask[y * a.width + x]; } return n / t; };
  assert.ok(share(0, 0.25) < share(0.4, 0.6) && share(0.4, 0.6) < share(0.75, 1));
});

test("light mode inks the light pixels; the angle changes the pattern, not the coverage", () => {
  assert.equal(halftone(flat(255), { widthCm: 5, tone: "light" }).coveragePct, 100);
  const a = halftone(flat(128), { widthCm: 10, angle: 45 }), b = halftone(flat(128), { widthCm: 10, angle: 15 });
  assert.notDeepEqual(a.mask, b.mask);
  assert.ok(Math.abs(a.coveragePct - b.coveragePct) < 2);
});

test("highlights below the minimum dot drop out and are reported", () => {
  const ht = halftone(flat(245), { widthCm: 10, minDotPct: 8 });
  assert.equal(ht.coveragePct, 0);
  assert.ok(ht.droppedPct > 90);
  assert.ok(ht.notes.some(n => /drops out/.test(n)));
});

test("mesh advice: coarse mesh and fine lpi are flagged, a sensible pair is not", () => {
  assert.ok(halftone(flat(128), { widthCm: 8, lpi: 55, mesh: 110 }).notes.some(n => /coarse/.test(n)));
  const ok = halftone(flat(128), { widthCm: 8, lpi: 45, mesh: 200, minDotPct: 20 });
  assert.ok(!ok.notes.some(n => /coarse|may not hold/.test(n)), ok.notes.join("|"));
  assert.ok(halftone(flat(128), { widthCm: 8, lpi: 45, mesh: 200, minDotPct: 3 }).notes.some(n => /may not hold/.test(n)));
  assert.deepEqual(ok.recommendedMesh, [180, 225]);
});

test("bad input is refused; film resolution is capped for big prints", () => {
  assert.throws(() => halftone({}), /RGBA/);
  assert.throws(() => halftone(flat(0), { tone: "mid" }), /tone/);
  const big = halftone(flat(128), { widthCm: 10, dpi: 1200, maxPixels: 1000000 });
  assert.ok(big.width * big.height <= 1000000 * 1.02);
});

test("screen angles keep at least 15 degrees between inks", () => {
  for (let n = 2; n <= 4; n++) assert.ok(minAngleGap(screenAngles(n)) >= 15, `n=${n}`);
  assert.throws(() => screenAngles(0));
});

test("SVG film is sized in cm and escapes the title; brief carries the numbers", () => {
  const ht = halftone(flat(128), { widthCm: 6 });
  const svg = halftoneSvg(ht, { title: 'a<b>"' });
  assert.match(svg, /width="6cm"/);
  assert.ok(!svg.includes("<b>"));
  assert.match(halftoneBrief(ht), /lines per inch/);
});
