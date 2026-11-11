// Synthetic check of the drift-level model (drift-level.mjs) where the truth is known: n = 200,
// noise sd 1, a random-walk level with step sd omega, one step of size h noise sd at t = 100.
// 60 seeded series per cell. Reports how often the step is found (a change within 5 points) and
// how many other changes each setting reports. Settings fixed before running.
//
// usage: node eval/drift-sim.mjs > eval/drift-sim.out.txt
import { analyze } from '../engine.mjs';
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261111;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const FLOOR = { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 };
const SET = {
  'level (default)': (x) => analyze({ values: x }).pelt.changepoints.map((c) => c.index),
  'level, floor 2 local 25': (x) => analyze({ values: x, ...FLOOR }).pelt.changepoints.map((c) => c.index),
  'drift level': (x) => driftLevelChanges(x).changepoints,
  // Added 2026-11-11 later (README "A step-robust omega"); the data and the other columns are unchanged.
  'drift level, ML wander': (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints,
};
const N = 200, AT = 100, REPS = 60;
console.log(`n ${N}, noise sd 1, one step at t = ${AT}; ${REPS} series per cell. found = a change within 5 points; other = mean count of the rest.`);
console.log('  omega  step  ' + Object.keys(SET).map((k) => k.padEnd(25)).join(''));
for (const omega of [0, 0.1, 0.3]) for (const h of [0, 3, 5]) {
  const acc = Object.fromEntries(Object.keys(SET).map((k) => [k, { found: 0, other: 0 }]));
  for (let r = 0; r < REPS; r++) {
    let m = 0;
    const x = Array.from({ length: N }, (_, t) => (m += t ? omega * gauss() : 0) + (t >= AT ? h : 0) + gauss());
    for (const [k, fn] of Object.entries(SET)) {
      const cps = fn(x);
      const hit = h > 0 && cps.some((c) => Math.abs(c - AT) <= 5);
      acc[k].found += hit ? 1 : 0;
      acc[k].other += cps.length - (hit ? 1 : 0);
    }
  }
  console.log(`  ${omega.toFixed(1).padStart(5)}  ${String(h).padStart(4)}  ` + Object.keys(SET).map((k) => `${h ? `${String(acc[k].found).padStart(2)}/${REPS}` : '  -  '} other ${(acc[k].other / REPS).toFixed(2)}`.padEnd(25)).join(''));
}
