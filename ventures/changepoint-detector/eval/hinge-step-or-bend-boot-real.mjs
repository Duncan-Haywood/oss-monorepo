// Real bar R and the reported real series of eval/hinge-step-or-bend-boot-prereg-2026-11-15.md.
// usage: node eval/hinge-step-or-bend-boot-real.mjs   (output: eval/hinge-step-or-bend-boot-real.out.txt)
import { readFileSync } from 'node:fs';
import { stepOrBendTest } from '../hinge-test.mjs';
const load = (f) => { const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')); return { labels: rows.map((r) => r[0]), x: rows.map((r) => +r[1]) }; };
const from = (s, y) => { const i = s.labels.indexOf(y); return { labels: s.labels.slice(i), x: s.x.slice(i) }; };
function annual(s, per, mean = false) {
  const by = new Map();
  s.labels.forEach((l, i) => { const y = l.slice(0, 4); if (!by.has(y)) by.set(y, []); by.get(y).push(s.x[i]); });
  const labels = [], x = [];
  for (const [y, v] of by) if (v.length === per) { labels.push(y); x.push(v.reduce((a, b) => a + b, 0) / (mean ? per : 1)); }
  return { labels, x };
}
function show(name, { labels, x }, predicted) {
  const s = stepOrBendTest(x, { reps: 999, seed: 1 });
  const span = `${labels[0]}-${labels[labels.length - 1]}, n ${x.length}`;
  if (s.refused) { console.log(`${name} (${span}): REFUSED (${s.reason}) | predicted: ${predicted}`); return; }
  console.log(`${name} (${span}): ${s.call} (pStep ${s.pStep.toFixed(3)}, pBend ${s.pBend.toFixed(3)}; log(step RSS / bend RSS) ${s.logRatio.toFixed(3)}; rho ${s.rho.toFixed(2)}; best step after ${labels[s.stepIndex]}, size ${s.stepSize.toPrecision(3)}; best bend at ${labels[s.bendIndex]}) | predicted: ${predicted}`);
}
console.log('Bar R');
show('Nile', load('nile.csv'), 'step');
const gcag = load('global-temp-annual.csv');
show('GCAG', gcag, 'not step');
show('GISTEMP', load('gistemp-annual.csv'), 'not step');
show('GCAG', load('gcag-annual-1850.csv'), 'not step');
console.log('\nReported, no prediction');
show('GCAG', from(gcag, '1930'), 'none');
show('Australian gas, annual totals', annual(load('au-gas.csv'), 12), 'none');
show('US electricity, annual totals', annual(load('us-electricity.csv'), 12), 'none');
show('US female murder rate', load('us-female-murder-rate.csv'), 'none');
show('Lake Huron', load('lake-huron.csv'), 'none');
show('Canada fertility', load('canada-fertility.csv'), 'none');
show('Michigan-Huron', load('michigan-huron.csv'), 'none');
show('CO2 annual means', from(annual(load('co2-mauna-loa.csv'), 12, true), '1959'), 'none');
