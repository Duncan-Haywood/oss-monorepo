// Does a noise floor built on second differences (--noise-floor k --noise-floor-diff2) beat the first-difference floor when drift dominates?
// Same series as noise-floor-drift-sim.mjs: y_t = 0.2 t + AR(1) noise (sd, phi 0.5) + a step of 4 sd at t=60; model trend; 60 seeded series per cell.
// usage: node eval/noise-floor-diff2-sim.mjs   (seeded, deterministic)
import { analyze } from '../engine.mjs';
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const n = 120, reps = 60, step = 4, phi = 0.5;
console.log(`n=${n}, reps=${reps}, drift 0.2, one step of ${step} sd at t=${n / 2}, model trend, AR(1) phi ${phi}; order 1 = --noise-floor k, order 2 = plus --noise-floor-diff2`);
for (const noise of [1, 0.3, 0.1, 0.03]) {
  console.log(`noise sd ${noise} (step ${(step * noise).toFixed(2)})`);
  const data = [];
  for (let r = 0; r < reps; r++) {
    let e = 0; const v = [];
    for (let t = 0; t < n; t++) { e = phi * e + Math.sqrt(1 - phi * phi) * gauss(); v.push(0.2 * t + noise * e + (t >= n / 2 ? step * noise : 0)); }
    data.push(v);
  }
  for (const [label, order, k] of [['none', 1, 0], ['order1 k=1', 1, 1], ['order1 k=1.5', 1, 1.5], ['order2 k=1', 2, 1], ['order2 k=1.5', 2, 1.5], ['order2 k=2', 2, 2]]) {
    let tot = 0, hit = 0, falseCuts = 0;
    for (const v of data) {
      const idx = analyze({ values: v, model: 'trend', noiseFloor: k, noiseFloorOrder: order }).pelt.changepoints.map((c) => c.index);
      tot += idx.length;
      if (idx.some((i) => Math.abs(i - n / 2) <= 5)) hit++;
      falseCuts += idx.filter((i) => Math.abs(i - n / 2) > 5).length;
    }
    console.log(`  ${label.padEnd(13)} step found ${String(hit).padStart(2)}/${reps}, other cuts ${(falseCuts / reps).toFixed(2)}`);
  }
}
