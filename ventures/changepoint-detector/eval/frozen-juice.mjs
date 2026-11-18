// A real monthly price series with a measured cause: Florida orange-juice futures prices, Jan 1950 - Dec 2000
// (data/frozen-juice.csv, AER::FrozenJuice from Stock and Watson), deflated by the producer price index, in logs.
// `fdd` is the month's count of freezing degree days in Orlando: the documented shocks are the months with a large fdd.
// Question: do the changes the detector reports sit on freeze months (within 2 months), and how many freezes does it find?
// usage: node eval/frozen-juice.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/frozen-juice.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => Math.log(+r[1] / +r[2])), fdd = rows.map((r) => +r[3]);
const BIG = 19; // freeze months with fdd >= 19: 1958-01 1963-01 1970-01 1977-02 1981-02 1984-01 1985-02 1990-01
const freezes = fdd.map((f, i) => (f >= BIG ? i : -1)).filter((i) => i >= 0);
console.log(`n ${values.length}; freeze months (fdd >= ${BIG}): ${freezes.map((i) => labels[i]).join(' ')}`);
for (const [name, opt] of [['mean', { model: 'mean' }], ['mean --ar1', { model: 'mean', ar1: true }], ['meanvar', { model: 'meanvar' }]]) {
  const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
  const idx = cps.map((c) => labels.indexOf(c.label));
  const near = idx.filter((i) => freezes.some((f) => Math.abs(f - i) <= 2)).length;
  const found = freezes.filter((f) => idx.some((i) => Math.abs(f - i) <= 2)).length;
  console.log(`${name}: ${cps.length} changes, ${near} within 2 months of a big freeze, ${found} of ${freezes.length} big freezes found`);
}
