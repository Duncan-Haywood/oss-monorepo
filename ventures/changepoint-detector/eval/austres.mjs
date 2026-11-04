// A real smooth series with no documented regime change: Australian residents, quarterly, 1971 Q2 to 1993 Q2
// (data/austres.csv, R's datasets::austres, thousands), in logs. Population grows steadily; nothing is known to have
// "changed" in the way a step detector means. How many changes does each model report? A negative result, listed, not scored.
// usage: node eval/austres.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/austres.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => Math.log(+r[1]));
console.log(`n ${values.length}, ${labels[0]} to ${labels[labels.length - 1]}, natural logs`);
for (const [name, opt] of [['trend', { model: 'trend' }], ['mean (level only)', { model: 'mean' }], ['mean, ar1 auto', { model: 'mean', ar1: 'auto' }]]) {
  const a = analyze({ values, labels, ...opt });
  console.log(`${name}: ${a.pelt.changepoints.length} change(s)${a.cycleWarning ? ', cycleWarning' : ''}${a.rangeWarning ? ', rangeWarning' : ''}${a.driftWarning ? ', driftWarning' : ''}`);
}
