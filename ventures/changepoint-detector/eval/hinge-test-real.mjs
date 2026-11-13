// The level hinge test (hinge-test.mjs) on real series, as pre-registered in eval/hinge-test-prereg-2026-11-13.md.
// usage: node eval/hinge-test-real.mjs   (output: eval/hinge-test-real.out.txt)
import { readFileSync } from 'node:fs';
import { hingeTest } from '../hinge-test.mjs';
import { slopeBreakPValue } from '../slope-breaks.mjs';
const load = (f) => { const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
const OPT = { reps: 999, seed: 1 };
function show(name, { labels, x }, extra = '') {
  const h = hingeTest(x, OPT);
  if (h.refused) { console.log(`${name}: REFUSED (${h.reason})${extra}`); return h; }
  const d = slopeBreakPValue(x, OPT);
  console.log(`${name}: n ${h.n}, knot ${labels[h.index]}, F ${h.f.toFixed(1)} (bootstrap bar ${h.bar95.toFixed(1)}), p ${h.p.toFixed(3)}, rho ${h.rho.toFixed(2)} (line ${h.rhoLine.toFixed(2)}), slope ${(h.slopeBefore * 100).toFixed(2)} -> ${(h.slopeAfter * 100).toFixed(2)} per 100 steps; differences test p ${d.p.toFixed(3)}${extra}`);
  return h;
}
const gcag = load('global-temp-annual.csv');
show('A. GCAG 1880-2024', gcag);
show('B. GISTEMP 1880-2024', load('gistemp-annual.csv'));
show('C. GCAG 1850-2024', load('gcag-annual-1850.csv'));
const logOf = (s) => ({ labels: s.labels, x: s.x.map(Math.log) });
show('D. log US real GDP', logOf(load('us-real-gdp.csv')));
show('D. log US labour productivity', logOf(load('us-labor-productivity.csv')));
for (const from of ['1910', '1930']) {
  const i = gcag.labels.indexOf(from);
  show(`E. GCAG ${from}-2024`, { labels: gcag.labels.slice(i), x: gcag.x.slice(i) });
}
