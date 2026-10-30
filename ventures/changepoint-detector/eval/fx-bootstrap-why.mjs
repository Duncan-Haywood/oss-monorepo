// Why --bootstrap did not help on the real franc series (README "Real heavy tails").
// The bootstrap standardises the series by a 3x-BIC pilot fit. On CHF that fit cuts the 2015 shock into a ~10-day segment,
// and per-segment standardising removes the tail (kurtosis 111 -> 4), so the resampled residuals are far lighter than the data.
// Also: the penalty that would remove the extra changes, and whether a longer pilot minimum segment recovers the tail.
// usage: node eval/fx-bootstrap-why.mjs
import { readFileSync } from 'node:fs';
import { analyze, bootstrapPenalty } from '../engine.mjs';
const rows = readFileSync(new URL('../data/fx-daily-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const kurt = (z) => { const n = z.length, m = z.reduce((a, c) => a + c, 0) / n, s2 = z.reduce((a, c) => a + (c - m) ** 2, 0) / n; return z.reduce((a, c) => a + (c - m) ** 4, 0) / n / s2 ** 2; };
const BIC3 = 3 * 22.4038 ; // penaltyValue('bic', 1751, 'meanvar') * 3
export function pilotResiduals(x, penalty = BIC3) {
  const n = x.length, cps = analyze({ values: x, labels, model: 'meanvar', penalty }).pelt.changepoints.map((c) => c.index);
  const b = [0, ...cps, n], z = [];
  for (let s = 0; s < b.length - 1; s++) {
    const seg = x.slice(b[s], b[s + 1]), m = seg.reduce((a, c) => a + c, 0) / seg.length;
    const sd = Math.sqrt(seg.reduce((a, c) => a + (c - m) ** 2, 0) / seg.length) || 1;
    for (const c of seg) z.push((c - m) / sd);
  }
  return { z, sizes: b.slice(1).map((e, i) => e - b[i]) };
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const [name, col] of [['chf', 1], ['gbp', 2], ['jpy', 3]]) {
    const x = rows.map((r) => +r[col]);
    const { z, sizes } = pilotResiduals(x);
    console.log(`${name}: pilot segments ${sizes.join(',')}; kurtosis raw ${kurt(x).toFixed(1)} -> standardised ${kurt(z).toFixed(1)}`);
    for (const pm of [10, 30, 60, 90]) {
      const bp = bootstrapPenalty(x, { minSegment: pm });
      const cps = analyze({ values: x, labels, model: 'meanvar', minSegment: pm, penalty: bp }).pelt.changepoints;
      console.log(`  minSegment ${String(pm).padEnd(2)} bootstrap penalty ${bp.toFixed(1)}  ${cps.length} changes`);
    }
  }
  const x = rows.map((r) => +r[1]);
  console.log('chf, fixed penalty sweep:');
  for (const p of [36.4, 45, 80, 100]) console.log(`  penalty ${p}: ${analyze({ values: x, labels, model: 'meanvar', penalty: p }).pelt.changepoints.map((c) => c.label).join(' ')}`);
}
