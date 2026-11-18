// Synthetic check of dropping exact repeats before the drift model (drift-level.mjs, repeats 'drop'),
// with one global scale (shipped `--model drift`) and with a scale per segment, where the truth is known.
// n 300, 60 seeded series a cell, ML wander (the CLI default).
//
// Why: the scale-per-segment run (eval/tcpd-drift-scale.out.txt, README "Volatility on a drifting
// level") cut TCPD's bank 63 -> 170 times because bank is sticky (246 of 580 steps exactly zero) and
// every flat run bought a low-scale segment. Written 2026-11-11 before repeats 'drop' was run on any
// cell or any TCPD series (the only TCPD numbers seen are those already in tcpd-drift-scale.out.txt
// and a count of exact-zero steps per series):
//   cells: (A) white noise, a 3-sd step at 150; (B) a walk (omega 0.3, noise 1), a 5-sd step at 150;
//   (C) a near-pure walk (step sd 1, noise 0.1) whose step sd is 5x between 100 and 160;
//   (F) a sticky walk: the walk of (D) in tcpd-drift-scale's sim (step sd 1, noise 0.1), each
//   observation a stale repeat of the previous one with probability 0.4, no change;
//   (G) the sticky walk of F with a 5-sd level step at 150; (H) the sticky walk with the 5x burst of C.
//   A, B and C have no exact repeats, so 'drop' must leave them byte-identical (a check, not a test).
// Decision rules (this file and eval/tcpd-drift-repeats.mjs together):
//   S, scale per segment with repeats dropped: offer `--drift-scale segment` (which drops repeats) as an
//     opt-in if (i) on C and on H it reports at most half the shipped model's cuts, (ii) on F it reports
//     at most half the cuts of scale per segment without the drop, and on A, B and G it finds the step
//     at most 6 of 60 series less often than shipped, and (iii) its TCPD mean F1 is no more than 0.02
//     below the shipped drift on both the 31 shipped and the 7 held-out series.
//   R, the shipped global-scale drift with repeats dropped: offer `--drift-repeats drop` as an opt-in
//     if on F it reports at most half the shipped cuts, on G it finds the step at most 6 of 60 less often,
//     and its TCPD mean F1 is no more than 0.01 below the shipped drift on both sets.
// The penalty stays a function of the original length n (2 log n global, 3 log n per segment).
// The default never changes on this evidence.
//
// usage: node eval/drift-repeats-sim.mjs > eval/drift-repeats-sim.out.txt
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261111;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const N = 300, REPS = 60;
const SET = {
  'shipped (global scale)': (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints,
  'R: global, repeats drop': (x) => driftLevelChanges(x, { noise: 'ml', repeats: 'drop' }).changepoints,
  'scale per segment': (x) => driftLevelChanges(x, { noise: 'ml', scale: 'segment' }).changepoints,
  'S: segment, repeats drop': (x) => driftLevelChanges(x, { noise: 'ml', scale: 'segment', repeats: 'drop' }).changepoints,
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
    if (/^[ABC]/.test(name)) { checked += 2; identical += (String(out['shipped (global scale)']) === String(out['R: global, repeats drop'])) + (String(out['scale per segment']) === String(out['S: segment, repeats drop'])); }
  }
  console.log(`\n${name}`);
  for (const k of Object.keys(SET)) {
    const a = acc[k];
    console.log(`  ${k.padEnd(26)} cuts ${(a.cuts / REPS).toFixed(2).padStart(6)}` + (cell.at ? `  found ${a.found}/${REPS}` : '') + (cell.edges ? `  edges ${(a.edges / REPS).toFixed(2)} of 2` : ''));
  }
}
console.log(`\nA, B, C (no exact repeats): drop gave the same changes as keep on ${identical} of ${checked} fits.`);
console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
