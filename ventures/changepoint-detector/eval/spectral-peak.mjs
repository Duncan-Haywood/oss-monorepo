// Fisher's g test for a periodic component in the residuals of the fitted steps: a cycle read as steps leaves a
// spectral peak that the lag-1 correlation can miss (treering rho 0.16). Run: node eval/spectral-peak.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';

/** Residuals of x about the segment means set by changepoints (indices where a new segment starts). */
export function stepResiduals(x, cps) {
  const b = [0, ...cps, x.length], r = [];
  for (let s = 0; s + 1 < b.length; s++) {
    let m = 0;
    for (let i = b[s]; i < b[s + 1]; i++) m += x[i];
    m /= b[s + 1] - b[s];
    for (let i = b[s]; i < b[s + 1]; i++) r.push(x[i] - m);
  }
  return r;
}

/** Fisher's g (largest periodogram share) with its exact p-value, over Fourier frequencies 1..floor((n-1)/2). */
export function fisherG(r) {
  const n = r.length, q = Math.floor((n - 1) / 2);
  if (q < 2) return { g: 0, p: 1, period: null };
  let tot = 0, best = 0, bk = 1;
  for (let k = 1; k <= q; k++) {
    let c = 0, s = 0;
    for (let t = 0; t < n; t++) { const a = 2 * Math.PI * k * t / n; c += r[t] * Math.cos(a); s += r[t] * Math.sin(a); }
    const I = c * c + s * s;
    tot += I;
    if (I > best) { best = I; bk = k; }
  }
  const g = tot > 0 ? best / tot : 0;
  let p = 0;
  for (let j = 1; j <= Math.min(q, Math.floor(1 / g)); j++) {
    let lc = 0;
    for (let i = 1; i <= j; i++) lc += Math.log(q - i + 1) - Math.log(i); // log C(q,j)
    p += (j % 2 ? 1 : -1) * Math.exp(lc + (q - 1) * Math.log(1 - j * g));
  }
  return { g, p: Math.min(1, Math.max(0, p)), period: n / bk };
}

const load = (f) => {
  const rows = readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[1]) };
};
export function check(d, o = {}) {
  const a = analyze({ ...d, ...o });
  return { steps: a.pelt.changepoints.length, ...fisherG(stepResiduals(d.values, a.pelt.changepoints.map((c) => c.index))) };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const f of ['lynx', 'sunspot-year', 'treering', 'lh', 'us-inflation', 'nile', 'lake-huron', 'nhtemp', 'great-discoveries', 'us-accidental-deaths', 'www-usage', 'dax-returns']) {
    let d; try { d = load(f); } catch { continue; }
    const r = check(d);
    console.log(f.padEnd(22), `n=${d.values.length}`.padEnd(8), `steps ${r.steps}`.padEnd(10), `g=${r.g.toFixed(3)} p=${r.p.toExponential(1)} period≈${r.period?.toFixed(1)}`);
  }
}
