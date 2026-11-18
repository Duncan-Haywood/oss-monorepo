// Synthetic check of the heavy-tail check and the robust drift costs (drift-level.mjs driftTailCheck,
// loss: biweight K 3 and Huber K 2, the settings eval/tcpd-drift-robust.mjs scored), where the truth is known. n 400, 60 seeded series per cell, one step of h noise sd at
// t = 200 where a cell has one. Heavy tails are Student t with 3 degrees of freedom scaled to sd 1.
// Cells and settings were written before this script was first run (2026-11-11), after the TCPD
// run (eval/tcpd-drift-robust.out.txt) had shown where the tails lived on bank, bitcoin and well_log.
// found = a change within 5 points of the step; other = mean count of the rest.
//
// usage: node eval/drift-tails-sim.mjs > eval/drift-tails-sim.out.txt
import { driftLevelChanges, driftTailCheck } from '../drift-level.mjs';

let seed = 20261112;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const t3 = () => { let c = 0; for (let i = 0; i < 3; i++) c += gauss() ** 2; return gauss() / Math.sqrt(c / 3) / Math.sqrt(3); }; // var 3 -> 1
const N = 400, AT = 200, REPS = 60;
const CELLS = [
  ['Gaussian noise, flat level, 3-sd step', { noise: gauss, sd: 1, omega: 0, walk: gauss, h: 3 }],
  ['t3 noise, flat level, 3-sd step', { noise: t3, sd: 1, omega: 0, walk: gauss, h: 3 }],
  ['t3 noise, wander 0.2, 5-sd step', { noise: t3, sd: 1, omega: 0.2, walk: gauss, h: 5 }],
  ['t3 noise, flat level, no step', { noise: t3, sd: 1, omega: 0, walk: gauss, h: 0 }],
  ['Gaussian random walk, no noise, no step', { noise: gauss, sd: 0, omega: 1, walk: gauss, h: 0 }],
  ['t3 random walk, no noise, no step', { noise: gauss, sd: 0, omega: 1, walk: t3, h: 0 }],
  ['t3 random walk, small noise 0.1, no step', { noise: gauss, sd: 0.1, omega: 1, walk: t3, h: 0 }],
];
const SET = {
  gauss: (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints,
  huber: (x) => driftLevelChanges(x, { noise: 'ml', loss: 'huber', lossK: 2 }).changepoints,
  biweight: (x) => driftLevelChanges(x, { noise: 'ml', loss: 'biweight' }).changepoints,
};
console.log(`n ${N}, ${REPS} series a cell; check = how often driftTailCheck says walk / noise / nothing.`);
for (const [name, c] of CELLS) {
  const acc = Object.fromEntries(Object.keys(SET).map((k) => [k, { found: 0, other: 0 }]));
  const kinds = { walk: 0, noise: 0, none: 0 };
  for (let r = 0; r < REPS; r++) {
    let m = 0;
    const x = Array.from({ length: N }, (_, t) => (m += t ? c.omega * c.walk() : 0) + (t >= AT ? c.h : 0) + c.sd * c.noise());
    kinds[driftTailCheck(x).kind ?? 'none']++;
    for (const [k, fn] of Object.entries(SET)) {
      const cps = fn(x);
      const hit = c.h > 0 && cps.some((p) => Math.abs(p - AT) <= 5);
      acc[k].found += hit ? 1 : 0;
      acc[k].other += cps.length - (hit ? 1 : 0);
    }
  }
  console.log(`\n${name}\n  check: walk ${kinds.walk}, noise ${kinds.noise}, nothing ${kinds.none}`);
  for (const k of Object.keys(SET)) console.log(`  ${k.padEnd(9)} ${c.h ? `found ${String(acc[k].found).padStart(2)}/${REPS}` : 'found   -  '}  other ${(acc[k].other / REPS).toFixed(2)}`);
}
