// Two more real smooth series with no documented step: Box-Jenkins company sales (150 values, data/bjsales.csv, R's
// datasets::BJsales) and US census population 1790-1970 (19 values, data/uspop.csv, R's datasets::uspop), both in logs.
// How many changes does each model report? A negative-result pair like austres, listed, not scored.
// usage: node eval/smooth-pair.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
for (const [file, title] of [['bjsales', 'BJsales'], ['uspop', 'uspop']]) {
  const rows = readFileSync(new URL(`../data/${file}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const labels = rows.map((r) => r[0]), values = rows.map((r) => Math.log(+r[1]));
  console.log(`${title}: n ${values.length}, ${labels[0]} to ${labels[labels.length - 1]}, natural logs`);
  for (const [name, opt] of [['trend', { model: 'trend' }], ['mean (level only)', { model: 'mean' }], ['mean, ar1 auto', { model: 'mean', ar1: 'auto' }], ['trend, noise-floor 1', { model: 'trend', noiseFloor: 1 }]]) {
    const a = analyze({ values, labels, ...opt });
    console.log(`  ${name}: ${a.pelt.changepoints.length} change(s)${a.cycleWarning ? ', cycleWarning' : ''}${a.rangeWarning ? ', rangeWarning' : ''}${a.driftWarning ? ', driftWarning' : ''}`);
  }
}
