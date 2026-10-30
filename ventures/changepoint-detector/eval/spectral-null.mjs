// Calibration of the residual Fisher-g test (eval/spectral-peak.mjs): how often p < 0.01 on series with no cycle,
// with and without true steps, and on a step plus a sine inside it. Run: node eval/spectral-null.mjs
import { check } from './spectral-peak.mjs';

const rng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const gauss = (u) => () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
export function cell(n, steps, amp, reps = 100) {
  let hit = 0;
  for (let s = 0; s < reps; s++) {
    const g = gauss(rng(1000 + s));
    const x = Array.from({ length: n }, (_, i) => g() + steps * Math.floor((i * 3) / n) * 2 + amp * Math.sin(2 * Math.PI * i / 11));
    if (check({ labels: x.map((_, i) => String(i)), values: x }).p < 0.01) hit++;
  }
  return hit / reps;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const n of [100, 300]) for (const [steps, amp] of [[0, 0], [1, 0], [0, 0.5], [0, 1], [1, 1]])
    console.log(`n=${n} steps=${steps ? '2 of 2sd' : 'none'} sine amp ${amp}: p<0.01 in ${(cell(n, steps, amp) * 100).toFixed(0)}%`);
}
