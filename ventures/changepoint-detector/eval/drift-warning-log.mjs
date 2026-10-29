// Shape or shock, third try: take logs, then fit an ordinary additive season. A growing amplitude (airline, UK gas, J&J) becomes a fixed one,
// so its steps should vanish; a real shock (UK driver deaths 1973) should keep its steps.
// Prints, per series and trend option, the steps inside the first two-cycle window the drift fit finds on the raw series, and the steps
// the drift fit on the logged series puts near that window.
// usage: node eval/drift-warning-log.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const SERIES = [['airline (growing season)', 'airline-passengers.csv', 12], ['UK gas (growing season)', 'uk-gas.csv', 4], ['J&J (growing season)', 'johnson-johnson.csv', 4], ['UK driver deaths (1973 shock)', 'uk-driver-deaths.csv', 12]];
for (const [name, file, period] of SERIES) {
  const rows = readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','));
  const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[r.length - 1]), logv = raw.map(Math.log);
  for (const trend of [undefined, 'bend']) {
    const d = analyze({ values: raw, labels, period, drift: true, trend });
    let l;
    try { l = analyze({ values: logv, labels, period, drift: true, trend }); } catch (e) { console.log(`${name.padEnd(32)} ${(trend || 'no trend').padEnd(8)} log failed: ${e.message}`); continue; }
    const dc = d.pelt.changepoints, lc = l.pelt.changepoints;
    let win = 'none';
    if (d.driftWarning) {
      const k = dc.findIndex((x, j) => j + 2 < dc.length && dc[j + 2].index - x.index <= 2 * period);
      const lo = dc[k].index, hi = lo + 2 * period;
      win = `${dc.filter((x) => x.index >= lo && x.index <= hi).length} steps -> ${lc.filter((x) => x.index >= lo - period && x.index <= hi + period).length} log steps near it`;
    }
    console.log(`${name.padEnd(32)} ${(trend || 'no trend').padEnd(8)} raw warns ${d.driftWarning ? 'yes' : 'no '} steps ${dc.length}  log warns ${l.driftWarning ? 'yes' : 'no '} steps ${lc.length}  window: ${win}`);
  }
}
