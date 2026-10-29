// Can the cancellation of a drift warning's steps tell a changing seasonal shape from a real shock?
// For each real seasonal series in data/ where `driftWarning` fires, take the steps inside the first window of two cycles
// and print net/abs = (sum of shifts) / (sum of |shifts|): +-1 means one-directional, 0 means the steps cancel (dip and rebound).
// usage: node eval/drift-warning-shape.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [['airline (growing season)', 'airline-passengers.csv', 12], ['UK gas (growing season)', 'uk-gas.csv', 4], ['J&J (growing season)', 'johnson-johnson.csv', 4], ['UK driver deaths (1973 shock)', 'uk-driver-deaths.csv', 12]];
for (const [name, file, period] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[r.length - 1]);
  for (const [scale, v] of [['raw', raw], ['log', raw.map(Math.log)]]) for (const trend of [undefined, 'bend']) {
    const r = analyze({ values: v, labels, period, drift: true, trend });
    if (!r.driftWarning) continue;
    const c = r.pelt.changepoints, k = c.findIndex((x, j) => j + 2 < c.length && c[j + 2].index - x.index <= 2 * period);
    const w = c.filter((x) => x.index - c[k].index <= 2 * period);
    const net = w.reduce((a, x) => a + x.shift, 0), ab = w.reduce((a, x) => a + Math.abs(x.shift), 0);
    console.log(`${name.padEnd(32)} ${scale} ${(trend || 'no trend').padEnd(8)} steps ${w.length}  net/abs ${(net / ab).toFixed(2)}`);
  }
}
