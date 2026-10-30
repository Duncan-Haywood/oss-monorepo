// Untested fix from README "Real heavy tails": standardise the bootstrap's pilot residuals so the tail survives.
// Variants of the pilot standardisation (3x BIC pilot, as shipped): seg = each segment by its sd (shipped); mad = each
// segment by 1.4826 x its median absolute deviation (a 10-day shock cannot set its own scale); glob = one MAD scale for
// the whole series after removing segment means (keeps every variance break in the residuals, so it is the heaviest).
// Scored on the real daily FX returns (changes found at the resulting penalty) and on synthetic noise with no change
// (false alarms) and one sd doubling (detection). usage: node eval/fx-bootstrap-tail.mjs [reps]  (seeded)
import { readFileSync } from 'node:fs';
import { analyze, pelt, penaltyValue, makeCost } from '../engine.mjs';
const reps = +process.argv[2] || 100, B = 100, MS = 10;
const rows = readFileSync(new URL('../data/fx-daily-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const med = (a) => { const s = [...a].sort((p, q) => p - q), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const mad = (a) => 1.4826 * med(a.map((c) => Math.abs(c - med(a)))) || 1;
const sd = (a, m) => Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length) || 1;
function standardise(x, cps, kind) {
  const b = [0, ...cps, x.length], z = [], segs = [];
  for (let s = 0; s < b.length - 1; s++) segs.push(x.slice(b[s], b[s + 1]));
  const g = kind === 'glob' ? mad(segs.flatMap((s) => { const m = s.reduce((p, c) => p + c, 0) / s.length; return s.map((c) => c - m); })) : 1;
  for (const seg of segs) {
    const m = seg.reduce((p, c) => p + c, 0) / seg.length;
    const sc = kind === 'seg' ? sd(seg, m) : kind === 'mad' ? mad(seg) : g;
    for (const c of seg) z.push((c - m) / sc);
  }
  return z;
}
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
function penalty(x, kind, seed = 12345) {
  const n = x.length, bic = penaltyValue('bic', n, 'meanvar');
  if (n < 4 * MS) return bic;
  const z = standardise(x, pelt(x, { model: 'meanvar', penalty: 3 * bic, minSegment: MS }).changepoints, kind);
  const rr = rng(seed), L = Math.ceil(2 * Math.cbrt(n)), gains = [];
  for (let r = 0; r < B; r++) {
    const y = []; while (y.length < n) { const s = Math.floor(rr() * (n - L + 1)); for (let i = 0; i < L; i++) y.push(z[s + i]); }
    y.length = n;
    const c = makeCost(y, 'meanvar', 1), whole = c(0, n); let gm = 0;
    for (let s = MS; s <= n - MS; s++) gm = Math.max(gm, whole - c(0, s) - c(s, n));
    gains.push(gm);
  }
  gains.sort((a, c) => a - c);
  return Math.max(bic, gains[Math.floor(0.95 * (B - 1))]);
}
const KINDS = ['seg', 'mad', 'glob'];
console.log('real daily FX returns (n=1751); changes found at the bootstrap penalty:');
for (const [name, col] of [['chf', 1], ['gbp', 2], ['jpy', 3]]) {
  const x = rows.map((r) => +r[col]);
  for (const k of KINDS) {
    const p = penalty(x, k);
    const cps = analyze({ values: x, labels, model: 'meanvar', penalty: p }).pelt.changepoints.map((c) => c.label);
    console.log(`  ${name} ${k.padEnd(4)} penalty ${p.toFixed(1).padStart(6)}  ${cps.length} changes ${cps.join(' ')}`);
  }
}
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
};
console.log(`synthetic n=200, ${reps} reps: false alarms (no change) / detection (sd doubles at 100, Gaussian only)`);
for (const [nm, gen] of Object.entries(NOISE)) {
  for (const k of KINDS) {
    const r = rng(7); let fa = 0;
    for (let i = 0; i < reps; i++) { const x = gen(r, 200); fa += pelt(x, { model: 'meanvar', penalty: penalty(x, k), minSegment: MS }).changepoints.length > 0; }
    let det = '';
    if (nm === 'gauss') { const r2 = rng(11); let d = 0; for (let i = 0; i < reps; i++) { const x = gen(r2, 200).map((v, j) => (j >= 100 ? 2 * v : v)); d += pelt(x, { model: 'meanvar', penalty: penalty(x, k), minSegment: MS }).changepoints.some((c) => Math.abs(c - 100) <= 10); } det = ` detection ${Math.round(100 * d / reps)}%`; }
    console.log(`  ${nm.padEnd(5)} ${k.padEnd(4)} false alarms ${Math.round(100 * fa / reps)}%${det}`);
  }
}
