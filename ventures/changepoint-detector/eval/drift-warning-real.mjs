// `driftWarning` (engine.mjs) on the real seasonal series in data/, with `drift: true`, raw and logged, with and without --trend bend.
// A warning is right when the steps are one changing seasonal shape; wrong when they are genuine regime changes.
// usage: node eval/drift-warning-real.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [
  ['airline passengers (season grows with level)', 'airline-passengers.csv', 12],
  ['UK gas (season grows with level)', 'uk-gas.csv', 4],
  ['Johnson & Johnson EPS (season grows with level)', 'johnson-johnson.csv', 4],
  ['UK driver deaths (fixed season; 1973 fuel-crisis dip and rebound, 1983 seat-belt law)', 'uk-driver-deaths.csv', 12],
  ['Nottingham temperatures (fixed season, no change)', 'nottem.csv', 12],
];
for (const [name, file, period] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[r.length - 1]);
  console.log(name);
  for (const [scale, v] of [['raw', raw], ['log', raw.map(Math.log)]]) {
    if (v.some((x) => !isFinite(x))) continue;
    for (const trend of [undefined, 'bend']) {
      const r = analyze({ values: v, labels, period, drift: true, trend });
      const cps = r.pelt.changepoints.map((c) => `${c.label}${c.shift > 0 ? '+' : '-'}`).join(' ');
      console.log(`  ${scale} ${(trend || 'no trend').padEnd(8)} steps ${String(r.pelt.changepoints.length).padStart(2)}  warning ${r.driftWarning ? 'yes' : 'no '}  ${cps}`);
    }
  }
}
