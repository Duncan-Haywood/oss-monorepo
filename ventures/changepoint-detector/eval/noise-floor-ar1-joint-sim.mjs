// Same series as noise-floor-ar1-sim.mjs, comparing ar1 'joint' (exact AR(1) likelihood) with plain ar1 and the floor, at phi 0.2, 0.5, 0.8.
// Synthetic calibration of --noise-floor k on a drifting series with one known step.
// y_t = drift*t + AR(1) noise (sd 1, phi) + step*(t >= n/2). Model: trend. For each (noise scale, k): mean number of
// changes, share of runs that put a change within 5 steps of the true step, and mean false changes (others).
// usage: node eval/noise-floor-ar1-sim.mjs   (seeded, deterministic)
import { analyze } from '../engine.mjs';
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const n = 120, reps = 60, step = 4;
console.log(`n=${n}, reps=${reps}, one step of ${step} sd at t=${n / 2}, model trend (ar1 arms: --model mean --trend --ar1), AR(1) phi varies`);
for (const phi of [0.2, 0.5, 0.8]) for (const noise of [1, 0.3]) {
  const drift = 0.2;
  console.log(`phi ${phi}, noise sd ${noise} (drift 0.2 per step, step ${step * noise})`);
  const data = [];
  for (let r = 0; r < reps; r++) {
    let e = 0; const v = [];
    for (let t = 0; t < n; t++) { e = phi * e + Math.sqrt(1 - phi * phi) * gauss(); v.push(drift * t + noise * e + (t >= n / 2 ? step * noise : 0)); }
    data.push(v);
  }
  for (const [k, ar1] of [[0, false], [0, true], [0, 'joint'], [1.5, false]]) {
    // ar1 is a mean-model option, reached with --trend (a common slope under the steps); the floor arms use --model trend as before
    let tot = 0, hit = 0, falseCuts = 0;
    for (const v of data) {
      const cps = analyze(ar1 ? { values: v, model: 'mean', trend: true, ar1, noiseFloor: k } : { values: v, model: 'trend', noiseFloor: k }).pelt.changepoints;
      const idx = cps.map((c) => c.index);
      tot += idx.length;
      const h = idx.some((i) => Math.abs(i - n / 2) <= 5);
      if (h) hit++;
      falseCuts += idx.filter((i) => Math.abs(i - n / 2) > 5).length;
    }
    console.log(`  k=${k} ar1=${ar1 || 'off'}: changes ${(tot / reps).toFixed(2)}, step found ${hit}/${reps}, other cuts ${(falseCuts / reps).toFixed(2)}`);
  }
}
