// `--garch` with Student t innovations as well (README, "Heavy tails in the GARCH search"). The 2026-11-13 search raised a
// false change on 44-49% of t3 series: a Gaussian segment likelihood reads a heavy tail as a variance change. This adds
// two paths to garchCuts' model choice, independent t noise and t-GARCH, nu read off {4, 8}, each paying tPen more.
// Cells: the four noises below, null / sd 1 -> 2 at n/2 / mean +1.5 at n/2, as in meanvar-garch-compare.mjs.
// usage: node eval/meanvar-tgarch.mjs [reps] [seedShift] [tPens, comma list of multiples of ln n; "off" = Gaussian only]
import { garchCuts, GARCH_CUT_PEN, GARCH_TERM_PEN } from '../engine.mjs';
import { NOISE } from './meanvar-garch-binseg.mjs';
const reps = +process.argv[2] || 100, shift = +process.argv[3] || 0;
const PENS = (process.argv[4] || 'off,0.25,0.5,1').split(',');
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
// clustered volatility with t5 innovations (unit variance), the usual shape of daily returns
NOISE.tgarch = (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const z = gauss(r) / Math.sqrt(chi2(r, 5) / 5) / Math.sqrt(5 / 3); const e = Math.sqrt(h) * z; h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
console.log(`reps ${reps}, seed shift ${shift}, cut ${GARCH_CUT_PEN} ln n, GARCH term ${GARCH_TERM_PEN} ln n; per t penalty (ln n):\nnull any change / sd 1->2 exactly one / mean +1.5 exactly one`);
console.log(`n | noise | ${PENS.map((p) => `t ${p}`).join(' | ')}`);
const t0 = Date.now();
for (const n of [100, 200]) for (const name of ['gauss', 'garch', 't3', 'tgarch']) {
  const gen = NOISE[name], ln = Math.log(n), tally = PENS.map(() => [0, 0, 0]);
  for (let k = 0; k < reps; k++) {
    const series = [
      gen(rng(5000 * n + 7 * k + 1 + shift), n),
      gen(rng(9000 * n + 7 * k + 3 + shift), n).map((x, i) => i < n / 2 ? x : 2 * x),
      gen(rng(13000 * n + 7 * k + 5 + shift), n).map((x, i) => i < n / 2 ? x : x + 1.5),
    ];
    PENS.forEach((p, q) => series.forEach((v, j) => {
      const c = garchCuts(v, { pen: GARCH_CUT_PEN * ln, garchPen: GARCH_TERM_PEN * ln, tPen: p === 'off' ? null : +p * ln, maxCuts: 2 }).cuts.length;
      if (j === 0 ? c > 0 : c === 1) tally[q][j]++;
    }));
  }
  console.log(`${n} | ${name.padEnd(6)} | ${tally.map((t) => t.map((v) => pct(v, reps)).join(' / ')).join(' | ')}`);
}
console.error(`${((Date.now() - t0) / 1000).toFixed(0)} s`);
