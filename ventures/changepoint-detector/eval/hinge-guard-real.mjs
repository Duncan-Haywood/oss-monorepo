// The two guards of hinge-test.mjs on real series, as pre-registered in eval/hinge-guard-prereg-2026-11-15.md.
// usage: node eval/hinge-guard-real.mjs   (output: eval/hinge-guard-real.out.txt)
import { readFileSync } from 'node:fs';
import { hingeTest } from '../hinge-test.mjs';
const load = (f) => { const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
function show(name, { labels, x }) {
  for (const guard of ['line', 'hinge']) {
    const h = hingeTest(x, { reps: 999, seed: 1, guard });
    if (h.refused) { console.log(`${name} [${guard}]: REFUSED (${h.reason})`); continue; }
    console.log(`${name} [${guard}]: n ${h.n}, knot ${labels[h.index]}, F ${h.f.toFixed(1)} (bar ${h.bar95.toFixed(1)}), p ${h.p.toFixed(3)}, rho ${h.rho.toFixed(2)} (line ${h.rhoLine.toFixed(2)}, hinge ${h.rhoHinge.toFixed(2)}), slope ${(h.slopeBefore * 100).toFixed(2)} -> ${(h.slopeAfter * 100).toFixed(2)} per 100 steps`);
  }
}
const gcag = load('global-temp-annual.csv');
const from = (s, y) => { const i = s.labels.indexOf(y); return { labels: s.labels.slice(i), x: s.x.slice(i) }; };
show('GCAG 1930-2024', from(gcag, '1930'));
show('GCAG 1880-2024', gcag);
show('GISTEMP 1880-2024', load('gistemp-annual.csv'));
show('GCAG 1850-2024', load('gcag-annual-1850.csv'));
const logOf = (s) => ({ labels: s.labels, x: s.x.map(Math.log) });
show('log US real GDP', logOf(load('us-real-gdp.csv')));
show('log US labour productivity', logOf(load('us-labor-productivity.csv')));
