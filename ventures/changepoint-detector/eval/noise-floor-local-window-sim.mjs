// Local-fit noise floor (window, degree) on synthetic drift with one known step and AR(1) noise at phi 0.2, 0.5, 0.8 (2026-11-10).
// Same design as noise-floor-ar1-joint-sim.mjs: y_t = 0.2 t + noise * AR(1) (unit sd) + step * (t >= 60), step 4 noise sd,
// n=120, 60 seeded series per cell, model trend. A wide line window brings real Australian residents down to one cut
// (noise-floor-local-window-real.mjs); this asks what it costs where the truth is known, especially at high phi.
// usage: node eval/noise-floor-local-window-sim.mjs   (seeded, deterministic)
import { analyze } from '../engine.mjs';
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const n = 120, reps = 60, step = 4;
const arms = [
  ['off', {}],
  ['d1 k=1.5', { noiseFloor: 1.5 }],
  ['d1 k=2', { noiseFloor: 2 }],
  ['line w=7 k=3', { noiseFloor: 3, noiseFloorOrder: 'local', noiseFloorWindow: 7 }],
  ['line w=25 k=2', { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }],
  ['quad w=25 k=3', { noiseFloor: 3, noiseFloorOrder: 'local', noiseFloorWindow: 25, noiseFloorDegree: 2 }],
  ['ar1 joint', { model: 'mean', trend: true, ar1: 'joint' }],
];
console.log(`n=${n}, reps=${reps}, one step of ${step} noise sd at t=${n / 2}, drift 0.2 per step, model trend (ar1 joint arm: --model mean --trend --ar1 joint)`);
for (const phi of [0.2, 0.5, 0.8]) for (const noise of [1, 0.3, 0.1]) {
  console.log(`phi ${phi}, noise sd ${noise} (step ${+(step * noise).toFixed(2)})`);
  const data = [];
  for (let r = 0; r < reps; r++) {
    let e = gauss(); const v = [];
    for (let t = 0; t < n; t++) { e = phi * e + Math.sqrt(1 - phi * phi) * gauss(); v.push(0.2 * t + noise * e + (t >= n / 2 ? step * noise : 0)); }
    data.push(v);
  }
  for (const [name, extra] of arms) {
    let hit = 0, falseCuts = 0;
    for (const v of data) {
      const idx = analyze({ values: v, model: 'trend', ...extra }).pelt.changepoints.map((c) => c.index);
      if (idx.some((i) => Math.abs(i - n / 2) <= 5)) hit++;
      falseCuts += idx.filter((i) => Math.abs(i - n / 2) > 5).length;
    }
    console.log(`  ${name}: step found ${hit}/${reps}, other cuts ${(falseCuts / reps).toFixed(2)}`);
  }
}
