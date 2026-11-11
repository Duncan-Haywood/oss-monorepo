// Second try at sticky series: repeats as missing observations (drift-level.mjs, repeats 'missing'),
// a Kalman filter that keeps the time axis so the wander accrues across a repeat, against 'drop'.
// n 300, 60 seeded series a cell, ML wander (the CLI default).
//
// Why: the first, pre-registered try (eval/drift-repeats-sim.mjs, eval/tcpd-drift-repeats.mjs)
// passed on TCPD but failed its power rule on a 5-sd step in a sticky walk (cell G: shipped 59/60,
// 'drop' global 51, 'drop' per segment 38): dropping a repeat charges k + 1 steps of wander as one, so
// a real jump looks like wander. This design came after seeing that result, so it is post hoc; the
// cells are the same, drawn from a new seed (20261112) so no series is reused, and TCPD has now been
// seen under 'drop', so (iii) below is a guard only.
// Written 2026-11-11 before repeats 'missing' was run on any cell or TCPD series (one check: with no
// repeats it matches the shipped fit to 1e-12 on one synthetic series).
// Decision rules, as for 'drop' (this file and eval/tcpd-drift-missing.mjs together):
//   MS, scale per segment with repeats missing: offer `--drift-scale segment` (with repeats missing) as
//     an opt-in if (i) on C and H it reports at most half the shipped cuts, (ii) on F at most half the
//     cuts of scale per segment without it, and on A, B and G it finds the step at most 6 of 60 series
//     less often than shipped, and (iii) its TCPD mean F1 is no more than 0.02 below the shipped drift
//     on both sets.
//   MR, global scale with repeats missing: offer `--drift-repeats missing` as an opt-in if on F it
//     reports at most half the shipped cuts, on G it finds the step at most 6 of 60 less often, and its
//     TCPD mean F1 is no more than 0.01 below the shipped drift on both sets.
// The default never changes on this evidence.
//
// usage: node eval/drift-missing-sim.mjs > eval/drift-missing-sim.out.txt
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261112;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const N = 300, REPS = 60;
const SET = {
  'shipped (global scale)': (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints,
  'R: global, repeats drop': (x) => driftLevelChanges(x, { noise: 'ml', repeats: 'drop' }).changepoints,
  'MR: global, missing': (x) => driftLevelChanges(x, { noise: 'ml', repeats: 'missing' }).changepoints,
  'scale per segment': (x) => driftLevelChanges(x, { noise: 'ml', scale: 'segment' }).changepoints,
  'S: segment, repeats drop': (x) => driftLevelChanges(x, { noise: 'ml', scale: 'segment', repeats: 'drop' }).changepoints,
  'MS: segment, missing': (x) => driftLevelChanges(x, { noise: 'ml', scale: 'segment', repeats: 'missing' }).changepoints,
};
const burst = (t) => (t >= 100 && t < 160);
const walk = (sd, step = 0) => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? sd(t) * gauss() : 0) + (t >= 150 ? step : 0) + 0.1 * gauss()); };
const sticky = (x) => { const y = x.slice(); for (let t = 1; t < N; t++) if (rnd() < 0.4) y[t] = y[t - 1]; return y; };
const CELLS = {
  'A white noise, 3-sd step': { at: [150], gen: () => Array.from({ length: N }, (_, t) => (t >= 150 ? 3 : 0) + gauss()) },
  'B walk 0.3, 5-sd step': { at: [150], gen: () => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? 0.3 * gauss() : 0) + (t >= 150 ? 5 : 0) + gauss()); } },
  'C walk 1 / noise 0.1, 5x burst': { edges: [100, 160], gen: () => walk((t) => (burst(t) ? 5 : 1)) },
  'F sticky walk (40% repeats), no change': { gen: () => sticky(walk(() => 1)) },
  'G sticky walk, 5-sd step': { at: [150], gen: () => sticky(walk(() => 1, 5)) },
  'H sticky walk, 5x burst': { edges: [100, 160], gen: () => sticky(walk((t) => (burst(t) ? 5 : 1))) },
};
console.log(`n ${N}, ${REPS} series a cell, ML wander. found: a change within 5 of the step; edges: changes within 5 of 100 or 160; cuts: mean changes a series.`);
const t0 = Date.now();
let identical = 0, checked = 0;
for (const [name, cell] of Object.entries(CELLS)) {
  const acc = Object.fromEntries(Object.keys(SET).map((k) => [k, { found: 0, cuts: 0, edges: 0 }]));
  for (let r = 0; r < REPS; r++) {
    const x = cell.gen();
    const out = {};
    for (const [k, fn] of Object.entries(SET)) {
      const cps = (out[k] = fn(x));
      acc[k].cuts += cps.length;
      if (cell.at) acc[k].found += cell.at.every((a) => cps.some((c) => Math.abs(c - a) <= 5)) ? 1 : 0;
      if (cell.edges) acc[k].edges += cell.edges.filter((e) => cps.some((c) => Math.abs(c - e) <= 5)).length;
    }
    if (/^[ABC]/.test(name)) { checked += 2; identical += (String(out['shipped (global scale)']) === String(out['MR: global, missing'])) + (String(out['scale per segment']) === String(out['MS: segment, missing'])); }
  }
  console.log(`\n${name}`);
  for (const k of Object.keys(SET)) {
    const a = acc[k];
    console.log(`  ${k.padEnd(26)} cuts ${(a.cuts / REPS).toFixed(2).padStart(6)}` + (cell.at ? `  found ${a.found}/${REPS}` : '') + (cell.edges ? `  edges ${(a.edges / REPS).toFixed(2)} of 2` : ''));
  }
}
console.log(`\nA, B, C (no exact repeats): missing gave the same changes as keep on ${identical} of ${checked} fits.`);
console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
