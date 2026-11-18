// Holiday factor on real daily US births (data/us-births-daily.csv, CDC counts, 1978-1988): births on federal holidays
// run about 15% under other days, and the yearly swing is mild, unlike the bikeshare series.
// usage: node eval/holiday-births.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-births-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
function run(name, win) {
  const values = win.map((r) => +r[1]), labels = win.map((r) => r[0]);
  const hol = win.filter((r) => r[2] === '1').map((r) => r[0]);
  const base = { values, labels, model: 'poisson', period: 7, overdispersion: 'nb' };
  const a = analyze(base), b = analyze({ ...base, holidays: hol });
  const na = a.pelt.changepoints.length, nb = b.pelt.changepoints.length;
  console.log(`${name}: ${win.length} days, ${hol.length} holidays: changes ${na} -> ${nb}, factor ${b.holidays ? b.holidays.factor.toFixed(3) : 'n/a'}`);
  return [na, nb];
}
let ta = 0, tb = 0;
for (let y = 1978; y <= 1988; y++) {
  const [na, nb] = run(String(y), rows.filter((r) => r[0].startsWith(y + '-')));
  ta += na; tb += nb;
}
console.log(`per-year totals: ${ta} -> ${tb}`);
run('1978-1988', rows);
