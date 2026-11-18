// Synthetic check of the drift-level model's robust losses (drift-level.mjs, loss option) where the
// truth is known: n = 200, a random-walk level with step sd omega, one step of h noise sd at t = 100,
// noise either Gaussian (sd 1) or Student t with 3 degrees of freedom scaled to the same MAD
// (heavy tails: about 1 point in 30 beyond 4.5 sd). 60 seeded series per cell; all settings use
// the ML wander (the `--model drift` default). Settings fixed before running; run before any TCPD
// series was scored (eval/tcpd-drift-robust.mjs).
//
// usage: node eval/drift-robust-sim.mjs > eval/drift-robust-sim.out.txt
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261112;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// t3: z / sqrt(chi2_3 / 3); MAD of t3 is 0.7649, of N(0,1) 0.6745, so scale by 0.6745 / 0.7649.
const t3 = () => { const z = gauss(); const c = gauss() ** 2 + gauss() ** 2 + gauss() ** 2; return (z / Math.sqrt(c / 3)) * (0.6745 / 0.7649); };
const SET = {
  'gauss': (x) => driftLevelChanges(x, { noise: 'ml' }).changepoints,
  'huber K 2': (x) => driftLevelChanges(x, { noise: 'ml', loss: 'huber', lossK: 2 }).changepoints,
  'biweight K 3': (x) => driftLevelChanges(x, { noise: 'ml', loss: 'biweight', lossK: 3 }).changepoints,
};
const N = 200, AT = 100, REPS = 60;
console.log(`n ${N}, one step at t = ${AT}; ${REPS} series per cell; drift model, ML wander. found = a change within 5 points; other = mean count of the rest.`);
for (const [noiseName, noise] of [['Gaussian', gauss], ['Student t3', t3]]) {
  console.log(`\nnoise ${noiseName}`);
  console.log('  omega  step  ' + Object.keys(SET).map((k) => k.padEnd(22)).join(''));
  for (const omega of [0, 0.3]) for (const h of [0, 3, 5]) {
    const acc = Object.fromEntries(Object.keys(SET).map((k) => [k, { found: 0, other: 0 }]));
    for (let r = 0; r < REPS; r++) {
      let m = 0;
      const x = Array.from({ length: N }, (_, t) => (m += t ? omega * gauss() : 0) + (t >= AT ? h : 0) + noise());
      for (const [k, fn] of Object.entries(SET)) {
        const cps = fn(x);
        const hit = h > 0 && cps.some((c) => Math.abs(c - AT) <= 5);
        acc[k].found += hit ? 1 : 0;
        acc[k].other += cps.length - (hit ? 1 : 0);
      }
    }
    console.log(`  ${omega.toFixed(1).padStart(5)}  ${String(h).padStart(4)}  ` + Object.keys(SET).map((k) => `${h ? `${String(acc[k].found).padStart(2)}/${REPS}` : '  -  '} other ${(acc[k].other / REPS).toFixed(2)}`.padEnd(22)).join(''));
  }
}
