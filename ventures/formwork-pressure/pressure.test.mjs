import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designPressure, unitWeightCoefficient, resultant, tieLayout, rateFromDelivery, maxRate, fromSI, toSI, envelope } from './pressure.mjs';

const close = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Hand calculations from the ACI 347R equations, worked here so the tests do
// not lean on the code's own output.

test('wall, 5 ft/h at 70 °F, normal-weight Type I: 150 + 9000·5/70 = 792.9 psf', () => {
  const r = designPressure({ element: 'wall', height: 10, rate: 5, temp: 70 });
  assert.equal(r.equation, 'wallLow');
  assert.equal(r.governs, 'formula');
  close(r.pressure, 150 + 45000 / 70, 0.01); // 792.86
  close(r.headDepth, 792.857 / 150, 0.001);  // 5.29 ft
});

test('wall above 14 ft uses the second wall equation even below 7 ft/h', () => {
  const r = designPressure({ element: 'wall', height: 16, rate: 4, temp: 60 });
  assert.equal(r.equation, 'wallHigh');
  close(r.pressure, 150 + 43400 / 60 + 2800 * 4 / 60, 0.01); // 1060.0
});

test('wall at 10 ft/h, 50 °F: 150 + 868 + 560 = 1578 psf', () => {
  const r = designPressure({ element: 'wall', height: 16, rate: 10, temp: 50 });
  assert.equal(r.equation, 'wallHigh');
  close(r.pressure, 1578, 0.01);
});

test('wall equations meet at 7 ft/h', () => {
  const lo = designPressure({ element: 'wall', height: 12, rate: 6.9999, temp: 65 }).pressure;
  const hi = designPressure({ element: 'wall', height: 12, rate: 7, temp: 65 }).pressure;
  close(lo, hi, 0.05);
});

test('wall faster than 15 ft/h is full liquid head', () => {
  const r = designPressure({ element: 'wall', height: 12, rate: 16, temp: 70 });
  assert.equal(r.equation, 'hydrostatic');
  assert.equal(r.pressure, 1800);
});

test('column, 10 ft/h at 60 °F, 12 ft: 150 + 1500 = 1650 psf, under w·h = 1800', () => {
  const r = designPressure({ element: 'column', height: 12, rate: 10, temp: 60 });
  assert.equal(r.equation, 'column');
  close(r.pressure, 1650, 0.01);
});

test('column formula above w·h is capped at the liquid head', () => {
  const r = designPressure({ element: 'column', height: 8, rate: 20, temp: 50 });
  assert.equal(r.governs, 'hydrostatic');
  assert.equal(r.pressure, 1200);
  assert.equal(r.headDepth, 8);
});

test('slow warm pour is held at the 600·Cw minimum', () => {
  const r = designPressure({ element: 'wall', height: 10, rate: 1, temp: 90 });
  // 150 + 100 = 250 < 600
  assert.equal(r.governs, 'minimum');
  assert.equal(r.pressure, 600);
});

test('a short lift whose liquid head is under the minimum takes the liquid head', () => {
  const r = designPressure({ element: 'wall', height: 3, rate: 1, temp: 90 });
  assert.equal(r.pressure, 450);
  assert.equal(r.governs, 'hydrostatic');
});

test('retarder raises Cc to 1.2, high-slag or high-fly-ash blend to 1.4', () => {
  close(designPressure({ element: 'wall', height: 10, rate: 5, temp: 70, chemistry: 'plainRetarded' }).pressure, 1.2 * 792.857, 0.01);
  close(designPressure({ element: 'wall', height: 10, rate: 5, temp: 70, chemistry: 'highScm' }).pressure, 1.4 * 792.857, 0.01);
});

test('Cw: 0.5(1 + w/145), floor 0.80, 1.0 from 140 to 150, w/145 above', () => {
  close(unitWeightCoefficient(130), 0.5 * (1 + 130 / 145), 1e-9);
  assert.equal(unitWeightCoefficient(80), 0.8);
  assert.equal(unitWeightCoefficient(140), 1);
  assert.equal(unitWeightCoefficient(150), 1);
  close(unitWeightCoefficient(160), 160 / 145, 1e-9);
  assert.throws(() => unitWeightCoefficient(0));
});

test('outside the conditions (SCC, slump over 7 in, pumped from below) is full liquid head', () => {
  const r = designPressure({ element: 'wall', height: 10, rate: 2, temp: 70, conditionsMet: false });
  assert.equal(r.pressure, 1500);
  assert.equal(r.equation, 'hydrostatic');
});

test('plan dimensions classify column vs wall at 6.5 ft', () => {
  assert.equal(designPressure({ planMax: 6.5, planMin: 2, height: 10, rate: 3, temp: 70 }).element, 'column');
  assert.equal(designPressure({ planMax: 6.6, planMin: 1, height: 10, rate: 3, temp: 70 }).element, 'wall');
  assert.throws(() => designPressure({ height: 10, rate: 3, temp: 70 }), /wall or a column/);
});

