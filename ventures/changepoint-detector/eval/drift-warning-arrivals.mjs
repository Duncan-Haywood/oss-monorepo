// `driftWarning` on two more real seasonal series with documented shocks: quarterly short-term visitor arrivals to
// Australia from the US and from Japan, 1981Q1-2012Q3 (data/au-arrivals-*.csv). US: the 2001Q4 fall after 11 Sept and
// the 2003 Iraq-war/SARS dip; Japan: the 2003 SARS dip. Same cells as drift-warning-real.mjs.
// usage: node eval/drift-warning-arrivals.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [
  ['US arrivals (9/11 2001Q4, Iraq/SARS 2003)', 'au-arrivals-us.csv', 4],
  ['Japan arrivals (SARS 2003)', 'au-arrivals-japan.csv', 4],
];
for (const [name, file, period] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]);
  console.log(name);
  for (const [scale, v] of [['raw', raw], ['log', raw.map(Math.log)]]) {
    for (const trend of [undefined, 'bend']) {
      const r = analyze({ values: v, labels, period, drift: true, trend });
      const cps = r.pelt.changepoints.map((c) => `${c.label}${c.shift > 0 ? '+' : '-'}`).join(' ');
      console.log(`  ${scale} ${(trend || 'no trend').padEnd(8)} steps ${String(r.pelt.changepoints.length).padStart(2)}  warning ${r.driftWarning ? 'yes' : 'no '}  ${cps}`);
    }
  }
}
