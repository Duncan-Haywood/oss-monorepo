// `driftWarning` with and without --ar1 (trend bend) on the real series in data/: does --ar1 keep the warning on a real
// drifting shape (airline, UK gas, J&J) and on the 1973 shock, and stay silent on the fixed-season Nottingham series?
// usage: node eval/drift-warning-real-ar1.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [
  ['airline passengers (season grows with level)', 'airline-passengers.csv', 12],
  ['UK gas (season grows with level)', 'uk-gas.csv', 4],
  ['Johnson & Johnson EPS (season grows with level)', 'johnson-johnson.csv', 4],
  ['UK driver deaths (fixed season; 1973 shock)', 'uk-driver-deaths.csv', 12],
  ['Nottingham temperatures (fixed season, no change)', 'nottem.csv', 12],
];
for (const [name, file, period] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[r.length - 1]);
  console.log(name);
  for (const [scale, v] of [['raw', raw], ['log', raw.map(Math.log)]]) {
    if (v.some((x) => !isFinite(x))) continue;
    for (const ar1 of [false, true]) {
      const r = analyze({ values: v, labels, period, drift: true, trend: 'bend', ar1 });
      console.log(`  ${scale} ${ar1 ? 'ar1' : 'raw'} steps ${String(r.pelt.changepoints.length).padStart(2)}  warning ${r.driftWarning ? 'yes' : 'no '}`);
    }
  }
}
