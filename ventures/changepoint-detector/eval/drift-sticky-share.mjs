// How many false changes the shipped `--model drift` reports on a walk with no change as the share of
// exact repeats rises (a sticky quote or sensor), to place the sticky-series warning (drift-level.mjs
// stickyCheck, README "Sticky series"). Walk step sd 1, noise 0.1, n 300, 60 seeded series a share;
// each observation is a stale repeat of the previous one with probability p. Synthetic only.
//
// usage: node eval/drift-sticky-share.mjs > eval/drift-sticky-share.out.txt
import { driftLevelChanges } from '../drift-level.mjs';

let seed = 20261113;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const gauss = () => { const u = rnd() || 1e-12, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const N = 300, REPS = 60;
console.log(`n ${N}, ${REPS} series a share, walk sd 1 + noise 0.1, no change; mean false changes from the shipped drift model (ML wander).`);
console.log('repeat prob  observed share  false changes (mean, max)');
for (const p of [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4]) {
  let cuts = 0, mx = 0, share = 0;
  for (let r = 0; r < REPS; r++) {
    let m = 0;
    const x = Array.from({ length: N }, (_, t) => (m += t ? gauss() : 0) + 0.1 * gauss());
    for (let t = 1; t < N; t++) if (rnd() < p) x[t] = x[t - 1];
    share += x.filter((v, t) => t && v === x[t - 1]).length / (N - 1);
    const k = driftLevelChanges(x, { noise: 'ml' }).changepoints.length;
    cuts += k; mx = Math.max(mx, k);
  }
  console.log(`${p.toFixed(2).padStart(11)}  ${(share / REPS).toFixed(3).padStart(14)}  ${(cuts / REPS).toFixed(2).padStart(8)}  ${String(mx).padStart(4)}`);
}
