// The Great Moderation on a second, monthly series: annualised growth of US industrial production, 1947-02 to 2004-12.
// usage: node eval/ip-growth.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-ip-growth.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const values = rows.map((r) => +r[1]);
const labels = rows.map((r) => r[0]);
const cases = [['meanvar', { model: 'meanvar' }], ['meanvar --dispersion', { model: 'meanvar', dispersion: true }], ['meanvar --robust, min-segment 24', { model: 'meanvar', robust: true, minSegment: 24 }]];
for (const [name, opt] of cases) {
  const r = analyze({ values, labels, ...opt });
  const cps = r.pelt.changepoints;
  console.log(`${name}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
}
