// Synthetic check of the drift model with a scale per segment (drift-level.mjs, scale 'segment')
// against the shipped `--model drift` (one global scale), where the truth is known.
// n 300, 60 seeded series a cell, both with the ML wander (the CLI default).
//
// Written 2026-11-11 before either setting was run on any cell or on any TCPD series:
//   cells: (A) white noise, a 3-sd level step at 150; (B) a random walk (omega 0.3, noise 1) with a
//   5-sd step at 150; (C) a near-pure random walk (step sd 1, noise 0.1) whose step sd is 5x
//   between 100 and 160, no level step: a volatility burst, the bank/bitcoin/apple-volume failure;
//   (D) the same walk with no burst; (E) white noise whose sd is 3x between 100 and 160.
//   found = a change within 5 points of the step (A, B); burst edges = changes within 5 of 100 or 160.
// Decision rule (this file and eval/tcpd-drift-scale.mjs together): offer scale 'segment' as an
// opt-in (`--drift-scale segment`) if (i) on (C) it reports at most half the shipped model's cuts,
// (ii) on (A) and (B) it finds the step at most 6 of 60 series less often, and (iii) on TCPD its
// mean F1 is no more than 0.02 below the shipped drift on either set. TCPD has been run through
// many settings already, so it is a guard here, not a win condition; the default never changes on
// this evidence.
//
// usage: node eval/drift-scale-sim.mjs > eval/drift-scale-sim.out.txt
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261111;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const N = 300, REPS = 60;
const SET = {
  'shipped (global scale)': (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints,
  'scale per segment': (x) => driftLevelChanges(x, { noise: 'ml', scale: 'segment' }).changepoints,
};
const burst = (t) => (t >= 100 && t < 160);
const CELLS = {
  'A white noise, 3-sd step': { at: [150], gen: () => Array.from({ length: N }, (_, t) => (t >= 150 ? 3 : 0) + gauss()) },
  'B walk 0.3, 5-sd step': { at: [150], gen: () => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? 0.3 * gauss() : 0) + (t >= 150 ? 5 : 0) + gauss()); } },
  'C walk 1 / noise 0.1, 5x burst': { edges: [100, 160], gen: () => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? (burst(t) ? 5 : 1) * gauss() : 0) + 0.1 * gauss()); } },
  'D walk 1 / noise 0.1, no burst': { gen: () => { let m = 0; return Array.from({ length: N }, (_, t) => (m += t ? gauss() : 0) + 0.1 * gauss()); } },
  'E white noise, 3x sd burst': { edges: [100, 160], gen: () => Array.from({ length: N }, (_, t) => (burst(t) ? 3 : 1) * gauss()) },
};
console.log(`n ${N}, ${REPS} series a cell, ML wander. found: a change within 5 of the step; edges: changes within 5 of 100 or 160; cuts: mean changes a series.`);
const t0 = Date.now();
for (const [name, cell] of Object.entries(CELLS)) {
  const acc = Object.fromEntries(Object.keys(SET).map((k) => [k, { found: 0, cuts: 0, edges: 0 }]));
  for (let r = 0; r < REPS; r++) {
    const x = cell.gen();
    for (const [k, fn] of Object.entries(SET)) {
      const cps = fn(x);
      acc[k].cuts += cps.length;
      if (cell.at) acc[k].found += cell.at.every((a) => cps.some((c) => Math.abs(c - a) <= 5)) ? 1 : 0;
      if (cell.edges) acc[k].edges += cell.edges.filter((e) => cps.some((c) => Math.abs(c - e) <= 5)).length;
    }
  }
  console.log(`\n${name}`);
  for (const k of Object.keys(SET)) {
    const a = acc[k];
    console.log(`  ${k.padEnd(24)} cuts ${(a.cuts / REPS).toFixed(2).padStart(6)}` + (cell.at ? `  found ${a.found}/${REPS}` : '') + (cell.edges ? `  edges ${(a.edges / REPS).toFixed(2)} of 2` : ''));
  }
}
console.error(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
