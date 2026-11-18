// Real series of eval/two-hinge-prereg-2026-11-16.md, with the shipped one-hinge result beside each.
// usage: node eval/two-hinge-real.mjs
import { readFileSync } from 'node:fs';
import { twoHingeTest } from '../two-hinge.mjs';
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
const p3 = (v) => v.toPrecision(3);
const two = (h, labels) => h.refused
  ? `refused (line rho ${h.rhoLine?.toFixed(2)}, two-hinge rho ${h.rhoTwo?.toFixed(2)}${h.cutBar ? `, cut bar ${h.cutBar.toFixed(2)}` : ''})`
  : `knots ${labels[h.index1]} and ${labels[h.index2]}, F ${h.f.toFixed(1)} (bar ${h.bar95.toFixed(1)}), p ${h.p.toFixed(3)}, rho ${h.rho.toFixed(2)}${h.admittedByCut ? ` (admitted by the cut: line ${h.rhoLine.toFixed(2)}, two ${h.rhoTwo.toFixed(2)}, bar ${h.cutBar.toFixed(2)})` : ''}, slopes ${h.slopes.map(p3).join(' -> ')} per step`;
const one = (h, labels) => h.refused ? `refused (line ${h.rhoLine?.toFixed(2)}, hinge ${h.rhoHinge?.toFixed(2)})` : `knot ${labels[h.index]}, p ${h.p.toFixed(3)}`;
function show(name, { labels, x }, predicted) {
  const a = twoHingeTest(x, { reps: 999, seed: 1 }), b = hingeTest(x, { reps: 999, seed: 1 });
  console.log(`${name} (${labels[0]}-${labels[labels.length - 1]}, n ${x.length})\n  two hinges: ${two(a, labels)}\n  one hinge:  ${one(b, labels)}\n  predicted:  ${predicted}`);
}
show('R1 Australian gas, annual totals', annual(load('au-gas.csv'), 12), 'refused');
show('R2 US electricity, annual totals', annual(load('us-electricity.csv'), 12), 'refused');
show('R3 US female murder rate', load('us-female-murder-rate.csv'), 'tested, p <= 0.05, knots in 1958-1975 and 1985-1998');
show('R4 Canada fertility', load('canada-fertility.csv'), 'refused');
show('C Lake Huron', load('lake-huron.csv'), 'refused or p > 0.05');
show('C Michigan-Huron', load('michigan-huron.csv'), 'refused or p > 0.05');
show('G GCAG 1880-2024', load('global-temp-annual.csv'), 'tested, p <= 0.05, one knot in 1965-1985');
show('reported: CO2 annual means', from(annual(load('co2-mauna-loa.csv'), 12, true), '1959'), 'none');
show('reported: Nile', load('nile.csv'), 'none');
