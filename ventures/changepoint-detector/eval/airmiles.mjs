// A real annual series with one documented regime change and little else: US commercial airline revenue passenger
// miles, 1937-1960 (data/airmiles.csv, R's datasets::airmiles), in logs. Growth runs at about 25% a year to 1945, then
// the post-war civil boom. Does the trend model report one change, and does it sit at the end of the war?
// Level-only models split a smooth exponential into 7 steps; that is listed, not scored.
// usage: node eval/airmiles.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/airmiles.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => Math.log(+r[1]));
console.log(`n ${values.length}, ${labels[0]} to ${labels[labels.length - 1]}, natural logs`);
for (const [name, opt] of [['trend', { model: 'trend' }], ['mean (level only)', { model: 'mean' }]]) {
  const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
  console.log(`\n${name}: ${cps.length} change(s)`);
  for (const c of cps) console.log(`  ${c.label}  range95 ${c.range95 ? `${c.range95.from} to ${c.range95.to}` : 'none'}`);
}