test('bad inputs are refused, not computed', () => {
  assert.throws(() => designPressure({ element: 'wall', height: 0, rate: 3, temp: 70 }));
  assert.throws(() => designPressure({ element: 'wall', height: 10, rate: 'x', temp: 70 }));
  assert.throws(() => designPressure({ element: 'wall', height: 10, rate: 3, temp: -5 }));
  assert.throws(() => designPressure({ element: 'wall', height: 10, rate: 3, temp: 70, chemistry: 'nope' }));
});

test('resultant: triangle to 5.286 ft then rectangle, by hand', () => {
  const p = 792.857, w = 150, h = 10, hc = p / w;
  const tri = 0.5 * w * hc * hc;            // 2095.4
  const rect = p * (h - hc);                // 3737.1
  const { forcePerFoot, resultantAboveBase } = resultant(p, w, h);
  close(forcePerFoot, tri + rect, 0.01);    // 5832.5 lb per ft of wall
  const fromTop = (tri * 2 * hc / 3 + rect * (hc + (h - hc) / 2)) / (tri + rect);
  close(resultantAboveBase, h - fromTop, 1e-6);
  // full liquid head: w h^2 / 2 at h/3
  const f = resultant(1500, 150, 10);
  close(f.forcePerFoot, 7500, 1e-9);
  close(f.resultantAboveBase, 10 / 3, 1e-9);
});

test('envelope is linear to the head depth, then flat', () => {
  const r = designPressure({ element: 'wall', height: 10, rate: 5, temp: 70 });
  const e = envelope(r, 10);
  assert.equal(e[0].pressure, 0);
  close(e[2].pressure, 300, 1e-9);
  close(e[10].pressure, r.pressure, 1e-9);
});

test('tie layout: 3000 lb ties at 793 psf carry 3.78 ft² each; at 2 ft across, 1.89 ft up', () => {
  const t = tieLayout(792.857, 3000, 2);
  close(t.areaPerTie, 3000 / 792.857, 1e-6);
  close(t.maxVerticalSpacing, 3000 / 792.857 / 2, 1e-6);
  assert.throws(() => tieLayout(0, 3000));
});

test('rate from delivery: 30 yd³/h into a 100 ft × 1 ft wall rises 8.1 ft/h', () => {
  close(rateFromDelivery(30, 100), 8.1, 1e-9);
});

test('max rate for a 1000 psf form, 12 ft wall at 70 °F', () => {
  // low equation: R = (1000-150)·70/9000 = 6.611 < 7
  const m = maxRate({ element: 'wall', height: 12, temp: 70 }, 1000);
  close(m.rate, 850 * 70 / 9000, 1e-9);
  const check = designPressure({ element: 'wall', height: 12, rate: m.rate, temp: 70 });
  close(check.pressure, 1000, 1e-6);
});

test('max rate past 7 ft/h uses the faster-rate wall equation', () => {
  const m = maxRate({ element: 'wall', height: 12, temp: 70 }, 1300);
  const expected = (1150 - 43400 / 70) * 70 / 2800;
  close(m.rate, expected, 1e-9);
  assert.ok(m.rate > 7 && m.rate < 15);
  close(designPressure({ element: 'wall', height: 12, rate: m.rate, temp: 70 }).pressure, 1300, 1e-6);
});

test('max rate when the form holds the full liquid head is unlimited', () => {
  assert.equal(maxRate({ element: 'wall', height: 6, temp: 70 }, 1000).rate, Infinity);
  assert.equal(maxRate({ element: 'wall', height: 12, temp: 70, conditionsMet: false }, 1000).rate, 0);
  assert.equal(maxRate({ element: 'wall', height: 12, temp: 70 }, 500).rate, 0);
});

test('SI round trip: 3 m wall, 1.5 m/h, 21 °C, 2400 kg/m³', () => {
  const r = toSI(designPressure({ element: 'wall', ...fromSI({ height: 3, rate: 1.5, temp: 21, unitWeight: 2400 }) }));
  // ACI 347R SI form: 7.2 + 785R/(T + 17.8) kPa = 7.2 + 785·1.5/38.8 = 37.55 kPa (soft conversion; within 1%)
  assert.ok(Math.abs(r.pressure - 37.55) / 37.55 < 0.01, String(r.pressure));
  close(r.height, 3, 1e-9);
  close(r.temp, 21, 1e-9);
});

test('exactly 7 ft/h is in the "7 to 15 ft/h" wall band', () => {
  assert.equal(designPressure({ element: 'wall', height: 10, rate: 7, temp: 70 }).equation, 'wallHigh');
  assert.equal(designPressure({ element: 'wall', height: 14, rate: 6.9, temp: 70 }).equation, 'wallLow');
  assert.equal(designPressure({ element: 'wall', height: 14.01, rate: 6.9, temp: 70 }).equation, 'wallHigh');
  assert.equal(designPressure({ element: 'wall', height: 10, rate: 15, temp: 70 }).equation, 'wallHigh');
});
