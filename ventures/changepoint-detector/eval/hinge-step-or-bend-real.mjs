// Real series of eval/hinge-step-or-bend-prereg-2026-11-15.md (bar R and predictions P1-P5).
// usage: node eval/hinge-step-or-bend-real.mjs   (output: eval/hinge-step-or-bend-real.out.txt)
import { readFileSync } from 'node:fs';
import { hingeTest, stepOrBend } from '../hinge-test.mjs';
const load = (f) => { const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
const from = (s, y) => { const i = s.labels.indexOf(y); return { labels: s.labels.slice(i), x: s.x.slice(i) }; };
// annual totals (or means) of a monthly or quarterly file, full years only
function annual(s, per, mean = false) {
  const by = new Map();
  s.labels.forEach((l, i) => { const y = l.slice(0, 4); if (!by.has(y)) by.set(y, []); by.get(y).push(s.x[i]); });
  const labels = [], x = [];
  for (const [y, v] of by) if (v.length === per) { labels.push(y); x.push(v.reduce((a, b) => a + b, 0) / (mean ? per : 1)); }
  return { labels, x };
}
function show(name, { labels, x }, predicted) {
  const h = hingeTest(x, { reps: 999, seed: 1 });
  if (h.refused) { console.log(`${name} (${labels[0]}-${labels[labels.length - 1]}, n ${x.length}): REFUSED (${h.reason}) | predicted: ${predicted}`); return; }
  const s = stepOrBend(x, h.rho), o = stepOrBend(x, 0);
  console.log(`${name} (${labels[0]}-${labels[labels.length - 1]}, n ${h.n}): knot ${labels[h.index]}, F ${h.f.toFixed(1)} (bar ${h.bar95.toFixed(1)}), p ${h.p.toFixed(3)}, rho ${h.rho.toFixed(2)}${h.admittedByCut ? ' (admitted by the cut)' : ''}, slope ${h.slopeBefore.toPrecision(3)} -> ${h.slopeAfter.toPrecision(3)} per step | step or bend: ${s.better} (best step after ${labels[s.stepIndex]}, size ${s.stepSize.toPrecision(3)}; step RSS / bend RSS ${s.ratio.toFixed(3)}; post hoc, OLS: ${o.better}, step after ${labels[o.stepIndex]}) | predicted: ${predicted}`);
}
console.log('Bar R');
show('Nile', load('nile.csv'), 'step, if tested');
const gcag = load('global-temp-annual.csv');
show('GCAG', gcag, 'bend');
show('GISTEMP', load('gistemp-annual.csv'), 'bend');
show('GCAG', load('gcag-annual-1850.csv'), 'bend');
show('GCAG', from(gcag, '1930'), 'bend');
console.log('\nPredictions');
show('P1 Australian gas, annual totals', annual(load('au-gas.csv'), 12), 'tested, p <= 0.05, knot 1966-1973, bend');
show('P2 US electricity, annual totals', annual(load('us-electricity.csv'), 12), 'tested, p <= 0.05, knot 1998-2008');
show('P3 US female murder rate', load('us-female-murder-rate.csv'), 'tested, p <= 0.05, knot 1975-1995, bend');
show('P4 Lake Huron', load('lake-huron.csv'), 'p > 0.05');
show('P5 UK gas, annual totals', annual(load('uk-gas.csv'), 4), 'refused (under 30 points)');
console.log('\nNo prediction');
show('Canada fertility', load('canada-fertility.csv'), 'none');
show('Michigan-Huron', load('michigan-huron.csv'), 'none');
const co2 = annual(load('co2-mauna-loa.csv'), 12, true);
show('CO2 annual means', from(co2, '1959'), 'none (a smooth acceleration)');
