import test from "node:test";
import assert from "node:assert/strict";
import { separate } from "./separation.mjs";
import { indexSeparate, compareFlatIndex, indexBrief, perceivedDeltaE, sigmaAt } from "./indexsep.mjs";
import { mixWeights, hullProject, grainWeight, mixCost, sampleColours, fitIndexInks, chooseIndexInks } from "./inkfit.mjs";

function img(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; }
  return { data, width: w, height: h };
}
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) < tol);
const tri = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];

test("projection onto the inks' hull: a point inside is itself, a point outside lands on the nearest face", () => {
  assert.ok(near(hullProject([0.2, 0.3, 0], tri, new Float64Array(3).fill(1 / 3)), [0.2, 0.3, 0], 1e-3));
  assert.ok(near(hullProject([0.2, 0.3, 0.5], tri, new Float64Array(3).fill(1 / 3)), [0.2, 0.3, 0], 1e-3), "off the plane: dropped onto it");
  assert.ok(near(hullProject([1, 1, 0], tri, new Float64Array(3).fill(1 / 3)), [0.5, 0.5, 0], 1e-3), "past the long edge: its midpoint");
  const w = new Float64Array(3).fill(1 / 3);
  hullProject([0.2, 0.3, 0], tri, w);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9 && w.every(v => v >= 0), "weights stay on the simplex");
});

test("the grain term pulls the mix towards fewer, nearer dots", () => {
  // x is the midpoint of black and white and also exactly a grey ink: no grain weight, any mix will do;
  // with grain, the single grey ink wins (no spread)
  const pts = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5]];
  const w = new Float64Array(3).fill(1 / 3);
  mixWeights([0.5, 0.5, 0.5], pts, w, 0.5, 200);
  assert.ok(w[2] > 0.95, `grey ink weight ${w[2]}`);
});

test("grain weight: falls with the eye's blur, capped below 1", () => {
  assert.ok(grainWeight(0.5) > grainWeight(1) && grainWeight(1) > grainWeight(3));
  assert.ok(grainWeight(0.01) <= 0.95);
  assert.ok(Math.abs(grainWeight(1, 1) - 1 / (4 * Math.PI)) < 1e-12);
});

test("fitting moves inks out to reach colours the flat inks cannot mix", () => {
  // samples spread from dark blue to bright red; the starting inks are muddy averages inside that range
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const samples = [];
  for (let t = 0; t <= 1; t += 0.05) samples.push([lin(20 + 220 * t), lin(20), lin(160 - 140 * t)]);
  const fit = fitIndexInks(samples, ["#704060", "#6a3a70"], "#ffffff");
  assert.ok(fit.cost < fit.startCost * 0.5, `cost ${fit.startCost} -> ${fit.cost}`);
  assert.equal(fit.inks.length, 2);
  for (const h of fit.inks) assert.match(h, /^#[0-9a-f]{6}$/);
  // and the cost function agrees with what it reports
  const lins = fit.inks.map(h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16))));
  assert.ok(Math.abs(mixCost(samples, lins, [1, 1, 1]) - fit.cost) < 0.05);
});

test("samples skip background cells and are repeatable", () => {
  const src = new Float32Array(30).map((_, i) => i / 30);
  const a = sampleColours(src, 10, i => i < 4, 3, 1), b = sampleColours(src, 10, i => i < 4, 3, 1);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  for (const s of a) assert.ok(s[0] >= 12 / 30);
  assert.equal(sampleColours(src, 10, () => true).length, 0);
});

/** A shaded card: a dark-to-bright blue ramp across, a red ramp down, cream surround. */
function card() {
  return img(140, 90, (x, y) => {
    if (x < 8 || x > 131 || y < 6 || y > 83) return [245, 240, 225];
    const t = (x - 8) / 123, u = (y - 6) / 77;
    return [Math.round(20 + 220 * u), Math.round(15 + 30 * t), Math.round(40 + 200 * t * (1 - u))];
  });
}

test("inks given to the index separation are used for the dots; the flat column still uses the flat inks", () => {
  const im = card();
  const base = separate(im, { colours: 3, garment: "#ffffff", widthCm: 14, minFeatureMm: 1 });
  const plain = indexSeparate(im, base);
  const moved = base.inks.map(() => "#102030");
  const idx = indexSeparate(im, base, { inks: moved });
  assert.deepEqual(idx.palette.slice(0, -1), moved);
  assert.equal(idx.inksRefit, true);
  assert.equal(idx.inks[0].flatHex, base.inks[0].hex);
  assert.deepEqual(compareFlatIndex(base, idx, [1]).map(c => c.flat), compareFlatIndex(base, plain, [1]).map(c => c.flat));
  assert.match(indexBrief(idx), /chosen for the dots; the flat separation had/);
  // a malformed override is ignored, not printed
  assert.deepEqual(indexSeparate(im, base, { inks: ["red", "#zzzzzz"] }).palette.slice(0, -1), base.inks.map(i => i.hex));
});

test("chosen inks are never further from the painting than the flat inks at the distance chosen for", () => {
  const im = card();
  const base = separate(im, { colours: 3, garment: "#ffffff", widthCm: 14, minFeatureMm: 1 });
  for (const metres of [1, 3]) {
    const pick = chooseIndexInks(im, base, { metres });
    assert.equal(pick.candidates[0].label, "flat inks");
    const flat = pick.candidates[0].deltaE;
    const got = perceivedDeltaE(pick.idx, pick.idx.labels, sigmaAt(metres));
    assert.ok(got <= flat + 1e-9, `${metres} m: ${got} vs flat inks ${flat}`);
    assert.equal(pick.refit, pick.inks.join() !== base.inks.map(i => i.hex).join());
    if (metres === 3) assert.ok(pick.refit && got < flat - 0.5, `3 m: refit should help a wide ramp (${flat} -> ${got})`);
  }
  // repeatable
  assert.deepEqual(chooseIndexInks(im, base, { metres: 3 }).inks, chooseIndexInks(im, base, { metres: 3 }).inks);
});
