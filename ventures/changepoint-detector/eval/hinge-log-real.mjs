// Real series of eval/hinge-log-prereg-2026-11-15.md (bars L and C), run through the shipped analyze() path that a
// user of `--log --hinge-test` reaches, with the levels result beside it. usage: node eval/hinge-log-real.mjs
import { readFileSync } from 'node:fs';
import { hingeTest } from '../hinge-test.mjs';
const load = (f) => { const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
const from = (s, y) => { const i = s.labels.indexOf(y); return { labels: s.labels.slice(i), x: s.x.slice(i) }; };
function annual(s, per, mean = false) {
  const by = new Map();
  s.labels.forEach((l, i) => { const y = l.slice(0, 4); if (!by.has(y)) by.set(y, []); by.get(y).push(s.x[i]); });
  const labels = [], x = [];
  for (const [y, v] of by) if (v.length === per) { labels.push(y); x.push(v.reduce((a, b) => a + b, 0) / (mean ? per : 1)); }
  return { labels, x };
}
const fmt = (h, labels) => h.refused
  ? `refused (line rho ${h.rhoLine?.toFixed(2)}, hinge rho ${h.rhoHinge?.toFixed(2)}${h.cutBar ? `, cut bar ${h.cutBar.toFixed(2)}` : ''})`
  : `knot ${labels[h.index]}, F ${h.f.toFixed(1)} (bar ${h.bar95.toFixed(1)}), p ${h.p.toFixed(3)}, rho ${h.rho.toFixed(2)}${h.admittedByCut ? ` (admitted by the cut: line ${h.rhoLine.toFixed(2)}, hinge ${h.rhoHinge.toFixed(2)}, bar ${h.cutBar.toFixed(2)})` : ''}, slope ${h.slopeBefore.toPrecision(3)} -> ${h.slopeAfter.toPrecision(3)} per year`;
function show(name, { labels, x }, predicted) {
  const lv = hingeTest(x, { reps: 999, seed: 1 }), lg = hingeTest(x.map(Math.log), { reps: 999, seed: 1 });
  console.log(`${name} (${labels[0]}-${labels[labels.length - 1]}, n ${x.length})\n  logs:   ${fmt(lg, labels)}\n  levels: ${fmt(lv, labels)}\n  predicted (logs): ${predicted}`);
}
console.log('Bar L');
show('L1 Australian gas, annual totals', annual(load('au-gas.csv'), 12), 'tested, p <= 0.05, knot 1966-1976, slope after below before');
show('L2 US electricity, annual totals', annual(load('us-electricity.csv'), 12), 'tested, p <= 0.05, knot 1998-2008, slope after below before');
console.log('\nBar C');
show('C Lake Huron', load('lake-huron.csv'), 'refused');
show('C Michigan-Huron', load('michigan-huron.csv'), 'refused');
show('C US female murder rate', load('us-female-murder-rate.csv'), 'refused');
console.log('\nReported, no bar');
show('CO2 annual means', from(annual(load('co2-mauna-loa.csv'), 12, true), '1959'), 'refused');
show('Canada fertility', load('canada-fertility.csv'), 'none');
