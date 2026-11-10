// --consensus on synthetic drift with one known step: what each tier of agreement buys against each single setting.
// Same series as noise-floor-ar1-joint-sim.mjs (n 120, drift 0.2, AR(1) noise, one step of 4 noise sd at t=60, 60 seeded
// series per cell). "found" = a change within 5 points of the step; "other" = mean cuts elsewhere per series.
// usage: node eval/consensus-sim.mjs   (seeded, deterministic)
import { consensus } from '../consensus.mjs';
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const n = 120, reps = 60, step = 4, drift = 0.2;
console.log(`n=${n}, reps=${reps}, drift ${drift}, one step of ${step} noise sd at t=${n / 2}; panel of six settings`);
for (const phi of [0.2, 0.5, 0.8]) for (const noise of [1, 0.3]) {
  const runs = [];
  for (let r = 0; r < reps; r++) {
    let e = 0; const v = [];
    for (let t = 0; t < n; t++) { e = phi * e + Math.sqrt(1 - phi * phi) * gauss(); v.push(drift * t + noise * e + (t >= n / 2 ? step * noise : 0)); }
    runs.push(consensus({ values: v }));
  }
  console.log(`phi ${phi}, noise sd ${noise}`);
  const names = runs[0].settings.map((x) => x.name);
  const cell = (label, cutsOf) => {
    let hit = 0, other = 0;
    for (const c of runs) { const idx = cutsOf(c); if (idx.some((i) => Math.abs(i - n / 2) <= 5)) hit++; other += idx.filter((i) => Math.abs(i - n / 2) > 5).length; }
    console.log(`  ${label}: step found ${hit}/${reps}, other cuts ${(other / reps).toFixed(2)}`);
  };
  for (const nm of names) cell(nm, (c) => c.changes.filter((x) => x.settings.includes(nm)).map((x) => x.index));
  cell('consensus: every setting', (c) => c.changes.filter((x) => x.tier === 'all').map((x) => x.index));
  cell('consensus: half or more', (c) => c.changes.filter((x) => x.tier !== 'few').map((x) => x.index));
  cell('consensus: any setting', (c) => c.changes.map((x) => x.index));
}
