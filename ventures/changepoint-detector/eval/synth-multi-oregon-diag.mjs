// Post-hoc diagnostic (not pre-registered; README "Several starts for V"): how tight can Oregon's before-1997 fit get
// with W chosen by any V on the five predictors? 4,000 V drawn uniformly on the simplex (hashed seed 51000) plus the 5
// corners, the multi-start search's best and the outcome-only fit for comparison. If no V comes near the outcome fit,
// the covariate family, not the search, is what fails Oregon.
//   node eval/synth-multi-oregon-diag.mjs > eval/synth-multi-oregon-diag.out.txt
import { readFileSync } from 'node:fs';
import { simplexLeastSquaresRows, synthFit } from '../synth-control.mjs';
const read = (f) => { const [h, ...rows] = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n'); return { head: h.split(','), data: rows.map((l) => l.split(',').map(Number)) }; };
const sales = read('us-cigarette-packs-per-capita.csv'), tax = read('us-cigarette-state-tax.csv');
const price = read('us-cigarette-retail-price.csv'), income = read('us-personal-income-per-capita.csv');
const years = sales.data.map((r) => r[0]);
const col = (t, s) => t.data.map((r) => r[t.head.indexOf(s)]);
const EXCLUDED = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
const DONORS = sales.head.slice(1).filter((s) => !EXCLUDED.has(s));
const i88 = years.indexOf(1988), last = 2004;
const pool = DONORS.filter((s) => { const v = col(tax, s); let mx = 0; for (let i = i88; i <= years.indexOf(last); i++) mx = Math.max(mx, v[i] - v[i88]); return mx < 0.5; });
const date = 1997, yi = (y) => years.indexOf(Math.max(1970, y));
const pred = (s) => { const lo = yi(date - 9), hi = yi(date - 1); const avg = (a) => { let t = 0; for (let i = lo; i <= hi; i++) t += a[i]; return t / (hi - lo + 1); }; const p = col(sales, s); return [Math.log(avg(col(income, s))), avg(col(price, s)), p[yi(date - 14)], p[yi(date - 9)], p[yi(date - 1)]]; };
const units = ['OR', ...pool], px = units.map(pred), P = 5;
const sd = Array.from({ length: P }, (_, m) => { const c = px.map((a) => a[m]), mu = c.reduce((a, b) => a + b, 0) / c.length; return Math.sqrt(c.reduce((a, b) => a + (b - mu) ** 2, 0) / (c.length - 1)); });
const sc = px.map((a) => a.map((v, m) => v / sd[m]));
const lo = yi(1970), k = yi(date) - lo;
const y = col(sales, 'OR').slice(lo, lo + k), D = pool.map((s) => col(sales, s).slice(lo, lo + k));
const rmse = (w) => Math.sqrt(y.reduce((s, v, t) => s + (v - D.reduce((a, d, j) => a + w[j] * d[t], 0)) ** 2, 0) / k);
const fitV = (v) => rmse(simplexLeastSquaresRows(Array.from({ length: P }, (_, m) => pool.map((_, j) => sc[j + 1][m] * Math.sqrt(v[m]))), sc[0].map((e, m) => e * Math.sqrt(v[m]))));
let s = 51000 >>> 0; const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
const vals = [];
for (let r = 0; r < 4000; r++) { const e = Array.from({ length: P }, () => -Math.log(u())), t = e.reduce((a, b) => a + b, 0); const v = e.map((x) => x / t); vals.push({ v, f: fitV(v) }); }
const corners = Array.from({ length: P }, (_, m) => fitV(Array.from({ length: P }, (_, i) => (i === m ? 1 : 0))));
vals.sort((a, b) => a.f - b.f);
const q = (p) => vals[Math.floor(p * (vals.length - 1))].f.toFixed(2);
console.log(`Oregon 1997, ${pool.length} donors, before-period 1970-1996 (${k} years)`);
console.log(`outcome-only fit (every before year): before RMSPE ${synthFit(col(sales, 'OR').slice(lo, lo + k + 1), pool.map((s2) => col(sales, s2).slice(lo, lo + k + 1)), k).preRmspe.toFixed(2)}`);
console.log(`corners (ln income, price, packs 1983, 1988, 1996): ${corners.map((c) => c.toFixed(2)).join(', ')}`);
console.log(`4000 random V: best ${q(0)} (V ${vals[0].v.map((x) => x.toFixed(3)).join(' ')}), 1% ${q(0.01)}, 10% ${q(0.1)}, median ${q(0.5)}, worst ${q(1)}`);
console.log(`Oregon's predictors vs the donors' range: ${px[0].map((v, m) => `${['ln income', 'price', 'packs 1983', 'packs 1988', 'packs 1996'][m]} ${v.toFixed(2)} (above ${px.slice(1).filter((a) => a[m] < v).length} of ${pool.length})`).join('; ')}`);
const yr = years.slice(lo, lo + k), o = col(sales, 'OR').slice(lo, lo + k), mean = yr.map((_, t) => D.reduce((a, d) => a + d[t], 0) / D.length);
console.log(`Oregon packs vs the donor mean: ${yr.filter((_, t) => t % 3 === 0).map((yy) => { const t = yr.indexOf(yy); return `${yy} ${o[t].toFixed(0)}/${mean[t].toFixed(0)}`; }).join(', ')}`);
