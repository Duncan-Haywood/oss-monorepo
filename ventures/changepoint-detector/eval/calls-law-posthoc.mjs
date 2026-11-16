// Post hoc (not pre-registered), after eval/calls-law.mjs failed L1: where does the across-day excess variance live?
// usage: node eval/calls-law-posthoc.mjs > eval/calls-law-posthoc.out.txt
import { loadCalls, referenceFit } from './calls-law.mjs';
const days = loadCalls(), E = referenceFit(days);
const K = 6.635;
// 1. Within-day first differences against the 7-point local level, pooled over all 164 days: mean d^2 / (2 m), uncapped and capped.
let s = 0, sc = 0, n = 0;
for (const d of days) {
  const x = d.counts;
  for (let t = 1; t < x.length; t++) {
    const a = Math.max(0, t - 4), z = Math.min(x.length, t + 4);
    let m = 0; for (let k = a; k < z; k++) m += x[k]; m /= z - a;
    const q = (x[t] - x[t - 1]) ** 2 / (2 * m); s += q; sc += Math.min(K, q); n++;
  }
}
console.log(`within-day local differences, all days pooled (${n}): mean d^2/(2m) ${(s / n).toFixed(3)} (1 under Poisson); capped mean ${(sc / n).toFixed(3)} (0.981 under Poisson)`);
// 2. Residuals from the across-day fit, smoothed over k slots inside a day: if the excess is slow profile wiggle, the
// dispersion of k-slot sums grows with k (k * extra / 1 per slot); if it is independent per-slot clumping it stays flat.
for (const k of [1, 3, 6, 12, 24]) {
  let zs = 0, c = 0;
  days.forEach((d, i) => { for (let s0 = 0; s0 + k <= d.counts.length; s0 += k) { let y = 0, e = 0; for (let j = s0; j < s0 + k; j++) { y += d.counts[j]; e += E[i][j]; } zs += (y - e) ** 2 / e; c++; } });
  console.log(`  blocks of ${String(k).padStart(2)} slots (${String(5 * k).padStart(3)} min): mean (Y - E)^2 / E ${(zs / c).toFixed(2)}`);
}
// 3. Lag-1 correlation of the across-day residuals inside a day.
let num = 0, den = 0;
days.forEach((d, i) => { const r = d.counts.map((y, s0) => (y - E[i][s0]) / Math.sqrt(E[i][s0])); for (let t = 0; t < r.length; t++) { den += r[t] * r[t]; if (t) num += r[t] * r[t - 1]; } });
console.log(`  lag-1 correlation of scaled residuals within a day: ${(num / den).toFixed(3)}`);
