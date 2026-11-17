// After the run, not pre-registered: which donors outrank California's after/before ratio, and what California's
// rank is under the two post-hoc filters Abadie et al. (2010, section 4.3) show: drop placebos whose before-period
// MSPE is more than 20, 5 or 2 times California's. node eval/synth-real-diag.mjs > eval/synth-real-diag.out.txt
import { readFileSync } from 'node:fs';
import { synthControlTest } from '../synth-control.mjs';
const [h, ...rows] = readFileSync(new URL('../data/us-cigarette-packs-per-capita.csv', import.meta.url), 'utf8').trim().split('\n');
const head = h.split(','), data = rows.map((l) => l.split(',').map(Number));
const years = data.map((r) => r[0]);
const col = (s) => data.map((r) => r[head.indexOf(s)]);
const EX = new Set('AK AZ FL HI MD MA MI NJ NY OR WA DC CA'.split(' '));
const DONORS = head.slice(1).filter((s) => !EX.has(s));
const hi = years.indexOf(2000) + 1, k = years.indexOf(1989);
const r = synthControlTest(col('CA').slice(0, hi), Object.fromEntries(DONORS.map((s) => [s, col(s).slice(0, hi)])), k, { statistic: 'ratio' });
const f = (v, p = 2) => Number(v).toFixed(p);
console.log(`California: before RMSPE ${f(r.preRmspe)}, after ${f(r.postRmspe)}, ratio ${f(r.ratio)}, rank ${r.rank} of 39`);
const sorted = [...r.placebos].sort((a, b) => b.ratio - a.ratio);
console.log('Top 8 placebo ratios: ' + sorted.slice(0, 8).map((p) => `${p.name} ${f(p.ratio)} (before ${f(p.preRmspe)}, after ${f(p.postRmspe)})`).join('; '));
for (const m of [20, 5, 2]) {
  const keep = r.placebos.filter((p) => p.preRmspe ** 2 <= m * r.preRmspe ** 2);
  const above = keep.filter((p) => p.ratio >= r.ratio).length;
  console.log(`placebos with before MSPE <= ${m}x California's: ${keep.length}; California's rank ${above + 1} of ${keep.length + 1}, p ${f((above + 1) / (keep.length + 1), 3)}`);
}
const post = [...r.placebos].sort((a, b) => b.postRmspe - a.postRmspe);
const abovePost = r.placebos.filter((p) => p.postRmspe >= r.postRmspe).length;
console.log(`after-date RMSPE alone (not the test): California's rank ${abovePost + 1} of 39; top: ${post.slice(0, 4).map((p) => `${p.name} ${f(p.postRmspe)}`).join(', ')}`);
const gapSign = r.placebos.map((p) => p.name);
// The paper's placebo pool: California moved into each placebo's donor pool (placeboPool 'with').
const w = synthControlTest(col('CA').slice(0, hi), Object.fromEntries(DONORS.map((s) => [s, col(s).slice(0, hi)])), k, { placeboPool: 'with', statistic: 'ratio' });
const sw = [...w.placebos].sort((a, b) => b.ratio - a.ratio);
console.log(`With California in each placebo's pool (the paper's placebos): California's rank ${w.rank} of 39, p ${f(w.p, 3)}; top: ${sw.slice(0, 4).map((p) => `${p.name} ${f(p.ratio)} (before ${f(p.preRmspe)})`).join('; ')}`);
